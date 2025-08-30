/**
 * Unit tests for CacheManager - Task 10: Cache Manager Foundation
 * Tests basic cache operations, Chrome Storage API integration, and key generation utilities
 */

import { CacheManager } from '../cache/cacheManager';
import { CacheConfig, CacheEntry, CacheStatistics, CacheSetOptions, CacheGetOptions, CacheResult } from '../cache/types';

// Mock Chrome Storage API
const mockStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
    getBytesInUse: jest.fn()
  },
  sync: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
    getBytesInUse: jest.fn()
  }
};

// Mock Chrome runtime
const mockChrome = {
  storage: mockStorage,
  runtime: {
    lastError: null,
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  }
};

(global as any).chrome = mockChrome;

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let defaultConfig: CacheConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;
    
    defaultConfig = {
      maxSize: 10 * 1024 * 1024, // 10MB
      maxEntries: 1000,
      defaultTtl: 60 * 60 * 1000, // 1 hour
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      storageType: 'local',
      enableCompression: false,
      enableEncryption: false
    };

    cacheManager = new CacheManager(defaultConfig);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default configuration', () => {
      const manager = new CacheManager();
      expect(manager).toBeDefined();
    });

    test('should initialize with custom configuration', () => {
      const customConfig: CacheConfig = {
        ...defaultConfig,
        maxSize: 5 * 1024 * 1024,
        storageType: 'sync'
      };
      const manager = new CacheManager(customConfig);
      expect(manager).toBeDefined();
    });

    test('should validate configuration parameters', () => {
      expect(() => new CacheManager({
        ...defaultConfig,
        maxSize: -1
      })).toThrow('Invalid configuration: maxSize must be positive');
    });
  });

  describe('Basic Cache Operations', () => {
    describe('set method', () => {
      test('should store a simple string value', async () => {
        mockStorage.local.set.mockResolvedValueOnce(undefined);
        
        await cacheManager.set('test-key', 'test-value');
        
        expect(mockStorage.local.set).toHaveBeenCalledWith(
          expect.objectContaining({
            'cache:test-key': expect.objectContaining({
              key: 'test-key',
              value: 'test-value',
              ttl: defaultConfig.defaultTtl,
              createdAt: expect.any(Number),
              lastAccessed: expect.any(Number),
              size: expect.any(Number)
            })
          })
        );
      });

      test('should store complex object value', async () => {
        mockStorage.local.set.mockResolvedValueOnce(undefined);
        const complexValue = { id: 1, name: 'Test', items: [1, 2, 3] };
        
        await cacheManager.set('complex-key', complexValue);
        
        expect(mockStorage.local.set).toHaveBeenCalledWith(
          expect.objectContaining({
            'cache:complex-key': expect.objectContaining({
              value: complexValue
            })
          })
        );
      });

      test('should use custom TTL when provided', async () => {
        mockStorage.local.set.mockResolvedValueOnce(undefined);
        const customTtl = 30 * 60 * 1000; // 30 minutes
        
        await cacheManager.set('test-key', 'test-value', { ttl: customTtl });
        
        expect(mockStorage.local.set).toHaveBeenCalledWith(
          expect.objectContaining({
            'cache:test-key': expect.objectContaining({
              ttl: customTtl
            })
          })
        );
      });

      test('should include tags when provided', async () => {
        mockStorage.local.set.mockResolvedValueOnce(undefined);
        const tags = ['user', 'profile'];
        
        await cacheManager.set('test-key', 'test-value', { tags });
        
        expect(mockStorage.local.set).toHaveBeenCalledWith(
          expect.objectContaining({
            'cache:test-key': expect.objectContaining({
              tags
            })
          })
        );
      });

      test('should handle Chrome storage errors', async () => {
        mockStorage.local.set.mockRejectedValueOnce(new Error('Storage quota exceeded'));
        
        await expect(cacheManager.set('test-key', 'test-value'))
          .rejects.toThrow('Failed to set cache entry: Storage quota exceeded');
      });
    });

    describe('get method', () => {
      test('should retrieve stored value', async () => {
        const mockEntry: CacheEntry = {
          key: 'test-key',
          value: 'test-value',
          ttl: 60000,
          createdAt: Date.now() - 5000,
          lastAccessed: Date.now() - 5000,
          size: 100
        };
        
        mockStorage.local.get.mockResolvedValueOnce({
          'cache:test-key': mockEntry
        });
        
        const result = await cacheManager.get<string>('test-key');
        
        expect(result.found).toBe(true);
        expect(result.value).toBe('test-value');
      });

      test('should return not found for missing key', async () => {
        mockStorage.local.get.mockResolvedValueOnce({});
        
        const result = await cacheManager.get('missing-key');
        
        expect(result.found).toBe(false);
        expect(result.value).toBeUndefined();
      });

      test('should return not found for expired entry', async () => {
        const mockEntry: CacheEntry = {
          key: 'expired-key',
          value: 'expired-value',
          ttl: 1000,
          createdAt: Date.now() - 2000,
          lastAccessed: Date.now() - 2000,
          size: 100
        };
        
        mockStorage.local.get.mockResolvedValueOnce({
          'cache:expired-key': mockEntry
        });
        
        const result = await cacheManager.get('expired-key');
        
        expect(result.found).toBe(false);
        expect(result.value).toBeUndefined();
      });

      test('should update last accessed time when updateAccessTime is true', async () => {
        const mockEntry: CacheEntry = {
          key: 'test-key',
          value: 'test-value',
          ttl: 60000,
          createdAt: Date.now() - 5000,
          lastAccessed: Date.now() - 5000,
          size: 100
        };
        
        mockStorage.local.get.mockResolvedValueOnce({
          'cache:test-key': mockEntry
        });
        mockStorage.local.set.mockResolvedValueOnce(undefined);
        
        await cacheManager.get('test-key', { updateAccessTime: true });
        
        expect(mockStorage.local.set).toHaveBeenCalledWith(
          expect.objectContaining({
            'cache:test-key': expect.objectContaining({
              lastAccessed: expect.any(Number)
            })
          })
        );
      });

      test('should include metadata when requested', async () => {
        const mockEntry: CacheEntry = {
          key: 'test-key',
          value: 'test-value',
          ttl: 60000,
          createdAt: Date.now() - 5000,
          lastAccessed: Date.now() - 5000,
          size: 100,
          version: '1.0',
          tags: ['test']
        };
        
        mockStorage.local.get.mockResolvedValueOnce({
          'cache:test-key': mockEntry
        });
        
        const result = await cacheManager.get('test-key', { includeMetadata: true });
        
        expect(result.metadata).toBeDefined();
        expect(result.metadata!.version).toBe('1.0');
        expect(result.metadata!.tags).toEqual(['test']);
      });
    });

    describe('delete method', () => {
      test('should remove entry from cache', async () => {
        mockStorage.local.remove.mockResolvedValueOnce(undefined);
        
        await cacheManager.delete('test-key');
        
        expect(mockStorage.local.remove).toHaveBeenCalledWith(['cache:test-key']);
      });

      test('should handle deletion of non-existent key', async () => {
        mockStorage.local.remove.mockResolvedValueOnce(undefined);
        
        await expect(cacheManager.delete('non-existent'))
          .resolves.not.toThrow();
      });
    });

    describe('clear method', () => {
      test('should clear all cache entries', async () => {
        mockStorage.local.clear.mockResolvedValueOnce(undefined);
        
        await cacheManager.clear();
        
        expect(mockStorage.local.clear).toHaveBeenCalled();
      });
    });
  });

  describe('Cache Key Generation Utilities', () => {
    test('should generate simple cache key', () => {
      const key = cacheManager.generateKey('user', '123');
      expect(key).toBe('cache:user:123');
    });

    test('should generate key with prefix', () => {
      const key = cacheManager.generateKey('user', '123', { prefix: 'app' });
      expect(key).toBe('cache:app:user:123');
    });

    test('should generate key with namespace', () => {
      const key = cacheManager.generateKey('user', '123', { namespace: 'profiles' });
      expect(key).toBe('cache:profiles:user:123');
    });

    test('should generate key with version', () => {
      const key = cacheManager.generateKey('user', '123', { version: 'v2' });
      expect(key).toBe('cache:user:123:v2');
    });

    test('should generate hashed key when includeHash is true', () => {
      const key = cacheManager.generateKey('very-long-key-that-should-be-hashed', 'data', { includeHash: true });
      expect(key).toMatch(/^cache:[a-f0-9]{8}$/);
    });

    test('should generate consistent hashed keys', () => {
      const key1 = cacheManager.generateKey('same-input', 'data', { includeHash: true });
      const key2 = cacheManager.generateKey('same-input', 'data', { includeHash: true });
      expect(key1).toBe(key2);
    });
  });

  describe('Chrome Storage API Integration', () => {
    test('should use sync storage when configured', async () => {
      const syncConfig = { ...defaultConfig, storageType: 'sync' as const };
      const syncManager = new CacheManager(syncConfig);
      
      mockStorage.sync.set.mockResolvedValueOnce(undefined);
      mockStorage.sync.get.mockResolvedValueOnce({});
      
      await syncManager.set('test-key', 'test-value');
      
      expect(mockStorage.sync.set).toHaveBeenCalled();
    });

    test('should handle storage quota exceeded error', async () => {
      const quotaError = new Error('QUOTA_BYTES quota exceeded');
      mockStorage.local.set.mockRejectedValueOnce(quotaError);
      
      await expect(cacheManager.set('test-key', 'test-value'))
        .rejects.toThrow('Failed to set cache entry: QUOTA_BYTES quota exceeded');
    });

    test('should calculate storage size usage', async () => {
      mockStorage.local.getBytesInUse.mockResolvedValueOnce(1024);
      
      const size = await cacheManager.getStorageSize();
      
      expect(size).toBe(1024);
      expect(mockStorage.local.getBytesInUse).toHaveBeenCalled();
    });
  });

  describe('Cache Statistics', () => {
    test('should return cache statistics', async () => {
      // Mock the storage to return both stats and some sample cache entries
      const mockData = {
        'cache:stats': {
          totalEntries: 5,
          totalSize: 1024,
          hitCount: 10,
          missCount: 3,
          evictionCount: 1,
          hitRate: 76.9
        },
        'cache:entry1': { key: 'entry1', value: 'test', size: 100, createdAt: Date.now(), lastAccessed: Date.now(), ttl: 5000 },
        'cache:entry2': { key: 'entry2', value: 'test', size: 150, createdAt: Date.now(), lastAccessed: Date.now(), ttl: 5000 }
      };
      
      // Mock both calls to storage.get(null) - one for stats, one for real-time calculation
      mockStorage.local.get
        .mockResolvedValueOnce(mockData) // First call for getting base stats
        .mockResolvedValueOnce(mockData); // Second call for real-time calculation
      
      const stats = await cacheManager.getStatistics();
      
      expect(stats.totalEntries).toBe(2); // Real-time count from actual entries
      expect(stats.hitRate).toBe(76.9); // From base stats
      expect(stats.totalSize).toBe(250); // Real-time calculation: 100 + 150
    });

    test('should update hit count on cache hit', async () => {
      const mockEntry: CacheEntry = {
        key: 'test-key',
        value: 'test-value',
        ttl: 60000,
        createdAt: Date.now() - 5000,
        lastAccessed: Date.now() - 5000,
        size: 100
      };
      
      mockStorage.local.get
        .mockResolvedValueOnce({ 'cache:test-key': mockEntry })
        .mockResolvedValueOnce({ 'cache:stats': { hitCount: 0, missCount: 0 } });
      mockStorage.local.set.mockResolvedValueOnce(undefined);
      
      await cacheManager.get('test-key');
      
      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'cache:stats': expect.objectContaining({
            hitCount: 1
          })
        })
      );
    });

    test('should update miss count on cache miss', async () => {
      mockStorage.local.get
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ 'cache:stats': { hitCount: 0, missCount: 0 } });
      mockStorage.local.set.mockResolvedValueOnce(undefined);
      
      await cacheManager.get('missing-key');
      
      expect(mockStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'cache:stats': expect.objectContaining({
            missCount: 1
          })
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle Chrome runtime errors', async () => {
      mockChrome.runtime.lastError = { message: 'Extension context invalidated' };
      mockStorage.local.get.mockResolvedValueOnce({});
      
      await expect(cacheManager.get('test-key'))
        .rejects.toThrow('Chrome runtime error: Extension context invalidated');
    });

    test('should handle storage API errors gracefully', async () => {
      // When storage access fails, the get method should still work gracefully
      // and return "not found" rather than crashing the application
      mockStorage.local.get.mockRejectedValue(new Error('Storage access denied'));
      
      // Create a new instance to avoid any cached calls
      const testManager = new CacheManager(defaultConfig);
      
      // Since statistics calls are fire-and-forget, the main operation should still work
      // but return "not found" since it can't actually read from storage
      const result = await testManager.get('test-key');
      
      expect(result.found).toBe(false);
      expect(result.value).toBeUndefined();
    });
  });
});