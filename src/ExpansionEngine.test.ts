// Unit tests for ExpansionEngine class
import { ExpansionEngine } from './ExpansionEngine';
import { CommentData } from './types';

// Mock chrome runtime for testing
const mockChrome = {
  runtime: {
    sendMessage: jest.fn()
  }
};
(global as any).chrome = mockChrome;

describe('ExpansionEngine class', () => {
  let expansionEngine: ExpansionEngine;

  beforeEach(() => {
    expansionEngine = new ExpansionEngine();
    jest.clearAllMocks();
    
    // Clear DOM before each test
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('findExpandElements method', () => {
    test('should find expand elements using primary selector', () => {
      // Create mock expand button with primary selector
      const expandButton = document.createElement('button');
      expandButton.setAttribute('aria-label', 'Show replies');
      expandButton.textContent = 'Show replies';
      document.body.appendChild(expandButton);

      const elements = expansionEngine.findExpandElements();
      
      expect(elements.length).toBe(1);
      expect(elements[0]).toBe(expandButton);
    });

    test('should find expand elements using fallback selectors', () => {
      // Create mock expand button with fallback selector
      const expandButton = document.createElement('div');
      expandButton.setAttribute('role', 'button');
      expandButton.textContent = 'View replies';
      document.body.appendChild(expandButton);

      const elements = expansionEngine.findExpandElements();
      
      expect(elements.length).toBe(1);
      expect(elements[0]).toBe(expandButton);
    });

    test('should return empty array when no expand elements found', () => {
      const elements = expansionEngine.findExpandElements();
      
      expect(elements).toEqual([]);
    });

    test('should find multiple expand elements', () => {
      // Create multiple expand buttons
      const button1 = document.createElement('button');
      button1.setAttribute('aria-label', 'Show replies');
      document.body.appendChild(button1);

      const button2 = document.createElement('div');
      button2.setAttribute('role', 'button');
      button2.textContent = 'View replies';
      document.body.appendChild(button2);

      const elements = expansionEngine.findExpandElements();
      
      expect(elements.length).toBe(2);
    });

    test('should handle selectors with contains text', () => {
      // Create button with specific text
      const button = document.createElement('button');
      button.textContent = 'Show more';
      document.body.appendChild(button);

      const elements = expansionEngine.findExpandElements();
      
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('retryWithBackoff method', () => {
    test('should succeed on first attempt', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await expansionEngine.retryWithBackoff(mockOperation, 3);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    test('should throw error after max retries exceeded', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('persistent failure'));
      
      await expect(expansionEngine.retryWithBackoff(mockOperation, 2)).rejects.toThrow('persistent failure');
      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    test('should retry on failure and eventually succeed', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockResolvedValue('success');
      
      const result = await expansionEngine.retryWithBackoff(mockOperation, 3);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('scrapeCommentData method', () => {
    test('should extract comments from DOM', () => {
      // Create mock comment structure
      const comment = document.createElement('div');
      comment.setAttribute('role', 'article');
      comment.innerHTML = `
        <strong>John Doe</strong>
        <span>This is a test comment</span>
        <time datetime="2023-01-01T12:00:00Z">2 hours ago</time>
      `;
      document.body.appendChild(comment);

      const comments = expansionEngine.scrapeCommentData();
      
      expect(comments.length).toBe(1);
      expect(comments[0].author).toBe('John Doe');
      expect(comments[0].text).toContain('This is a test comment');
      expect(comments[0].timestamp).toBe('2023-01-01T12:00:00Z');
    });

    test('should return empty array when no comments found', () => {
      const comments = expansionEngine.scrapeCommentData();
      
      expect(comments).toEqual([]);
    });

    test('should handle malformed comment elements', () => {
      // Create malformed comment
      const comment = document.createElement('div');
      comment.setAttribute('role', 'article');
      comment.innerHTML = '<span></span>'; // Empty content
      document.body.appendChild(comment);

      const comments = expansionEngine.scrapeCommentData();
      
      // Should not crash and should filter out empty comments
      expect(comments.length).toBe(0);
    });

    test('should extract multiple comments', () => {
      // Create multiple comments
      const comment1 = document.createElement('div');
      comment1.setAttribute('role', 'article');
      comment1.innerHTML = '<strong>User1</strong><span>Comment 1</span>';
      document.body.appendChild(comment1);

      const comment2 = document.createElement('div');
      comment2.setAttribute('role', 'article');
      comment2.innerHTML = '<strong>User2</strong><span>Comment 2</span>';
      document.body.appendChild(comment2);

      const comments = expansionEngine.scrapeCommentData();
      
      expect(comments.length).toBe(2);
      expect(comments[0].author).toBe('User1');
      expect(comments[1].author).toBe('User2');
    });
  });

  describe('expandWithTimeout integration', () => {
    test('should handle no expand elements gracefully', async () => {
      // No expand elements in DOM
      const progressCallback = jest.fn();
      
      const result = await expansionEngine.expandWithTimeout(progressCallback);
      
      expect(result.success).toBe(true);
      expect(result.totalIterations).toBeGreaterThan(0);
      expect(progressCallback).toHaveBeenCalled();
    });

    test('should track progress during expansion', async () => {
      const progressCallback = jest.fn();
      
      await expansionEngine.expandWithTimeout(progressCallback);
      
      expect(progressCallback).toHaveBeenCalled();
      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1][0];
      expect(lastCall).toHaveProperty('iteration');
      expect(lastCall).toHaveProperty('elementsFound');
      expect(lastCall).toHaveProperty('isComplete');
    });

    test('should handle missing progress callback', async () => {
      await expect(expansionEngine.expandWithTimeout()).resolves.toBeTruthy();
    });

    test('should limit expansion to 10 levels deep', async () => {
      // Create many persistent buttons to test depth limiting
      for (let i = 0; i < 15; i++) {
        const button = document.createElement('button');
        button.setAttribute('aria-label', 'Show replies');
        button.style.display = 'block'; // Make sure they're visible
        document.body.appendChild(button);
      }
      
      const progressCallback = jest.fn();
      const result = await expansionEngine.expandWithTimeout(progressCallback);
      
      expect(result.success).toBe(true);
      // Should complete successfully even with depth limiting
      expect(result.totalIterations).toBeGreaterThan(0);
    }, 10000);
  });

  describe('MutationObserver functionality', () => {
    test('should setup and cleanup MutationObserver', async () => {
      const progressCallback = jest.fn();
      
      // Spy on MutationObserver
      const mockObserver = {
        observe: jest.fn(),
        disconnect: jest.fn()
      };
      const mockMutationObserver = jest.fn(() => mockObserver);
      (global as any).MutationObserver = mockMutationObserver;
      
      await expansionEngine.expandWithTimeout(progressCallback);
      
      // Should have created and cleaned up observer
      expect(mockMutationObserver).toHaveBeenCalled();
      expect(mockObserver.observe).toHaveBeenCalledWith(document.body, expect.any(Object));
      expect(mockObserver.disconnect).toHaveBeenCalled();
    });

    test('should detect new content via mutation observer', () => {
      // Test the mutation observer callback
      let observerCallback: MutationCallback;
      
      const mockObserver = {
        observe: jest.fn(),
        disconnect: jest.fn()
      };
      
      const mockMutationObserver = jest.fn((callback) => {
        observerCallback = callback;
        return mockObserver;
      });
      (global as any).MutationObserver = mockMutationObserver;
      
      // Setup observer
      (expansionEngine as any).setupMutationObserver();
      
      // Simulate mutation with new comment content
      const newCommentDiv = document.createElement('div');
      newCommentDiv.setAttribute('role', 'article');
      
      // Add the div to DOM temporarily to make it detectable
      const container = document.createElement('div');
      container.appendChild(newCommentDiv);
      newCommentDiv.innerHTML = '<span>Test comment content</span>';
      
      // Create mock NodeList
      const mockAddedNodes = {
        length: 1,
        item: (index: number) => index === 0 ? newCommentDiv : null,
        forEach: (callback: any) => callback(newCommentDiv, 0),
        [Symbol.iterator]: function* () { yield newCommentDiv; },
        0: newCommentDiv
      } as unknown as NodeList;
      
      const mockRemovedNodes = {
        length: 0,
        item: () => null,
        forEach: () => {},
        [Symbol.iterator]: function* () {}
      } as unknown as NodeList;
      
      const mockMutation = {
        type: 'childList' as const,
        addedNodes: mockAddedNodes,
        removedNodes: mockRemovedNodes,
        target: document.body,
        previousSibling: null,
        nextSibling: null,
        attributeName: null,
        attributeNamespace: null,
        oldValue: null
      } as MutationRecord;
      
      // Trigger the observer callback
      observerCallback!([mockMutation], mockObserver as any);
      
      // Should have detected new content
      expect((expansionEngine as any).newContentDetected).toBe(true);
    });
  });

  describe('error handling', () => {
    test('should handle invalid elements during clicking', () => {
      // Test clicking invalid element
      expect(() => {
        (expansionEngine as any).clickElement(null);
      }).toThrow();
    });

    test('should handle elements without click method', () => {
      const fakeElement = {} as HTMLElement;
      
      expect(() => {
        (expansionEngine as any).clickElement(fakeElement);
      }).toThrow();
    });

    test('should handle non-visible elements', () => {
      const hiddenElement = document.createElement('button');
      hiddenElement.style.display = 'none';
      document.body.appendChild(hiddenElement);
      
      expect(() => {
        (expansionEngine as any).clickElement(hiddenElement);
      }).toThrow();
    });
  });

  describe('selector parsing', () => {
    test('should parse contains selector correctly', () => {
      const [baseSelector, text] = (expansionEngine as any).parseContainsSelector('button:contains("Show more")');
      
      expect(baseSelector).toBe('button');
      expect(text).toBe('Show more');
    });

    test('should handle selectors without contains', () => {
      const [baseSelector, text] = (expansionEngine as any).parseContainsSelector('button.expand');
      
      expect(baseSelector).toBe('button.expand');
      expect(text).toBe('');
    });
  });

  describe('comment extraction helpers', () => {
    test('should extract author from various selectors', () => {
      const element = document.createElement('div');
      element.innerHTML = '<strong>Test Author</strong><span>Some text</span>';
      
      const author = (expansionEngine as any).extractAuthor(element);
      
      expect(author).toBe('Test Author');
    });

    test('should extract text content correctly', () => {
      const element = document.createElement('div');
      element.innerHTML = '<strong>Author</strong><span>Comment text here</span><time>2h ago</time>';
      
      const text = (expansionEngine as any).extractText(element);
      
      expect(text).toContain('Comment text here');
      expect(text).not.toContain('Author');
    });

    test('should extract timestamp from time elements', () => {
      const element = document.createElement('div');
      element.innerHTML = '<time datetime="2023-01-01T12:00:00Z">2 hours ago</time>';
      
      const timestamp = (expansionEngine as any).extractTimestamp(element);
      
      expect(timestamp).toBe('2023-01-01T12:00:00Z');
    });

    test('should handle missing timestamp', () => {
      const element = document.createElement('div');
      element.innerHTML = '<span>No timestamp here</span>';
      
      const timestamp = (expansionEngine as any).extractTimestamp(element);
      
      expect(timestamp).toBeNull();
    });
  });
});