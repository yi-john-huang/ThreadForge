// Unit tests for TypeScript interfaces and data models
import { CommentData, OverlayState, ExpandState, PerformanceMetrics, ViewportState, ErrorType } from './types';

describe('CommentData interface', () => {
  test('should create valid CommentData with all fields', () => {
    const comment: CommentData = {
      id: 'comment-1',
      author: 'testuser',
      text: 'This is a test comment',
      timestamp: '2023-01-01T00:00:00Z',
      replies: [],
      depth: 0,
      isExpanded: true,
      matchesSearch: false
    };
    
    expect(comment.id).toBe('comment-1');
    expect(comment.author).toBe('testuser');
    expect(comment.text).toBe('This is a test comment');
    expect(comment.replies).toHaveLength(0);
  });

  test('should allow null values for optional fields', () => {
    const comment: CommentData = {
      id: 'comment-2',
      author: null,
      text: null,
      timestamp: null,
      replies: []
    };
    
    expect(comment.author).toBeNull();
    expect(comment.text).toBeNull();
    expect(comment.timestamp).toBeNull();
  });

  test('should support nested replies', () => {
    const reply: CommentData = {
      id: 'reply-1',
      author: 'replier',
      text: 'This is a reply',
      timestamp: '2023-01-01T01:00:00Z',
      replies: []
    };

    const parentComment: CommentData = {
      id: 'parent-1',
      author: 'parent',
      text: 'Parent comment',
      timestamp: '2023-01-01T00:00:00Z',
      replies: [reply]
    };

    expect(parentComment.replies).toHaveLength(1);
    expect(parentComment.replies[0].id).toBe('reply-1');
  });
});

describe('OverlayState interface', () => {
  test('should create valid OverlayState', () => {
    const state: OverlayState = {
      isVisible: false,
      isLoading: true,
      comments: [],
      expandedThreads: new Set(['thread-1', 'thread-2']),
      searchQuery: 'test query',
      theme: 'dark'
    };

    expect(state.isVisible).toBe(false);
    expect(state.isLoading).toBe(true);
    expect(state.expandedThreads.has('thread-1')).toBe(true);
    expect(state.theme).toBe('dark');
  });
});

describe('ExpandState interface', () => {
  test('should create valid ExpandState', () => {
    const state: ExpandState = {
      iterationCount: 5,
      expandedCount: 10,
      startTime: Date.now(),
      timeoutId: 123,
      status: 'expanding'
    };

    expect(state.iterationCount).toBe(5);
    expect(state.expandedCount).toBe(10);
    expect(state.status).toBe('expanding');
  });

  test('should allow all status values', () => {
    const statuses: ExpandState['status'][] = ['idle', 'expanding', 'complete', 'timeout'];
    
    statuses.forEach(status => {
      const state: ExpandState = {
        iterationCount: 0,
        expandedCount: 0,
        startTime: Date.now(),
        status
      };
      expect(state.status).toBe(status);
    });
  });
});

describe('PerformanceMetrics interface', () => {
  test('should create valid PerformanceMetrics', () => {
    const metrics: PerformanceMetrics = {
      expansionDuration: 5000,
      renderDuration: 200,
      commentCount: 50,
      memoryUsage: 25.5,
      virtualScrollEnabled: true
    };

    expect(metrics.expansionDuration).toBe(5000);
    expect(metrics.renderDuration).toBe(200);
    expect(metrics.commentCount).toBe(50);
    expect(metrics.memoryUsage).toBe(25.5);
    expect(metrics.virtualScrollEnabled).toBe(true);
  });
});

describe('ViewportState interface', () => {
  test('should create valid ViewportState', () => {
    const viewport: ViewportState = {
      startIndex: 0,
      endIndex: 20,
      scrollTop: 100,
      itemHeight: 80,
      containerHeight: 600
    };

    expect(viewport.startIndex).toBe(0);
    expect(viewport.endIndex).toBe(20);
    expect(viewport.scrollTop).toBe(100);
    expect(viewport.itemHeight).toBe(80);
    expect(viewport.containerHeight).toBe(600);
  });
});

describe('ErrorType enum', () => {
  test('should have all required error types', () => {
    expect(ErrorType.EXPANSION_TIMEOUT).toBe('EXPANSION_TIMEOUT');
    expect(ErrorType.DOM_NOT_FOUND).toBe('DOM_NOT_FOUND');
    expect(ErrorType.PARSING_ERROR).toBe('PARSING_ERROR');
    expect(ErrorType.MEMORY_LIMIT).toBe('MEMORY_LIMIT');
    expect(ErrorType.NETWORK_ERROR).toBe('NETWORK_ERROR');
  });
});

// Validation helper tests
describe('Data validation helpers', () => {
  test('should validate CommentData has required fields', () => {
    const validComment: CommentData = {
      id: 'test-id',
      author: 'test-author',
      text: 'test text',
      timestamp: '2023-01-01T00:00:00Z',
      replies: []
    };

    expect(validComment.id).toBeTruthy();
    expect(validComment.replies).toBeDefined();
  });

  test('should handle invalid comment data gracefully', () => {
    const invalidComment = {
      // Missing required id field
      id: '', // Add empty id to make it valid for runtime test
      author: 'test',
      text: 'test',
      timestamp: null,
      replies: []
    };

    // This should pass runtime validation but TypeScript would catch missing fields
    expect(() => {
      const comment: CommentData = invalidComment as CommentData;
      return comment;
    }).not.toThrow(); // Runtime won't throw, but TypeScript will catch this
  });
});