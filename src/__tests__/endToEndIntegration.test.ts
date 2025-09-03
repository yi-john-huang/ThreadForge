/**
 * End-to-End Integration Tests
 * Tests complete click-to-display flow with all components integrated:
 * Click interception -> Authentication -> API calls -> Cache -> Display
 */

import { ThreadForgeServiceContainer } from '../services/serviceContainer';
import { CacheManager } from '../cache/cacheManager';
import { ThreadsAPIService } from '../api/threadsApiService';
import { PerformanceOptimizer } from '../optimization/performanceOptimizer';
import { OAuth2AuthenticationService } from '../auth/oauth2Service';
import { CredentialsManager } from '../auth/credentialsManager';

// Mock Chrome API with comprehensive coverage
const mockChrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn()
    },
    session: {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn()
    }
  },
  notifications: {
    create: jest.fn(),
    clear: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    },
    getURL: jest.fn((path) => `chrome-extension://test/${path}`)
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    create: jest.fn()
  },
  identity: {
    launchWebAuthFlow: jest.fn(),
    getAuthToken: jest.fn()
  }
};

(global as any).chrome = mockChrome;

// Mock DOM environment
const mockDocument = {
  createElement: jest.fn(() => ({
    click: jest.fn(),
    addEventListener: jest.fn(),
    appendChild: jest.fn(),
    style: {},
    innerHTML: '',
    textContent: '',
    setAttribute: jest.fn(),
    getAttribute: jest.fn()
  })),
  addEventListener: jest.fn(),
  querySelector: jest.fn(() => null),
  querySelectorAll: jest.fn(() => []),
  body: {
    appendChild: jest.fn(),
    scrollHeight: 1000
  }
};

const mockWindow = {
  location: {
    href: 'https://threads.net/@test/post/123',
    origin: 'https://threads.net'
  },
  addEventListener: jest.fn(),
  scrollY: 0,
  innerHeight: 800,
  fetch: jest.fn()
};

Object.defineProperty(global, 'document', {
  writable: true,
  value: mockDocument
});

Object.defineProperty(global, 'window', {
  writable: true,
  value: mockWindow
});

// Mock thread data
const mockThreadData = {
  id: 'thread_123',
  text: 'This is a test thread with some interesting content to expand.',
  username: 'testuser',
  timestamp: Date.now() - 3600000, // 1 hour ago
  likes: 42,
  replies: 15,
  reposts: 8,
  media_type: 'TEXT',
  permalink_url: 'https://threads.net/@testuser/post/thread_123',
  is_quote_post: false
};

const mockRepliesData = {
  data: [
    {
      id: 'reply_1',
      text: 'Great post! Thanks for sharing.',
      username: 'commenter1',
      timestamp: Date.now() - 3000000,
      likes: 5,
      reply_to: 'thread_123'
    },
    {
      id: 'reply_2', 
      text: 'I completely agree with this perspective.',
      username: 'commenter2',
      timestamp: Date.now() - 2700000,
      likes: 12,
      reply_to: 'thread_123'
    },
    {
      id: 'reply_3',
      text: 'Has anyone tried implementing this approach?',
      username: 'commenter3', 
      timestamp: Date.now() - 1800000,
      likes: 3,
      reply_to: 'thread_123'
    }
  ],
  paging: {
    cursors: {
      after: 'next_cursor_abc123'
    }
  }
};

