// Unit tests for OverlayManager class
import { OverlayManager } from './OverlayManager';
import { CommentData } from './types';

// Mock the styles module
jest.mock('./styles', () => ({
  injectOverlayStyles: jest.fn(),
  removeOverlayStyles: jest.fn()
}));

describe('OverlayManager class', () => {
  let overlayManager: OverlayManager;
  let mockComments: CommentData[];

  beforeEach(() => {
    overlayManager = new OverlayManager();
    mockComments = [
      {
        id: 'comment-1',
        author: 'user1',
        text: 'Test comment 1',
        timestamp: '2023-01-01T00:00:00Z',
        replies: [
          {
            id: 'comment-2',
            author: 'user2',
            text: 'Reply to comment 1',
            timestamp: '2023-01-01T01:00:00Z',
            replies: []
          }
        ]
      }
    ];

    // Clear DOM before each test
    document.body.innerHTML = '';
  });

  afterEach(() => {
    // Clean up any created overlays
    const existingOverlay = document.getElementById('tf-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    document.body.innerHTML = '';
  });

  describe('createOverlay method', () => {
    test('should create overlay DOM structure', () => {
      const overlay = overlayManager.createOverlay();
      
      expect(overlay).toBeTruthy();
      expect(overlay.id).toBe('tf-overlay');
      expect(overlay.classList.contains('tf-overlay')).toBe(true);
    });

    test('should include backdrop element', () => {
      const overlay = overlayManager.createOverlay();
      
      const backdrop = overlay.querySelector('.tf-overlay-backdrop');
      expect(backdrop).toBeTruthy();
    });

    test('should include content panel', () => {
      const overlay = overlayManager.createOverlay();
      
      const contentPanel = overlay.querySelector('.tf-overlay-content');
      expect(contentPanel).toBeTruthy();
    });

    test('should include close button', () => {
      const overlay = overlayManager.createOverlay();
      
      const closeButton = overlay.querySelector('.tf-close-button');
      expect(closeButton).toBeTruthy();
      expect(closeButton?.textContent).toBe('×');
    });

    test('should include loading container initially', () => {
      const overlay = overlayManager.createOverlay();
      
      const loadingContainer = overlay.querySelector('.tf-loading-container');
      expect(loadingContainer).toBeTruthy();
    });

    test('should include comments container', () => {
      const overlay = overlayManager.createOverlay();
      
      const commentsContainer = overlay.querySelector('.tf-comments-container');
      expect(commentsContainer).toBeTruthy();
      expect((commentsContainer as HTMLElement)?.style.display).toBe('none'); // Initially hidden
    });
  });

  describe('showOverlay method', () => {
    test('should inject overlay into document body', () => {
      overlayManager.createOverlay();
      overlayManager.showOverlay();
      
      const overlayInDOM = document.getElementById('tf-overlay');
      expect(overlayInDOM).toBeTruthy();
      expect(document.body.contains(overlayInDOM)).toBe(true);
    });

    test('should preserve scroll position', () => {
      // Mock window.pageYOffset
      Object.defineProperty(window, 'pageYOffset', {
        value: 500,
        writable: true
      });

      overlayManager.createOverlay();
      overlayManager.showOverlay();
      
      // Should store original scroll position for restoration
      expect((overlayManager as any).originalScrollY).toBe(500);
    });

    test('should inject overlay styles', () => {
      const { injectOverlayStyles } = require('./styles');
      
      overlayManager.createOverlay();
      overlayManager.showOverlay();
      
      expect(injectOverlayStyles).toHaveBeenCalled();
    });
  });

  describe('hideOverlay method', () => {
    test('should remove overlay from DOM', () => {
      overlayManager.createOverlay();
      overlayManager.showOverlay();
      
      expect(document.getElementById('tf-overlay')).toBeTruthy();
      
      overlayManager.hideOverlay();
      
      expect(document.getElementById('tf-overlay')).toBeFalsy();
    });

    test('should restore scroll position', () => {
      // Mock scroll methods
      const mockScrollTo = jest.fn();
      Object.defineProperty(window, 'scrollTo', {
        value: mockScrollTo,
        writable: true
      });
      
      Object.defineProperty(window, 'pageYOffset', {
        value: 300,
        writable: true
      });

      overlayManager.createOverlay();
      overlayManager.showOverlay();
      overlayManager.hideOverlay();
      
      expect(mockScrollTo).toHaveBeenCalledWith(0, 300);
    });

    test('should remove overlay styles', () => {
      const { removeOverlayStyles } = require('./styles');
      
      overlayManager.createOverlay();
      overlayManager.showOverlay();
      overlayManager.hideOverlay();
      
      expect(removeOverlayStyles).toHaveBeenCalled();
    });
  });

  describe('setLoading method', () => {
    test('should show loading spinner when loading is true', () => {
      overlayManager.createOverlay();
      overlayManager.setLoading(true);
      
      const overlay = document.getElementById('tf-overlay') || overlayManager.getOverlayElement();
      const loadingContainer = overlay?.querySelector('.tf-loading-container') as HTMLElement;
      const commentsContainer = overlay?.querySelector('.tf-comments-container') as HTMLElement;
      
      expect(loadingContainer?.style.display).not.toBe('none');
      expect(commentsContainer?.style.display).toBe('none');
    });

    test('should hide loading spinner when loading is false', () => {
      overlayManager.createOverlay();
      overlayManager.setLoading(false);
      
      const overlay = document.getElementById('tf-overlay') || overlayManager.getOverlayElement();
      const loadingContainer = overlay?.querySelector('.tf-loading-container') as HTMLElement;
      const commentsContainer = overlay?.querySelector('.tf-comments-container') as HTMLElement;
      
      expect(loadingContainer?.style.display).toBe('none');
      expect(commentsContainer?.style.display).not.toBe('none');
    });

    test('should update loading message', () => {
      overlayManager.createOverlay();
      overlayManager.setLoading(true, 'Custom loading message...');
      
      const overlay = document.getElementById('tf-overlay') || overlayManager.getOverlayElement();
      const loadingText = overlay?.querySelector('.tf-loading-text');
      
      expect(loadingText?.textContent).toBe('Custom loading message...');
    });
  });

  describe('attachEventListeners method', () => {
    test('should attach close button event listener', () => {
      const overlay = overlayManager.createOverlay();
      overlayManager.attachEventListeners();
      
      const closeButton = overlay.querySelector('.tf-close-button') as HTMLElement;
      const hideOverlaySpy = jest.spyOn(overlayManager, 'hideOverlay');
      
      closeButton?.click();
      
      expect(hideOverlaySpy).toHaveBeenCalled();
    });

    test('should attach backdrop click listener', () => {
      const overlay = overlayManager.createOverlay();
      overlayManager.attachEventListeners();
      
      const backdrop = overlay.querySelector('.tf-overlay-backdrop') as HTMLElement;
      const hideOverlaySpy = jest.spyOn(overlayManager, 'hideOverlay');
      
      backdrop?.click();
      
      expect(hideOverlaySpy).toHaveBeenCalled();
    });

    test('should attach escape key listener', () => {
      overlayManager.createOverlay();
      overlayManager.attachEventListeners();
      
      const hideOverlaySpy = jest.spyOn(overlayManager, 'hideOverlay');
      
      // Simulate Escape key press
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);
      
      expect(hideOverlaySpy).toHaveBeenCalled();
    });

    test('should not close on content panel click', () => {
      const overlay = overlayManager.createOverlay();
      overlayManager.attachEventListeners();
      
      const contentPanel = overlay.querySelector('.tf-overlay-content') as HTMLElement;
      const hideOverlaySpy = jest.spyOn(overlayManager, 'hideOverlay');
      
      contentPanel?.click();
      
      expect(hideOverlaySpy).not.toHaveBeenCalled();
    });

    test('should store and restore focus on previously focused element', () => {
      // Create and focus a dummy element
      const dummyButton = document.createElement('button');
      document.body.appendChild(dummyButton);
      dummyButton.focus();
      
      overlayManager.createOverlay();
      overlayManager.attachEventListeners();
      
      // Should store the previously focused element
      expect((overlayManager as any).lastFocusedElement).toBe(dummyButton);
      
      // Clean up
      document.body.removeChild(dummyButton);
    });

    test('should focus close button initially', () => {
      const overlay = overlayManager.createOverlay();
      
      // Mock focus method to track calls
      const closeButton = overlay.querySelector('.tf-close-button') as HTMLElement;
      const focusSpy = jest.spyOn(closeButton, 'focus');
      
      overlayManager.attachEventListeners();
      
      expect(focusSpy).toHaveBeenCalled();
    });

    test('should setup focus trap with focusable elements', () => {
      overlayManager.createOverlay();
      overlayManager.attachEventListeners();
      
      const focusableElements = (overlayManager as any).focusableElements;
      expect(focusableElements).toBeTruthy();
      expect(focusableElements.length).toBeGreaterThan(0);
    });
  });

  describe('focus trap navigation', () => {
    test('should handle Tab key navigation forward', () => {
      const overlay = overlayManager.createOverlay();
      
      // Add additional focusable element for testing
      const testButton = document.createElement('button');
      testButton.textContent = 'Test Button';
      const contentPanel = overlay.querySelector('.tf-overlay-content');
      contentPanel?.appendChild(testButton);
      
      overlayManager.attachEventListeners();
      
      const closeButton = overlay.querySelector('.tf-close-button') as HTMLElement;
      
      // Mock focus to verify focus trap behavior
      const closeFocusSpy = jest.spyOn(closeButton, 'focus');
      
      // Simulate being on last focusable element
      Object.defineProperty(document, 'activeElement', {
        value: testButton,
        writable: true
      });
      
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
      Object.defineProperty(tabEvent, 'preventDefault', {
        value: jest.fn(),
        writable: true
      });
      
      document.dispatchEvent(tabEvent);
      
      // Should call focus on first element and prevent default
      expect(closeFocusSpy).toHaveBeenCalled();
      expect(tabEvent.preventDefault).toHaveBeenCalled();
    });

    test('should handle Shift+Tab key navigation backward', () => {
      const overlay = overlayManager.createOverlay();
      
      // Add additional focusable element for testing
      const testButton = document.createElement('button');
      testButton.textContent = 'Test Button';
      const contentPanel = overlay.querySelector('.tf-overlay-content');
      contentPanel?.appendChild(testButton);
      
      overlayManager.attachEventListeners();
      
      const closeButton = overlay.querySelector('.tf-close-button') as HTMLElement;
      
      // Mock focus to verify focus trap behavior
      const testButtonFocusSpy = jest.spyOn(testButton, 'focus');
      
      // Simulate being on first focusable element
      Object.defineProperty(document, 'activeElement', {
        value: closeButton,
        writable: true
      });
      
      const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      Object.defineProperty(shiftTabEvent, 'preventDefault', {
        value: jest.fn(),
        writable: true
      });
      
      document.dispatchEvent(shiftTabEvent);
      
      // Should call focus on last element and prevent default
      expect(testButtonFocusSpy).toHaveBeenCalled();
      expect(shiftTabEvent.preventDefault).toHaveBeenCalled();
    });

    test('should restore focus on hideOverlay', () => {
      // Create and focus a dummy element
      const dummyButton = document.createElement('button');
      document.body.appendChild(dummyButton);
      
      // Mock focus method to track restoration calls
      const focusSpy = jest.spyOn(dummyButton, 'focus');
      
      // Simulate the element being focused before overlay
      dummyButton.focus();
      
      overlayManager.createOverlay();
      overlayManager.showOverlay();
      overlayManager.hideOverlay();
      
      // Focus restoration should be called
      expect(focusSpy).toHaveBeenCalled();
      
      // Clean up
      document.body.removeChild(dummyButton);
    });

    test('should handle focus restoration errors gracefully', () => {
      // Create element that will cause focus error
      const dummyElement = document.createElement('div');
      
      overlayManager.createOverlay();
      overlayManager.attachEventListeners();
      
      // Manually set lastFocusedElement to non-focusable element
      (overlayManager as any).lastFocusedElement = dummyElement;
      
      expect(() => {
        overlayManager.hideOverlay();
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    test('should handle missing DOM elements gracefully', () => {
      expect(() => {
        overlayManager.setLoading(true);
      }).not.toThrow();
    });

    test('should handle multiple hideOverlay calls gracefully', () => {
      overlayManager.createOverlay();
      overlayManager.showOverlay();
      
      expect(() => {
        overlayManager.hideOverlay();
        overlayManager.hideOverlay(); // Second call
      }).not.toThrow();
    });

    test('should handle Tab navigation without focusable elements', () => {
      overlayManager.createOverlay();
      
      // Manually clear focusable elements
      (overlayManager as any).focusableElements = null;
      
      expect(() => {
        const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
        (overlayManager as any).handleTabNavigation(tabEvent);
      }).not.toThrow();
    });
  });
});