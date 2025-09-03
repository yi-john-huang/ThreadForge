/**
 * Service Integration Tests
 * Tests for comprehensive service integration layer with dependency injection,
 * lifecycle management, and health monitoring
 */

import { ServiceContainer, ThreadForgeServiceContainer, ServiceEvent } from '../services/serviceContainer';
import { CacheManager } from '../cache/cacheManager';
import { PerformanceMonitor } from '../performance/performanceMonitor';
import { PerformanceOptimizer } from '../optimization/performanceOptimizer';
import { ThreadsAPIService } from '../api/threadsApiService';

// Mock Chrome API
const mockChrome = {
  storage: {
    local: {
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
    }
  }
};

(global as any).chrome = mockChrome;

// Mock DOM APIs
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

describe('ServiceContainer', () => {
  let container: ServiceContainer;
  const serviceEvents: ServiceEvent[] = [];

  beforeEach(() => {
    container = new ServiceContainer();
    serviceEvents.length = 0;
    
    // Listen to service events
    container.addEventListener((event) => {
      serviceEvents.push(event);
    });

    // Reset Chrome API mocks
    jest.clearAllMocks();
    mockChrome.storage.local.get.mockResolvedValue({});
    mockChrome.storage.local.set.mockResolvedValue();
  });

  afterEach(async () => {
    if (container) {
      await container.destroy();
    }
  });

  describe('Service Registration and Discovery', () => {
    test('should register and retrieve services', async () => {
      let mockService: any = null;
      container.registerService('testService', () => {
        mockService = { id: 'test', init: jest.fn() };
        return mockService;
      });

      const service = await container.getService('testService');
      
      expect(service).toBe(mockService);
      expect(service.id).toBe('test');
    });

    test('should prevent duplicate service registration', () => {
      container.registerService('testService', () => ({}));
      
      expect(() => {
        container.registerService('testService', () => ({}));
      }).toThrow("Service 'testService' is already registered");
    });

    test('should throw error for unregistered service', async () => {
      await expect(container.getService('nonExistent')).rejects.toThrow(
        "Service 'nonExistent' not found"
      );
    });

    test('should respect service enable/disable configuration', async () => {
      container.registerService('disabledService', () => ({}), {
        enabled: false,
        priority: 1,
        dependencies: []
      });

      await expect(container.getService('disabledService')).rejects.toThrow(
        "Service 'disabledService' is disabled"
      );
    });
  });

  describe('Dependency Injection', () => {
    test('should resolve dependencies in correct order', async () => {
      const initOrder: string[] = [];

      container.registerService('serviceA', () => {
        initOrder.push('A');
        return { name: 'A' };
      }, { enabled: true, priority: 1, dependencies: [] });

      container.registerService('serviceB', async () => {
        await container.getService('serviceA');
        initOrder.push('B');
        return { name: 'B' };
      }, { enabled: true, priority: 2, dependencies: ['serviceA'] });

      container.registerService('serviceC', async () => {
        await container.getService('serviceB');
        initOrder.push('C');
        return { name: 'C' };
      }, { enabled: true, priority: 3, dependencies: ['serviceB'] });

      await container.getService('serviceC');

      expect(initOrder).toEqual(['A', 'B', 'C']);
    });

    test('should handle circular dependencies gracefully', async () => {
      container.registerService('circularA', async () => {
        // This would cause infinite recursion if not handled
        const b = await container.getService('circularB');
        return { name: 'A', ref: b };
      }, { enabled: true, priority: 1, dependencies: ['circularB'] });

      container.registerService('circularB', async () => {
        const a = await container.getService('circularA');
        return { name: 'B', ref: a };
      }, { enabled: true, priority: 2, dependencies: ['circularA'] });

      // Should eventually fail due to circular dependency
      await expect(container.getService('circularA')).rejects.toThrow();
    });

    test('should initialize services only once', async () => {
      const factory = jest.fn(() => ({ id: 'singleton' }));
      container.registerService('singleton', factory);

      const service1 = await container.getService('singleton');
      const service2 = await container.getService('singleton');

      expect(factory).toHaveBeenCalledTimes(1);
      expect(service1).toBe(service2);
    });
  });

  describe('Service Lifecycle Management', () => {
    test('should emit service lifecycle events', async () => {
      container.registerService('eventService', () => ({
        destroy: jest.fn()
      }));

      await container.getService('eventService');
      await container.stopService('eventService');

      const eventTypes = serviceEvents.map(e => e.type);
      expect(eventTypes).toContain('initializing');
      expect(eventTypes).toContain('initialized');
      expect(eventTypes).toContain('stopped');
    });

    test('should handle service initialization errors', async () => {
      container.registerService('errorService', () => {
        throw new Error('Initialization failed');
      });

      await expect(container.getService('errorService')).rejects.toThrow('Initialization failed');

      const errorEvents = serviceEvents.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].serviceName).toBe('errorService');
    });

    test('should restart services correctly', async () => {
      let instanceCount = 0;
      container.registerService('restartableService', () => ({
        id: ++instanceCount,
        destroy: jest.fn()
      }));

      const service1 = await container.getService('restartableService');
      expect(service1.id).toBe(1);

      await container.restartService('restartableService');
      const service2 = await container.getService('restartableService');
      
      expect(service2.id).toBe(2);
      expect(service1.destroy).toHaveBeenCalled();
    });

    test('should initialize all services in proper order', async () => {
      const initOrder: string[] = [];

      // Register services with different priorities
      container.registerService('high', () => {
        initOrder.push('high');
        return {};
      }, { enabled: true, priority: 1, dependencies: [] });

      container.registerService('low', () => {
        initOrder.push('low');
        return {};
      }, { enabled: true, priority: 3, dependencies: [] });

      container.registerService('medium', () => {
        initOrder.push('medium');
        return {};
      }, { enabled: true, priority: 2, dependencies: [] });

      await container.initialize();

      expect(initOrder).toEqual(['high', 'medium', 'low']);
    });
  });

  describe('Health Monitoring', () => {
    test('should track service health status', async () => {
      container.registerService('healthyService', () => ({
        getStatus: () => 'healthy'
      }), {
        enabled: true,
        priority: 1,
        dependencies: [],
        healthCheckInterval: 50 // Fast interval for testing
      });

      await container.getService('healthyService');
      
      // Wait for health check
      await new Promise(resolve => setTimeout(resolve, 100));

      const health = container.getServiceHealth('healthyService');
      expect(health?.status).toBe('healthy');
      expect(health?.name).toBe('healthyService');
    });

    test('should detect degraded services', async () => {
      container.registerService('degradingService', () => ({
        id: 'degrading-service'
      }));

      await container.getService('degradingService');
      
      // Simulate multiple errors to trigger degraded status
      for (let i = 0; i < 5; i++) {
        (container as any).handleServiceError('degradingService', new Error(`Error ${i + 1}`));
      }

      const health = container.getServiceHealth('degradingService');
      expect(health?.status).toBe('degraded');
      expect(health?.errorCount).toBe(5);
    });

    test('should provide system health summary', async () => {
      container.registerService('healthyService1', () => ({}), {
        enabled: true, priority: 1, dependencies: []
      });
      
      container.registerService('healthyService2', () => ({}), {
        enabled: true, priority: 2, dependencies: []
      });

      await container.initialize();

      const systemHealth = container.getSystemHealth();
      
      expect(systemHealth.overall).toBe('healthy');
      expect(systemHealth.summary.total).toBe(2);
      expect(systemHealth.summary.healthy).toBe(2);
      expect(systemHealth.services).toHaveLength(2);
    });

    test('should handle health check errors gracefully', async () => {
      container.registerService('faultyHealthService', () => ({
        healthCheck: () => {
          throw new Error('Health check failed');
        }
      }), {
        enabled: true,
        priority: 1,
        dependencies: [],
        healthCheckInterval: 50
      });

      await container.getService('faultyHealthService');
      
      // Wait for health check to fail
      await new Promise(resolve => setTimeout(resolve, 100));

      // Service should continue running despite health check failure
      const health = container.getServiceHealth('faultyHealthService');
      expect(health?.status).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle service cleanup errors gracefully', async () => {
      const mockDestroy = jest.fn(() => {
        throw new Error('Cleanup failed');
      });

      container.registerService('problematicService', () => ({
        destroy: mockDestroy
      }));

      await container.getService('problematicService');
      
      // Should not throw despite cleanup error
      await expect(container.stopService('problematicService')).resolves.not.toThrow();
      expect(mockDestroy).toHaveBeenCalled();
    });

    test('should prevent operations on destroyed container', async () => {
      await container.destroy();

      expect(() => container.registerService('test', () => ({}))).toThrow(
        'Cannot register services on destroyed container'
      );

      await expect(container.initialize()).rejects.toThrow(
        'Cannot initialize destroyed container'
      );
    });

    test('should handle concurrent initialization attempts', async () => {
      container.registerService('concurrentService', () => ({
        id: Math.random()
      }));

      // Start multiple initialization attempts simultaneously
      const promises = [
        container.getService('concurrentService'),
        container.getService('concurrentService'),
        container.getService('concurrentService')
      ];

      const services = await Promise.all(promises);

      // All should return the same instance
      expect(services[0]).toBe(services[1]);
      expect(services[1]).toBe(services[2]);
    });
  });

  describe('Performance and Memory Management', () => {
    test('should clean up resources on destroy', async () => {
      const mockDestroy1 = jest.fn();
      const mockDestroy2 = jest.fn();

      container.registerService('cleanupService1', () => ({
        destroy: mockDestroy1
      }));

      container.registerService('cleanupService2', () => ({
        destroy: mockDestroy2
      }));

      await container.getService('cleanupService1');
      await container.getService('cleanupService2');
      
      await container.destroy();

      expect(mockDestroy1).toHaveBeenCalled();
      expect(mockDestroy2).toHaveBeenCalled();
    });

    test('should handle large number of services efficiently', async () => {
      const serviceCount = 100;
      const startTime = Date.now();

      // Register many services
      for (let i = 0; i < serviceCount; i++) {
        container.registerService(`service${i}`, () => ({
          id: i
        }), {
          enabled: true,
          priority: i,
          dependencies: []
        });
      }

      await container.initialize();
      const initTime = Date.now() - startTime;

      // Should initialize reasonably quickly (less than 5 seconds)
      expect(initTime).toBeLessThan(5000);

      // All services should be healthy
      const systemHealth = container.getSystemHealth();
      expect(systemHealth.summary.total).toBe(serviceCount);
    });
  });
});

