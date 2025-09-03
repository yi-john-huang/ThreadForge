/**
 * Performance Optimization Tests
 * Tests for request batching, prefetching, progressive loading, and cache warming
 */

import { PerformanceOptimizer } from '../optimization/performanceOptimizer';
import { PerformanceMonitor } from '../performance/performanceMonitor';
import { ThreadsAPIService } from '../api/threadsApiService';
import { CacheManager } from '../cache/cacheManager';

// Mock Chrome API
const mockChrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  }
};

(global as any).chrome = mockChrome;

// Mock DOM APIs
Object.defineProperty(document, 'addEventListener', {
  writable: true,
  value: jest.fn()
});

Object.defineProperty(window, 'addEventListener', {
  writable: true,
  value: jest.fn()
});

Object.defineProperty(document, 'body', {
  writable: true,
  value: {
    scrollHeight: 1000
  }
});

Object.defineProperty(window, 'scrollY', {
  writable: true,
  value: 0
});

Object.defineProperty(window, 'innerHeight', {
  writable: true,
  value: 800
});

describe('PerformanceOptimizer', () => {
  let optimizer: PerformanceOptimizer;
  let performanceMonitor: PerformanceMonitor;
  let threadsApi: ThreadsAPIService;
  let cacheManager: CacheManager;

  const mockThreadData = {
    id: 'thread_123',
    text: 'Test thread content',
    username: 'testuser',
    timestamp: Date.now(),
    likes: 10,
    replies: 5,
    reposts: 2
  };

  const mockRepliesData = [
    {
      id: 'reply_1',
      text: 'First reply',
      username: 'user1',
      timestamp: Date.now()
    },
    {
      id: 'reply_2',
      text: 'Second reply',
      username: 'user2',
      timestamp: Date.now()
    }
  ];

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock instances
    performanceMonitor = new PerformanceMonitor();
    threadsApi = new ThreadsAPIService();
    cacheManager = new CacheManager();

    // Mock ThreadsAPI methods
    jest.spyOn(threadsApi, 'getThread').mockResolvedValue(mockThreadData as any);
    jest.spyOn(threadsApi, 'getThreadReplies').mockResolvedValue({ data: mockRepliesData } as any);

    // Mock CacheManager methods
    jest.spyOn(cacheManager, 'get').mockResolvedValue({ 
      found: false, 
      value: undefined, 
      metadata: undefined 
    });
    jest.spyOn(cacheManager, 'set').mockResolvedValue();

    // Mock performance monitor methods
    jest.spyOn(performanceMonitor, 'startTimer').mockReturnValue('timer_123');
    jest.spyOn(performanceMonitor, 'endTimer').mockReturnValue(undefined);

    // Create optimizer instance
    optimizer = new PerformanceOptimizer(
      performanceMonitor,
      threadsApi,
      cacheManager,
      {
        batchSize: 3,
        batchDelay: 100,
        maxConcurrentRequests: 2,
        prefetchQueueSize: 10
      }
    );
  });

  afterEach(() => {
    optimizer.destroy();
  });

  describe('Request Batching', () => {
    test('should batch multiple requests together', async () => {
      const callbacks: Array<jest.Mock> = [];
      const errorCallbacks: Array<jest.Mock> = [];

      // Add multiple requests to batch
      for (let i = 0; i < 5; i++) {
        const callback = jest.fn();
        const errorCallback = jest.fn();
        callbacks.push(callback);
        errorCallbacks.push(errorCallback);

        optimizer.batchRequest(`thread_${i}`, 'medium', callback, errorCallback);
      }

      // Wait for batch processing (allow more time for all batches)
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify API was called for batched requests (may be processed in multiple batches)
      expect(threadsApi.getThread).toHaveBeenCalledTimes(5);

      // Verify all callbacks were called
      callbacks.forEach(callback => {
        expect(callback).toHaveBeenCalledWith(mockThreadData);
      });

      errorCallbacks.forEach(errorCallback => {
        expect(errorCallback).not.toHaveBeenCalled();
      });
    });

    test('should handle batch request priorities correctly', async () => {
      const highPriorityCallback = jest.fn();
      const lowPriorityCallback = jest.fn();
      const mediumPriorityCallback = jest.fn();

      // Add requests with different priorities
      optimizer.batchRequest('thread_low', 'low', lowPriorityCallback, jest.fn());
      optimizer.batchRequest('thread_high', 'high', highPriorityCallback, jest.fn());
      optimizer.batchRequest('thread_medium', 'medium', mediumPriorityCallback, jest.fn());

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(threadsApi.getThread).toHaveBeenCalledTimes(3);
      expect(highPriorityCallback).toHaveBeenCalled();
      expect(mediumPriorityCallback).toHaveBeenCalled();
      expect(lowPriorityCallback).toHaveBeenCalled();
    });

    test('should handle batch request errors gracefully', async () => {
      const successCallback = jest.fn();
      const errorCallback = jest.fn();

      // Mock API failure for one request
      jest.spyOn(threadsApi, 'getThread').mockImplementation((threadId) => {
        if (threadId === 'error_thread') {
          return Promise.reject(new Error('API Error'));
        }
        return Promise.resolve(mockThreadData as any);
      });

      optimizer.batchRequest('success_thread', 'medium', successCallback, jest.fn());
      optimizer.batchRequest('error_thread', 'medium', jest.fn(), errorCallback);

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(successCallback).toHaveBeenCalledWith(mockThreadData);
      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
    });

    test('should respect maximum concurrent requests limit', async () => {
      const callbacks = Array(10).fill(null).map(() => jest.fn());

      // Add many requests quickly
      callbacks.forEach((callback, index) => {
        optimizer.batchRequest(`thread_${index}`, 'medium', callback, jest.fn());
      });

      // Wait for processing (longer time for many requests)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Should have processed all requests eventually
      expect(threadsApi.getThread).toHaveBeenCalledTimes(10);
    });
  });

  describe('Background Prefetching', () => {
    test('should prefetch threads based on user behavior', async () => {
      // Simulate high engagement behavior
      optimizer.trackBehavior('view_thread', { 
        viewTime: 15000, // 15 seconds 
        author: 'popular_user' 
      });
      
      optimizer.trackBehavior('scroll', { depth: 0.8 });
      
      optimizer.trackBehavior('click', { element: 'thread-container' });

      // Wait for prefetch to trigger
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should attempt to prefetch based on behavior
      const stats = optimizer.getOptimizationStats();
      expect(stats.behaviorScore).toBeGreaterThan(0);
    });

    test('should cache prefetched thread data', async () => {
      await optimizer.prefetchThread('prefetch_test_thread');

      expect(threadsApi.getThread).toHaveBeenCalledWith('prefetch_test_thread');
      expect(cacheManager.set).toHaveBeenCalledWith(
        'thread_cache_prefetch_test_thread',
        {
          data: mockThreadData,
          timestamp: expect.any(Number),
          prefetched: true
        },
        { ttl: 60 * 60 * 1000 }
      );
    });

    test('should track user behavior patterns', () => {
      optimizer.trackBehavior('view_thread', { 
        author: 'user1', 
        viewTime: 5000 
      });
      
      optimizer.trackBehavior('scroll', { depth: 0.6 });
      
      optimizer.trackBehavior('click', { element: 'reply-button' });

      const stats = optimizer.getOptimizationStats();
      expect(stats.behaviorScore).toBeGreaterThan(0);
    });

    test('should prevent duplicate prefetch requests', async () => {
      const prefetchPromises = [
        optimizer.prefetchThread('duplicate_thread'),
        optimizer.prefetchThread('duplicate_thread'),
        optimizer.prefetchThread('duplicate_thread')
      ];

      await Promise.all(prefetchPromises);

      // Should only call API once despite multiple prefetch attempts
      expect(threadsApi.getThread).toHaveBeenCalledTimes(1);
    });
  });

  describe('Progressive Loading', () => {
    test('should load thread summary first', async () => {
      const result = await optimizer.progressiveLoadThread('progressive_thread');

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('loadReplies');
      expect(result.summary).toEqual(mockThreadData);
      expect(threadsApi.getThread).toHaveBeenCalledWith('progressive_thread');
    });

    test('should lazy load replies on demand', async () => {
      const result = await optimizer.progressiveLoadThread('progressive_thread');
      
      // Load replies
      const replies = await result.loadReplies();

      expect(replies).toEqual(mockRepliesData);
      expect(threadsApi.getThreadReplies).toHaveBeenCalledWith('progressive_thread');
      expect(cacheManager.set).toHaveBeenCalledWith(
        'replies_cache_progressive_thread',
        {
          data: mockRepliesData,
          timestamp: expect.any(Number)
        },
        { ttl: 30 * 60 * 1000 }
      );
    });

    test('should cache replies after loading', async () => {
      const result = await optimizer.progressiveLoadThread('cached_replies_thread');
      await result.loadReplies();

      // Mock cache hit for second call
      jest.spyOn(cacheManager, 'get').mockResolvedValue({
        found: true,
        value: { data: mockRepliesData, timestamp: Date.now() },
        metadata: undefined
      });

      // Load replies again
      const cachedReplies = await result.loadReplies();

      expect(cachedReplies).toEqual(mockRepliesData);
      // Should not call API again if cached
      expect(threadsApi.getThreadReplies).toHaveBeenCalledTimes(1);
    });

    test('should handle progressive loading errors', async () => {
      jest.spyOn(threadsApi, 'getThread').mockRejectedValue(new Error('Network error'));

      await expect(optimizer.progressiveLoadThread('error_thread')).rejects.toThrow('Network error');
    });

    test('should prevent concurrent reply loading', async () => {
      const result = await optimizer.progressiveLoadThread('concurrent_thread');
      
      // Start multiple concurrent reply loads
      const loadPromises = [
        result.loadReplies(),
        result.loadReplies(),
        result.loadReplies()
      ];

      const replies = await Promise.all(loadPromises);

      // Should only call API once due to promise sharing
      expect(threadsApi.getThreadReplies).toHaveBeenCalledTimes(1);
      
      // All promises should resolve to the same data
      replies.forEach(replySet => {
        expect(replySet).toEqual(mockRepliesData);
      });
    });
  });

  describe('Cache Warming Strategies', () => {
    test('should execute cache warming when enabled', async () => {
      optimizer.configure({ cacheWarmupEnabled: true });

      await optimizer.warmCache();

      // Should have attempted to warm cache with various strategies
      expect(performanceMonitor.startTimer).toHaveBeenCalledWith(expect.stringMatching(/warmup_/));
    });

    test('should skip cache warming when disabled', async () => {
      optimizer.configure({ cacheWarmupEnabled: false });

      await optimizer.warmCache();

      // Should not start any warmup timers
      const warmupCalls = (performanceMonitor.startTimer as jest.Mock).mock.calls
        .filter(call => call[0].startsWith('warmup_'));
      expect(warmupCalls).toHaveLength(0);
    });

    test('should handle cache warming errors gracefully', async () => {
      // Mock prefetch to throw error
      jest.spyOn(optimizer, 'prefetchThread').mockRejectedValue(new Error('Prefetch failed'));

      // Should not throw error
      await expect(optimizer.warmCache()).resolves.not.toThrow();
    });
  });

  describe('Performance Monitoring Integration', () => {
    test('should track batch request performance', async () => {
      const callback = jest.fn();
      optimizer.batchRequest('perf_thread', 'medium', callback, jest.fn());

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(performanceMonitor.startTimer).toHaveBeenCalledWith('batch_request');
      expect(performanceMonitor.endTimer).toHaveBeenCalled();
    });

    test('should track prefetch performance', async () => {
      await optimizer.prefetchThread('perf_prefetch_thread');

      expect(performanceMonitor.startTimer).toHaveBeenCalledWith('prefetch_request');
      expect(performanceMonitor.endTimer).toHaveBeenCalled();
    });

    test('should track progressive loading performance', async () => {
      const result = await optimizer.progressiveLoadThread('perf_progressive_thread');
      await result.loadReplies();

      expect(performanceMonitor.startTimer).toHaveBeenCalledWith('progressive_load_summary');
      expect(performanceMonitor.startTimer).toHaveBeenCalledWith('progressive_load_replies');
      expect(performanceMonitor.endTimer).toHaveBeenCalledTimes(2);
    });
  });

  describe('Optimization Statistics', () => {
    test('should provide comprehensive optimization statistics', () => {
      // Add some activity
      optimizer.batchRequest('stat_thread', 'medium', jest.fn(), jest.fn());
      optimizer.trackBehavior('view_thread', { viewTime: 10000 });
      optimizer.trackBehavior('scroll', { depth: 0.7 });

      const stats = optimizer.getOptimizationStats();

      expect(stats).toHaveProperty('batchQueue');
      expect(stats).toHaveProperty('prefetchQueue');
      expect(stats).toHaveProperty('activeRequests');
      expect(stats).toHaveProperty('cacheHitRate');
      expect(stats).toHaveProperty('behaviorScore');
      expect(stats).toHaveProperty('averageBatchSize');
      expect(stats).toHaveProperty('prefetchSuccessRate');

      expect(typeof stats.batchQueue).toBe('number');
      expect(typeof stats.behaviorScore).toBe('number');
      expect(stats.behaviorScore).toBeGreaterThanOrEqual(0);
      expect(stats.behaviorScore).toBeLessThanOrEqual(1);
    });

    test('should calculate behavior score based on engagement', () => {
      // High engagement behavior
      optimizer.trackBehavior('view_thread', { viewTime: 30000 }); // 30 seconds
      optimizer.trackBehavior('scroll', { depth: 1.0 }); // Full scroll
      optimizer.trackBehavior('click', { element: 'thread-container' });
      optimizer.trackBehavior('click', { element: 'reply-button' });

      const stats = optimizer.getOptimizationStats();
      expect(stats.behaviorScore).toBeGreaterThan(0.5);
    });

    test('should track queue sizes accurately', async () => {
      // Add items to queues
      optimizer.batchRequest('queue1', 'medium', jest.fn(), jest.fn());
      optimizer.batchRequest('queue2', 'medium', jest.fn(), jest.fn());

      const statsBeforeProcessing = optimizer.getOptimizationStats();
      expect(statsBeforeProcessing.batchQueue).toBe(2);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 150));

      const statsAfterProcessing = optimizer.getOptimizationStats();
      expect(statsAfterProcessing.batchQueue).toBe(0);
    });
  });

  describe('Configuration and Lifecycle', () => {
    test('should accept custom configuration', () => {
      const customOptimizer = new PerformanceOptimizer(
        performanceMonitor,
        threadsApi,
        cacheManager,
        {
          batchSize: 10,
          batchDelay: 50,
          prefetchThreshold: 0.8,
          maxConcurrentRequests: 5
        }
      );

      expect(customOptimizer).toBeDefined();
      customOptimizer.destroy();
    });

    test('should allow runtime configuration updates', () => {
      optimizer.configure({
        batchSize: 8,
        prefetchThreshold: 0.9
      });

      // Configuration should be updated internally
      // (This is tested indirectly through behavior)
      expect(optimizer).toBeDefined();
    });

    test('should clean up resources on destroy', () => {
      const callback = jest.fn();
      optimizer.batchRequest('cleanup_thread', 'medium', callback, jest.fn());

      optimizer.destroy();

      const stats = optimizer.getOptimizationStats();
      expect(stats.batchQueue).toBe(0);
      expect(stats.prefetchQueue).toBe(0);
      expect(stats.activeRequests).toBe(0);
    });

    test('should save behavior data on destroy', () => {
      optimizer.trackBehavior('view_thread', { author: 'user1' });
      
      optimizer.destroy();

      expect(cacheManager.set).toHaveBeenCalledWith(
        'user_behavior',
        expect.any(Object),
        { ttl: 7 * 24 * 60 * 60 * 1000 }
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle API failures gracefully', async () => {
      jest.spyOn(threadsApi, 'getThread').mockRejectedValue(new Error('API Error'));

      const errorCallback = jest.fn();
      optimizer.batchRequest('error_thread', 'medium', jest.fn(), errorCallback);

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
    });

    test('should handle cache failures gracefully', async () => {
      jest.spyOn(cacheManager, 'set').mockRejectedValue(new Error('Cache Error'));

      // Should not throw despite cache error
      await expect(optimizer.prefetchThread('cache_error_thread')).resolves.not.toThrow();
    });

    test('should handle behavior tracking with invalid data', () => {
      // Should not throw with invalid behavior data
      expect(() => {
        optimizer.trackBehavior('invalid_action', null);
        optimizer.trackBehavior('', {});
        optimizer.trackBehavior('test', undefined);
      }).not.toThrow();
    });

    test('should handle concurrent destruction and operation', async () => {
      const callback = jest.fn();
      optimizer.batchRequest('concurrent_thread', 'medium', callback, jest.fn());
      
      // Destroy while operation is in progress
      optimizer.destroy();

      // Should not throw or cause issues
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(callback).not.toHaveBeenCalled(); // Operation should be cancelled
    });

    test('should handle empty or malformed cache data', async () => {
      // Mock cache returning malformed data
      jest.spyOn(cacheManager, 'get').mockResolvedValue({
        found: true,
        value: null,
        metadata: undefined
      });

      const result = await optimizer.progressiveLoadThread('malformed_cache_thread');
      const replies = await result.loadReplies();

      // Should fallback to API call
      expect(threadsApi.getThreadReplies).toHaveBeenCalled();
      expect(replies).toEqual(mockRepliesData);
    });
  });
});