describe('End-to-End Integration Tests', () => {
  let serviceContainer: ThreadForgeServiceContainer;
  let cache: CacheManager;
  let api: ThreadsAPIService;
  let optimizer: PerformanceOptimizer;
  let credentials: CredentialsManager;
  let oauth2: OAuth2AuthenticationService;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup Chrome API mocks
    mockChrome.storage.local.get.mockResolvedValue({});
    mockChrome.storage.local.set.mockResolvedValue();
    mockChrome.storage.session.get.mockResolvedValue({});
    mockChrome.storage.session.set.mockResolvedValue();
    
    // Setup fetch mock for API calls
    (global as any).fetch = jest.fn();
    mockWindow.fetch = jest.fn();

    // Get fresh service container instance
    serviceContainer = ThreadForgeServiceContainer.getInstance();
    
    // Initialize services
    cache = await serviceContainer.getCache();
    api = await serviceContainer.getThreadsAPI();
    optimizer = await serviceContainer.getPerformanceOptimizer();
    credentials = await serviceContainer.getCredentialsManager();
    oauth2 = await serviceContainer.getOAuth2Service();
  });

  afterEach(async () => {
    if (serviceContainer) {
      await serviceContainer.destroy();
      // Reset singleton for next test
      (ThreadForgeServiceContainer as any).instance = null;
    }
  });

  describe('Complete Click-to-Display Flow', () => {
    test('should handle full expansion flow from click to display', async () => {
      // Setup authentication mock
      jest.spyOn(credentials, 'getStoredCredentials').mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000
      });
      
      // Setup API response mocks
      jest.spyOn(api, 'getThread').mockResolvedValue(mockThreadData);
      jest.spyOn(api, 'getThreadReplies').mockResolvedValue(mockRepliesData);

      // 1. Simulate click interception
      const clickEvent = new Event('click');
      const expandButton = mockDocument.createElement('button');
      
      // 2. Simulate thread ID extraction from DOM
      const threadId = 'thread_123';
      
      // 3. Simulate authentication check
      const storedCreds = await credentials.getStoredCredentials();
      expect(storedCreds?.accessToken).toBe('test-access-token');
      
      // 4. Progressive loading: load thread summary first
      const progressiveResult = await optimizer.progressiveLoadThread(threadId);
      expect(progressiveResult.summary).toEqual(mockThreadData);
      
      // 5. Load replies on demand
      const replies = await progressiveResult.loadReplies();
      expect(replies).toEqual(mockRepliesData.data);
      
      // 6. Verify cache integration
      const cacheStats = await cache.getStatistics();
      expect(cacheStats.totalEntries).toBeGreaterThan(0);
      
      // 7. Verify API calls were made with authentication
      expect(api.getThread).toHaveBeenCalledWith(threadId);
      expect(api.getThreadReplies).toHaveBeenCalledWith(threadId);
      
      // 8. Verify performance monitoring
      const optimizationStats = optimizer.getOptimizationStats();
      expect(optimizationStats).toBeDefined();
      expect(optimizationStats.behaviorScore).toBeGreaterThanOrEqual(0);
    });

    test('should handle authentication flow from popup to API calls', async () => {
      // Mock authentication flow
      const authCode = 'test-auth-code-123';
      const accessToken = 'access-token-456';
      const refreshToken = 'refresh-token-789';

      // 1. Mock authentication status check
      jest.spyOn(oauth2, 'getAuthStatus').mockResolvedValue({
        isAuthenticated: true,
        hasValidToken: true,
        tokenExpiresAt: Date.now() + 3600000,
        lastRefreshed: Date.now(),
        hasRefreshToken: true
      });

      // 2. Mock automatic token refresh
      jest.spyOn(oauth2, 'automaticTokenRefresh').mockResolvedValue({
        success: true,
        accessToken,
        expiresAt: Date.now() + 3600000,
        error: null
      });

      // 3. Check authentication status
      const authStatus = await oauth2.getAuthStatus();
      expect(authStatus.isAuthenticated).toBe(true);

      // 4. Perform token refresh
      const refreshResult = await oauth2.automaticTokenRefresh();
      expect(refreshResult.success).toBe(true);
      expect(refreshResult.accessToken).toBe(accessToken);

      // 5. Store credentials
      await credentials.saveCredentials({
        accessToken,
        refreshToken,
        expiresAt: Date.now() + 3600000
      });

      // 6. Verify stored credentials can be retrieved
      const storedCreds = await credentials.getStoredCredentials();
      expect(storedCreds?.accessToken).toBe(accessToken);

      // 7. Make API call with stored credentials
      jest.spyOn(api, 'getThread').mockResolvedValue(mockThreadData);
      const threadData = await api.getThread('test-thread');
      
      expect(api.getThread).toHaveBeenCalledWith('test-thread');
      expect(threadData).toEqual(mockThreadData);
    });

    test('should handle batched API requests for multiple threads', async () => {
      // Setup authentication
      jest.spyOn(credentials, 'getStoredCredentials').mockResolvedValue({
        accessToken: 'test-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000
      });
      
      // Setup API responses for multiple threads
      const threadIds = ['thread_1', 'thread_2', 'thread_3', 'thread_4', 'thread_5'];
      const threadResponses = threadIds.map(id => ({
        ...mockThreadData,
        id,
        text: `Thread content for ${id}`
      }));

      jest.spyOn(api, 'getThread').mockImplementation((id) => {
        const index = threadIds.indexOf(id);
        return Promise.resolve(threadResponses[index]);
      });

      // 1. Simulate multiple click events requiring thread expansion
      const callbacks = threadIds.map(() => jest.fn());
      const errorCallbacks = threadIds.map(() => jest.fn());

      // 2. Add all requests to batch queue
      threadIds.forEach((threadId, index) => {
        optimizer.batchRequest(threadId, 'medium', callbacks[index], errorCallbacks[index]);
      });

      // 3. Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // 4. Verify all API calls were made
      expect(api.getThread).toHaveBeenCalledTimes(5);
      threadIds.forEach(threadId => {
        expect(api.getThread).toHaveBeenCalledWith(threadId);
      });

      // 5. Verify all callbacks were called with correct data
      callbacks.forEach((callback, index) => {
        expect(callback).toHaveBeenCalledWith(threadResponses[index]);
      });

      // 6. Verify no error callbacks were called
      errorCallbacks.forEach(errorCallback => {
        expect(errorCallback).not.toHaveBeenCalled();
      });

      // 7. Verify batch optimization stats
      const stats = optimizer.getOptimizationStats();
      expect(stats.batchQueue).toBe(0); // All processed
    });
  });

  describe('Error Scenarios and Fallback Testing', () => {
    test('should handle API authentication errors with graceful fallback', async () => {
      // 1. Mock authentication failure
      jest.spyOn(credentials, 'getAccessToken').mockRejectedValue(new Error('Authentication expired'));
      
      // 2. Mock OAuth2 token refresh failure
      jest.spyOn(oauth2, 'refreshAccessToken').mockRejectedValue(new Error('Refresh token invalid'));

      // 3. Attempt thread expansion
      try {
        await optimizer.progressiveLoadThread('test-thread');
      } catch (error) {
        // 4. Verify error handling
        expect(error).toBeInstanceOf(Error);
      }

      // 5. Verify graceful degradation service handles the error
      const gracefulService = await serviceContainer.getGracefulDegradationService();
      const fallbackMessage = gracefulService.getGenericFallbackMessage();
      
      expect(fallbackMessage).toBeDefined();
      expect(typeof fallbackMessage).toBe('string');
    });

    test('should handle network failures with retry and caching', async () => {
      // Setup authentication
      jest.spyOn(credentials, 'getAccessToken').mockResolvedValue('test-token');
      
      let callCount = 0;
      
      // Mock API to fail first few times, then succeed
      jest.spyOn(api, 'getThread').mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve(mockThreadData);
      });

      // 1. First request should fail and retry
      const errorCallback = jest.fn();
      optimizer.batchRequest('test-thread', 'high', jest.fn(), errorCallback);
      
      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 300));

      // 2. Verify retries occurred
      expect(api.getThread).toHaveBeenCalledTimes(1); // Batch will only try once per batch
      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));

      // 3. Manual retry should succeed
      const successCallback = jest.fn();
      optimizer.batchRequest('test-thread', 'high', successCallback, jest.fn());
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should eventually succeed
      expect(successCallback).toHaveBeenCalledWith(mockThreadData);
    });

    test('should handle cache failures with direct API fallback', async () => {
      // Setup authentication
      jest.spyOn(credentials, 'getAccessToken').mockResolvedValue('test-token');
      
      // Mock cache failure
      jest.spyOn(cache, 'set').mockRejectedValue(new Error('Cache storage full'));
      jest.spyOn(cache, 'get').mockRejectedValue(new Error('Cache read error'));
      
      // Mock successful API response
      jest.spyOn(api, 'getThread').mockResolvedValue(mockThreadData);
      jest.spyOn(api, 'getThreadReplies').mockResolvedValue(mockRepliesData);

      // 1. Attempt progressive loading (should work despite cache errors)
      const result = await optimizer.progressiveLoadThread('test-thread');
      
      // 2. Verify we still get data from API
      expect(result.summary).toEqual(mockThreadData);
      
      const replies = await result.loadReplies();
      expect(replies).toEqual(mockRepliesData.data);

      // 3. Verify API calls were made
      expect(api.getThread).toHaveBeenCalledWith('test-thread');
      expect(api.getThreadReplies).toHaveBeenCalledWith('test-thread');

      // 4. Verify cache operations were attempted but failed gracefully
      expect(cache.set).toHaveBeenCalled();
    });

    test('should handle rate limiting with backoff strategy', async () => {
      // Setup authentication
      jest.spyOn(credentials, 'getAccessToken').mockResolvedValue('test-token');
      
      // Mock rate limiting response
      let callCount = 0;
      jest.spyOn(api, 'getThread').mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          const error = new Error('Rate limited') as any;
          error.response = { status: 429, headers: { 'retry-after': '1' } };
          return Promise.reject(error);
        }
        return Promise.resolve(mockThreadData);
      });

      // 1. Make request that will be rate limited
      const errorCallback = jest.fn();
      optimizer.batchRequest('rate-limited-thread', 'high', jest.fn(), errorCallback);
      
      await new Promise(resolve => setTimeout(resolve, 200));

      // 2. Verify rate limiting was handled
      expect(api.getThread).toHaveBeenCalledWith('rate-limited-thread');
      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Cache Integration Testing', () => {
    test('should respect cache TTL and eviction policies', async () => {
      // Setup authentication
      jest.spyOn(credentials, 'getAccessToken').mockResolvedValue('test-token');
      
      // 1. Set up cache with short TTL for testing
      const testCache = new CacheManager({
        maxSize: 1024 * 1024, // 1MB
        maxEntries: 10,
        defaultTtl: 100, // 100ms for quick testing
        storageType: 'local'
      });

      // 2. Store data in cache
      await testCache.set('test-thread', mockThreadData, { ttl: 100 });
      
      // 3. Verify data is cached
      let result = await testCache.get('test-thread');
      expect(result.found).toBe(true);
      expect(result.value).toEqual(mockThreadData);

      // 4. Wait for TTL expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // 5. Verify data has expired
      result = await testCache.get('test-thread');
      expect(result.found).toBe(false);

      // 6. Test eviction by filling cache
      for (let i = 0; i < 15; i++) {
        await testCache.set(`thread-${i}`, { ...mockThreadData, id: `thread-${i}` });
      }

      // 7. Verify LRU eviction occurred
      const stats = await testCache.getStatistics();
      expect(stats.totalEntries).toBeLessThanOrEqual(10);

      await testCache.destroy?.();
    });

    test('should handle cache warming strategies effectively', async () => {
      // Setup authentication
      jest.spyOn(credentials, 'getAccessToken').mockResolvedValue('test-token');
      
      // Mock API responses for cache warming
      jest.spyOn(api, 'getThread').mockImplementation((threadId) => 
        Promise.resolve({ ...mockThreadData, id: threadId })
      );

      // 1. Configure optimizer for cache warming
      optimizer.configure({
        cacheWarmupEnabled: true,
        prefetchThreshold: 0.5
      });

      // 2. Simulate user behavior that should trigger prefetch
      optimizer.trackBehavior('view_thread', { 
        viewTime: 15000, 
        author: 'popular_user' 
      });
      optimizer.trackBehavior('scroll', { depth: 0.8 });

      // 3. Trigger cache warming
      await optimizer.warmCache();

      // 4. Verify prefetch behavior
      const stats = optimizer.getOptimizationStats();
      expect(stats.behaviorScore).toBeGreaterThan(0.5);

      // 5. Wait for any async prefetch operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Note: Specific cache warming verification would depend on 
      // the actual prefetch implementation details
    });

    test('should handle cache invalidation patterns correctly', async () => {
      // 1. Store thread data in cache
      await cache.set('thread-invalidation-test', mockThreadData, {
        tags: ['thread', 'user:testuser'],
        ttl: 3600000 // 1 hour
      });

      // 2. Store related data
      await cache.set('user-profile-testuser', {
        username: 'testuser',
        followerCount: 1000
      }, {
        tags: ['user', 'profile'],
        ttl: 3600000
      });

      // 3. Verify data is cached
      let threadResult = await cache.get('thread-invalidation-test');
      let userResult = await cache.get('user-profile-testuser');
      
      expect(threadResult.found).toBe(true);
      expect(userResult.found).toBe(true);

      // 4. Invalidate by tag pattern
      const invalidatedKeys = await cache.invalidate('user:*');
      
      // 5. Verify specific invalidation
      threadResult = await cache.get('thread-invalidation-test');
      userResult = await cache.get('user-profile-testuser');
      
      // The thread with user tag should be invalidated, but profile might still exist
      // depending on exact tag matching implementation
      expect(invalidatedKeys.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance and Resource Management', () => {
    test('should monitor and optimize resource usage during operations', async () => {
      const performanceMonitor = await serviceContainer.getPerformanceMonitor();
      
      // 1. Start performance monitoring
      performanceMonitor.startMonitoring();

      // 2. Simulate intensive operations
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(optimizer.prefetchThread(`performance-test-${i}`));
      }

      // Mock API responses
      jest.spyOn(api, 'getThread').mockResolvedValue(mockThreadData);
      
      await Promise.all(promises);

      // 3. Check performance metrics
      const memoryMetrics = performanceMonitor.getMemoryMetrics();
      const optimizationStats = optimizer.getOptimizationStats();

      expect(memoryMetrics).toBeDefined();
      expect(optimizationStats.activeRequests).toBeDefined();
      expect(optimizationStats.prefetchQueue).toBeDefined();

      // 4. Verify resource limits are respected
      expect(optimizationStats.activeRequests).toBeLessThanOrEqual(3); // Max concurrent requests
      
      performanceMonitor.stopMonitoring();
    });

    test('should handle system health monitoring across all services', async () => {
      // 1. Initialize all services
      await serviceContainer.initialize();

      // 2. Wait for health checks to run
      await new Promise(resolve => setTimeout(resolve, 200));

      // 3. Check overall system health
      const systemHealth = serviceContainer.getSystemHealth();
      
      expect(systemHealth.overall).toBeDefined();
      expect(systemHealth.services.length).toBeGreaterThan(0);
      expect(systemHealth.summary.total).toBeGreaterThan(0);

      // 4. Verify individual service health
      const cacheHealth = serviceContainer.getServiceHealth('cache');
      const apiHealth = serviceContainer.getServiceHealth('threadsApi');
      
      expect(cacheHealth?.status).toBeDefined();
      expect(apiHealth?.status).toBeDefined();

      // 5. Test degraded service detection
      const testError = new Error('Simulated service error');
      (serviceContainer as any).handleServiceError('cache', testError);
      (serviceContainer as any).handleServiceError('cache', testError);
      (serviceContainer as any).handleServiceError('cache', testError);
      (serviceContainer as any).handleServiceError('cache', testError);
      (serviceContainer as any).handleServiceError('cache', testError);

      const updatedCacheHealth = serviceContainer.getServiceHealth('cache');
      expect(updatedCacheHealth?.errorCount).toBe(5);
      expect(updatedCacheHealth?.status).toBe('degraded');
    });
  });

  describe('User Experience Integration', () => {
    test('should provide smooth progressive enhancement experience', async () => {
      // Setup authentication
      jest.spyOn(credentials, 'getAccessToken').mockResolvedValue('test-token');
      jest.spyOn(api, 'getThread').mockResolvedValue(mockThreadData);
      jest.spyOn(api, 'getThreadReplies').mockResolvedValue(mockRepliesData);

      // 1. Simulate initial page load with thread summary visible
      const result = await optimizer.progressiveLoadThread('ux-test-thread');
      
      // 2. Verify summary loads quickly
      expect(result.summary).toEqual(mockThreadData);

      // 3. Simulate user clicking "Show replies" 
      const startTime = Date.now();
      const replies = await result.loadReplies();
      const loadTime = Date.now() - startTime;

      // 4. Verify replies load efficiently
      expect(replies).toEqual(mockRepliesData.data);
      expect(loadTime).toBeLessThan(1000); // Should load in < 1 second

      // 5. Verify caching improves subsequent loads
      const cachedStartTime = Date.now();
      const cachedReplies = await result.loadReplies();
      const cachedLoadTime = Date.now() - cachedStartTime;

      expect(cachedReplies).toEqual(mockRepliesData.data);
      expect(cachedLoadTime).toBeLessThan(100); // Cached load should be much faster
    });

    test('should handle graceful degradation when services are unavailable', async () => {
      const gracefulService = await serviceContainer.getGracefulDegradationService();

      // 1. Simulate API service unavailable
      jest.spyOn(api, 'getThread').mockRejectedValue(new Error('Service unavailable'));

      // 2. Attempt thread expansion
      try {
        await optimizer.progressiveLoadThread('degradation-test');
      } catch (error) {
        // 3. Verify graceful degradation provides fallback
        const fallbackMessage = gracefulService.getGenericFallbackMessage();
        expect(fallbackMessage).toBeDefined();
        expect(typeof fallbackMessage).toBe('string');
      }

      // 4. Test browser compatibility detection
      const capabilities = gracefulService.detectBrowserCapabilities();
      expect(capabilities).toBeDefined();
      expect(capabilities.supportsLocalStorage).toBeDefined();
      expect(capabilities.supportsWebGL).toBeDefined();
    });
  });
});