describe('ThreadForgeServiceContainer', () => {
  let container: ThreadForgeServiceContainer;

  beforeEach(() => {
    // Reset singleton
    (ThreadForgeServiceContainer as any).instance = null;
    container = ThreadForgeServiceContainer.getInstance();

    // Mock Chrome API
    jest.clearAllMocks();
    mockChrome.storage.local.get.mockResolvedValue({});
    mockChrome.storage.local.set.mockResolvedValue();
  });

  afterEach(async () => {
    if (container) {
      await container.destroy();
      (ThreadForgeServiceContainer as any).instance = null;
    }
  });

  describe('Singleton Pattern', () => {
    test('should maintain singleton instance', () => {
      const instance1 = ThreadForgeServiceContainer.getInstance();
      const instance2 = ThreadForgeServiceContainer.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Default Service Registration', () => {
    test('should have all default services registered', () => {
      const health = container.getHealthStatus();
      const serviceNames = health.map(h => h.name);
      
      const expectedServices = [
        'cache',
        'oauth2',
        'credentials', 
        'threadsApi',
        'performanceMonitor',
        'performanceOptimizer',
        'upgradeNotification',
        'migrationGuide',
        'gracefulDegradation'
      ];

      expectedServices.forEach(serviceName => {
        expect(serviceNames).toContain(serviceName);
      });
    });

    test('should initialize cache service', async () => {
      const cache = await container.getCache();
      
      expect(cache).toBeInstanceOf(CacheManager);
      
      const health = container.getServiceHealth('cache');
      expect(health?.status).toBe('healthy');
    });

    test('should initialize performance monitor', async () => {
      const monitor = await container.getPerformanceMonitor();
      
      expect(monitor).toBeInstanceOf(PerformanceMonitor);
      
      const health = container.getServiceHealth('performanceMonitor');
      expect(health?.status).toBe('healthy');
    });

    test('should initialize threads API with authentication', async () => {
      const api = await container.getThreadsAPI();
      
      expect(api).toBeInstanceOf(ThreadsAPIService);
      
      const health = container.getServiceHealth('threadsApi');
      expect(health?.status).toBe('healthy');
    });

    test('should initialize performance optimizer with dependencies', async () => {
      const optimizer = await container.getPerformanceOptimizer();
      
      expect(optimizer).toBeInstanceOf(PerformanceOptimizer);
      
      // Verify it has access to its dependencies
      const stats = optimizer.getOptimizationStats();
      expect(stats).toBeDefined();
      expect(typeof stats.behaviorScore).toBe('number');
      
      const health = container.getServiceHealth('performanceOptimizer');
      expect(health?.status).toBe('healthy');
    });
  });

  describe('Service Integration', () => {
    test('should properly wire service dependencies', async () => {
      // Initialize all services
      await container.initialize();
      
      // Verify service dependencies are wired correctly
      const systemHealth = container.getSystemHealth();
      expect(systemHealth.overall).toBe('healthy');
      
      // Verify specific service integrations
      const optimizer = await container.getPerformanceOptimizer();
      const monitor = await container.getPerformanceMonitor();
      const cache = await container.getCache();
      
      // These should all be working together
      expect(optimizer).toBeDefined();
      expect(monitor).toBeDefined();
      expect(cache).toBeDefined();
    });

    test('should handle service initialization in correct order', async () => {
      const events: string[] = [];
      
      container.addEventListener((event) => {
        if (event.type === 'initialized') {
          events.push(event.serviceName);
        }
      });

      await container.initialize();

      // Cache should initialize before services that depend on it
      const cacheIndex = events.indexOf('cache');
      const optimizerIndex = events.indexOf('performanceOptimizer');
      
      expect(cacheIndex).toBeGreaterThan(-1);
      expect(optimizerIndex).toBeGreaterThan(-1);
      expect(cacheIndex).toBeLessThan(optimizerIndex);
    });

    test('should provide comprehensive system health monitoring', async () => {
      await container.initialize();
      
      // Wait a bit for health checks
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const systemHealth = container.getSystemHealth();
      
      expect(systemHealth.overall).toBe('healthy');
      expect(systemHealth.summary.total).toBeGreaterThan(5);
      expect(systemHealth.summary.healthy).toBeGreaterThan(0);
      
      // Should have health information for each service
      systemHealth.services.forEach(service => {
        expect(service.name).toBeTruthy();
        expect(service.status).toBeDefined();
        expect(service.lastCheck).toBeGreaterThan(0);
      });
    });

    test('should handle partial service failures gracefully', async () => {
      // Mock one service to fail
      jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Initialize what we can
      try {
        await container.initialize();
      } catch (error) {
        // Some services might fail to initialize
      }
      
      const systemHealth = container.getSystemHealth();
      
      // System should still provide useful information
      expect(systemHealth.services.length).toBeGreaterThan(0);
      expect(systemHealth.summary).toBeDefined();
    });
  });

  describe('Performance Characteristics', () => {
    test('should initialize services within reasonable time', async () => {
      const startTime = Date.now();
      
      await container.initialize();
      
      const initTime = Date.now() - startTime;
      
      // Should initialize within 10 seconds
      expect(initTime).toBeLessThan(10000);
    });

    test('should handle concurrent service access efficiently', async () => {
      const promises = [];
      
      // Request multiple services concurrently
      for (let i = 0; i < 10; i++) {
        promises.push(container.getCache());
        promises.push(container.getPerformanceMonitor());
        promises.push(container.getThreadsAPI());
      }
      
      const startTime = Date.now();
      const results = await Promise.all(promises);
      const accessTime = Date.now() - startTime;
      
      // Should handle concurrent access quickly
      expect(accessTime).toBeLessThan(5000);
      
      // All cache instances should be the same
      const cacheInstances = results.filter((_, index) => index % 3 === 0);
      cacheInstances.forEach(cache => {
        expect(cache).toBe(cacheInstances[0]);
      });
    });

    test('should properly clean up all resources', async () => {
      await container.initialize();
      
      const healthBefore = container.getHealthStatus();
      const runningServices = healthBefore.filter(h => h.status !== 'stopped');
      
      expect(runningServices.length).toBeGreaterThan(0);
      
      await container.destroy();
      
      const healthAfter = container.getHealthStatus();
      expect(healthAfter.length).toBe(0);
    });
  });
});