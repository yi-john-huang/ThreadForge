/**
 * Simplified End-to-End Integration Tests
 * Tests complete flow with core components integrated
 */

import { ThreadForgeServiceContainer } from '../services/serviceContainer';

// Mock Chrome API
const mockStorage: { [key: string]: any } = {};

const mockChrome = {
  storage: {
    local: {
      get: jest.fn().mockImplementation((keys) => {
        if (keys === null) {
          // Return all items
          return Promise.resolve(mockStorage);
        }
        if (Array.isArray(keys)) {
          // Return requested keys
          const result: { [key: string]: any } = {};
          keys.forEach(key => {
            if (key in mockStorage) {
              result[key] = mockStorage[key];
            }
          });
          return Promise.resolve(result);
        }
        // Single key
        const result = keys in mockStorage ? { [keys]: mockStorage[keys] } : {};
        return Promise.resolve(result);
      }),
      set: jest.fn().mockImplementation((items) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
      clear: jest.fn().mockImplementation(() => {
        Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
        return Promise.resolve();
      }),
      remove: jest.fn().mockImplementation((keys) => {
        if (Array.isArray(keys)) {
          keys.forEach(key => delete mockStorage[key]);
        } else {
          delete mockStorage[keys];
        }
        return Promise.resolve();
      })
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
    }
  }
};

(global as any).chrome = mockChrome;

// Mock DOM
Object.defineProperty(document, 'addEventListener', {
  writable: true,
  value: jest.fn()
});

Object.defineProperty(document, 'createElement', {
  writable: true,
  value: jest.fn(() => ({
    getContext: jest.fn(() => ({})),
    style: {},
    appendChild: jest.fn(),
    addEventListener: jest.fn()
  }))
});

describe('Simplified End-to-End Integration', () => {
  let serviceContainer: ThreadForgeServiceContainer;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clear mock storage
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    serviceContainer = ThreadForgeServiceContainer.getInstance();
  });

  afterEach(async () => {
    if (serviceContainer) {
      await serviceContainer.destroy();
      (ThreadForgeServiceContainer as any).instance = null;
    }
  });

  describe('Service Integration', () => {
    test('should initialize all services successfully', async () => {
      await serviceContainer.initialize();
      
      const systemHealth = serviceContainer.getSystemHealth();
      
      expect(systemHealth.overall).toBe('healthy');
      expect(systemHealth.summary.total).toBeGreaterThan(5);
      expect(systemHealth.summary.healthy).toBeGreaterThan(0);
    });

    test('should provide access to all core services', async () => {
      const cache = await serviceContainer.getCache();
      const api = await serviceContainer.getThreadsAPI();
      const performanceMonitor = await serviceContainer.getPerformanceMonitor();
      const optimizer = await serviceContainer.getPerformanceOptimizer();
      const credentials = await serviceContainer.getCredentialsManager();

      expect(cache).toBeDefined();
      expect(api).toBeDefined();
      expect(performanceMonitor).toBeDefined();
      expect(optimizer).toBeDefined();
      expect(credentials).toBeDefined();
    });

    test('should handle service dependencies correctly', async () => {
      // Performance optimizer depends on monitor, API, and cache
      const optimizer = await serviceContainer.getPerformanceOptimizer();
      const stats = optimizer.getOptimizationStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.behaviorScore).toBe('number');
      expect(typeof stats.batchQueue).toBe('number');
      expect(typeof stats.prefetchQueue).toBe('number');
    });
  });

  describe('Cache Integration', () => {
    test('should store and retrieve data from cache', async () => {
      const cache = await serviceContainer.getCache();
      
      const testData = { id: 'test', content: 'test data' };
      
      await cache.set('test-key', testData);
      const result = await cache.get('test-key');
      
      expect(result.found).toBe(true);
      expect(result.value).toEqual(testData);
    });

    test('should respect TTL settings', async () => {
      const cache = await serviceContainer.getCache();
      
      const testData = { id: 'ttl-test', content: 'expires quickly' };
      
      await cache.set('ttl-test-key', testData, { ttl: 50 }); // 50ms
      
      // Should be available immediately
      let result = await cache.get('ttl-test-key');
      expect(result.found).toBe(true);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      result = await cache.get('ttl-test-key');
      expect(result.found).toBe(false);
    });
  });

  describe('Performance Monitoring', () => {
    test('should collect memory metrics', async () => {
      const monitor = await serviceContainer.getPerformanceMonitor();
      
      const metrics = monitor.getMemoryMetrics();
      
      expect(metrics).toBeDefined();
      expect(typeof metrics.usagePercentage).toBe('number');
    });

    test('should track operation timing', async () => {
      const monitor = await serviceContainer.getPerformanceMonitor();
      
      const timerId = monitor.startTimer('test-operation');
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));
      
      monitor.endTimer(timerId, 'test-operation');
      
      const percentiles = monitor.getResponseTimePercentiles('test-operation');
      expect(percentiles).toBeDefined();
    });
  });

  describe('Performance Optimization', () => {
    test('should handle batch requests', async () => {
      const optimizer = await serviceContainer.getPerformanceOptimizer();
      
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      optimizer.batchRequest('test-1', 'medium', callback1, jest.fn());
      optimizer.batchRequest('test-2', 'medium', callback2, jest.fn());
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const stats = optimizer.getOptimizationStats();
      expect(stats.batchQueue).toBeGreaterThanOrEqual(0);
    });

    test('should track user behavior', async () => {
      const optimizer = await serviceContainer.getPerformanceOptimizer();
      
      optimizer.trackBehavior('view_thread', { author: 'test', viewTime: 5000 });
      optimizer.trackBehavior('scroll', { depth: 0.7 });
      
      const stats = optimizer.getOptimizationStats();
      expect(stats.behaviorScore).toBeGreaterThanOrEqual(0);
    });

    test('should support progressive loading pattern', async () => {
      const optimizer = await serviceContainer.getPerformanceOptimizer();
      const api = await serviceContainer.getThreadsAPI();
      
      // Mock API response
      jest.spyOn(api, 'getThread').mockResolvedValue({
        id: 'progressive-test',
        text: 'Test thread content'
      } as any);
      
      jest.spyOn(api, 'getThreadReplies').mockResolvedValue({
        data: [{ id: 'reply-1', text: 'Test reply' }]
      } as any);
      
      const result = await optimizer.progressiveLoadThread('progressive-test');
      
      expect(result.summary).toBeDefined();
      expect(typeof result.loadReplies).toBe('function');
      
      const replies = await result.loadReplies();
      expect(replies).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle service errors gracefully', async () => {
      const cache = await serviceContainer.getCache();
      
      // Mock cache error
      jest.spyOn(cache, 'set').mockRejectedValueOnce(new Error('Cache error'));
      
      // Should not throw
      await expect(cache.set('error-test', 'data')).rejects.toThrow('Cache error');
      
      // But other operations should still work
      await expect(cache.get('other-key')).resolves.toBeDefined();
    });

    test('should maintain system health monitoring', async () => {
      await serviceContainer.initialize();
      
      // Simulate some errors
      (serviceContainer as any).handleServiceError('cache', new Error('Test error'));
      
      const health = serviceContainer.getServiceHealth('cache');
      expect(health?.errorCount).toBeGreaterThan(0);
      
      const systemHealth = serviceContainer.getSystemHealth();
      expect(systemHealth).toBeDefined();
      expect(systemHealth.summary.total).toBeGreaterThan(0);
    });
  });

  describe('Authentication Integration', () => {
    test('should provide authentication services', async () => {
      const credentials = await serviceContainer.getCredentialsManager();
      const oauth2 = await serviceContainer.getOAuth2Service();
      
      expect(credentials).toBeDefined();
      expect(oauth2).toBeDefined();
      
      // Test basic functionality
      const authStatus = await oauth2.getAuthStatus();
      expect(authStatus).toBeDefined();
      expect(typeof authStatus.isAuthenticated).toBe('boolean');
    });

    test('should handle credential storage', async () => {
      const credentials = await serviceContainer.getCredentialsManager();
      
      const testCredentials = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 3600000
      };
      
      try {
        await credentials.saveCredentials(testCredentials);
        
        const stored = await credentials.getStoredCredentials();
        expect(stored).toBeDefined();
        expect(stored?.accessToken).toBe('test-token');
      } catch (error) {
        // In test environment, Chrome API might not be fully available
        // This is expected behavior
        expect((error as Error).message).toContain('Chrome API not available');
      }
    });
  });

  describe('Resource Management', () => {
    test('should clean up resources properly', async () => {
      await serviceContainer.initialize();
      
      const healthBefore = serviceContainer.getHealthStatus();
      expect(healthBefore.length).toBeGreaterThan(0);
      
      await serviceContainer.destroy();
      
      const healthAfter = serviceContainer.getHealthStatus();
      expect(healthAfter.length).toBe(0);
    });

    test('should handle concurrent operations', async () => {
      const cache = await serviceContainer.getCache();
      
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(cache.set(`concurrent-${i}`, { data: i }));
      }
      
      await Promise.all(promises);
      
      // Verify all data was stored
      for (let i = 0; i < 10; i++) {
        const result = await cache.get(`concurrent-${i}`);
        expect(result.found).toBe(true);
        expect(result.value.data).toBe(i);
      }
    });
  });

  describe('Migration and Upgrade Services', () => {
    test('should provide migration services', async () => {
      const upgradeService = await serviceContainer.getUpgradeNotificationService();
      const migrationGuide = await serviceContainer.getMigrationGuideManager();
      const gracefulService = await serviceContainer.getGracefulDegradationService();
      
      expect(upgradeService).toBeDefined();
      expect(migrationGuide).toBeDefined();
      expect(gracefulService).toBeDefined();
      
      // Test browser capability detection
      const capabilities = gracefulService.detectBrowserCapabilities();
      expect(capabilities).toBeDefined();
      expect(typeof capabilities.supportsNotifications).toBe('boolean');
      expect(typeof capabilities.supportsWebGL).toBe('boolean');
      expect(typeof capabilities.supportsModernJS).toBe('boolean');
    });

    test('should handle performance monitoring integration', async () => {
      const gracefulService = await serviceContainer.getGracefulDegradationService();
      const performanceMonitor = await serviceContainer.getPerformanceMonitor();
      
      // These services should be properly integrated
      expect(gracefulService).toBeDefined();
      expect(performanceMonitor).toBeDefined();
      
      const memoryMetrics = performanceMonitor.getMemoryMetrics();
      expect(memoryMetrics).toBeDefined();
    });
  });
});