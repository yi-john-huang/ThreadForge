/**
 * Unit tests for LRU Eviction and TTL Handling - Task 11
 * Tests LRU eviction policy, TTL expiration, automatic cleanup, and background scheduling
 */

import { CacheManager } from '../cache/cacheManager';
import { CacheConfig } from '../cache/types';

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

// Mock timers
jest.useFakeTimers();

describe('CacheManager - LRU Eviction and TTL Handling', () => {
  let cacheManager: CacheManager;
  let smallConfig: CacheConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    mockChrome.runtime.lastError = null;
    
    // Use small limits to test eviction easily
    smallConfig = {
      maxSize: 1024, // 1KB
      maxEntries: 3, // Only 3 entries max
      defaultTtl: 5000, // 5 seconds
      cleanupInterval: 1000, // 1 second cleanup
      storageType: 'local',
      enableCompression: false,
      enableEncryption: false
    };

    cacheManager = new CacheManager(smallConfig);
  });

  afterEach(() => {
    cacheManager?.destroy();
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  describe('LRU Eviction Policy', () => {
    test('should evict least recently used entry when max entries exceeded', async () => {
      // Mock storage to track what gets stored
      const storedEntries = new Map();
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (!keys || keys === null) {
          // Return all stored entries when keys is null (like Chrome API)
          return Object.fromEntries(storedEntries);
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach((key: string) => {
            if (storedEntries.has(key)) {
              result[key] = storedEntries.get(key);
            }
          });
        }
        return result;
      });
      mockStorage.local.remove.mockImplementation(async (keys: string[]) => {
        keys.forEach(key => storedEntries.delete(key));
      });

      // Add 3 entries (at max capacity)
      await cacheManager.set('entry1', 'value1');
      await cacheManager.set('entry2', 'value2');
      await cacheManager.set('entry3', 'value3');

      // Access entry1 to make it most recently used
      // Advance time slightly to ensure different lastAccessed timestamps
      jest.advanceTimersByTime(10);
      await cacheManager.get('entry1', { updateAccessTime: true });
      
      // Add 4th entry - should evict entry2 (least recently used)
      await cacheManager.set('entry4', 'value4');

      // entry2 should be evicted, others should remain
      const result1 = await cacheManager.get('entry1');
      const result2 = await cacheManager.get('entry2');
      const result3 = await cacheManager.get('entry3');
      const result4 = await cacheManager.get('entry4');

      expect(result1.found).toBe(true);
      expect(result2.found).toBe(false); // Evicted
      expect(result3.found).toBe(true);
      expect(result4.found).toBe(true);
    });

    test('should evict entries based on size when max size exceeded', async () => {
      // Create entries that will exceed size limit
      const largeValue = 'x'.repeat(400); // ~400 bytes each
      
      const storedEntries = new Map();
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (!keys || keys === null) {
          // Return all stored entries when keys is null (like Chrome API)
          return Object.fromEntries(storedEntries);
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach((key: string) => {
            if (storedEntries.has(key)) {
              result[key] = storedEntries.get(key);
            }
          });
        }
        return result;
      });
      mockStorage.local.remove.mockImplementation(async (keys: string[]) => {
        keys.forEach(key => storedEntries.delete(key));
      });

      // Add entries that will exceed 1KB limit
      await cacheManager.set('large1', largeValue);
      await cacheManager.set('large2', largeValue);
      
      // Access large1 to make it more recently used
      jest.advanceTimersByTime(10);
      await cacheManager.get('large1', { updateAccessTime: true });
      
      // Add third large entry - should trigger size-based eviction
      await cacheManager.set('large3', largeValue);

      // large2 should be evicted due to size constraints
      const result1 = await cacheManager.get('large1');
      const result2 = await cacheManager.get('large2');
      const result3 = await cacheManager.get('large3');

      expect(result1.found).toBe(true);
      expect(result2.found).toBe(false); // Evicted due to size
      expect(result3.found).toBe(true);
    });

    test('should update LRU order when entries are accessed', async () => {
      const storedEntries = new Map();
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (!keys || keys === null) {
          // Return all stored entries when keys is null (like Chrome API)
          return Object.fromEntries(storedEntries);
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach((key: string) => {
            if (storedEntries.has(key)) {
              result[key] = storedEntries.get(key);
            }
          });
        }
        return result;
      });
      mockStorage.local.remove.mockImplementation(async (keys: string[]) => {
        keys.forEach(key => storedEntries.delete(key));
      });

      // Fill to capacity
      await cacheManager.set('a', 'valueA');
      await cacheManager.set('b', 'valueB'); 
      await cacheManager.set('c', 'valueC');

      // Access 'a' to make it most recently used
      jest.advanceTimersByTime(10);
      await cacheManager.get('a', { updateAccessTime: true });

      // Add new entry - 'b' should be evicted (oldest non-accessed)
      await cacheManager.set('d', 'valueD');

      const resultA = await cacheManager.get('a');
      const resultB = await cacheManager.get('b');
      const resultC = await cacheManager.get('c');
      const resultD = await cacheManager.get('d');

      expect(resultA.found).toBe(true); // Recently accessed
      expect(resultB.found).toBe(false); // Should be evicted
      expect(resultC.found).toBe(true); // More recent than b
      expect(resultD.found).toBe(true); // Newly added
    });

    test('should track eviction statistics', async () => {
      const storedEntries = new Map();
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (!keys || keys === null) {
          // Return all stored entries when keys is null (like Chrome API)
          return Object.fromEntries(storedEntries);
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach((key: string) => {
            if (storedEntries.has(key)) {
              result[key] = storedEntries.get(key);
            }
          });
        }
        return result;
      });
      mockStorage.local.remove.mockImplementation(async (keys: string[]) => {
        keys.forEach(key => storedEntries.delete(key));
      });

      // Fill cache to capacity
      await cacheManager.set('entry1', 'value1');
      await cacheManager.set('entry2', 'value2');
      await cacheManager.set('entry3', 'value3');

      // Add one more to trigger eviction
      await cacheManager.set('entry4', 'value4');

      const stats = await cacheManager.getStatistics();
      expect(stats.evictionCount).toBeGreaterThan(0);
    });
  });

  describe('TTL Expiration Handling', () => {
    test('should automatically expire entries when TTL is reached', async () => {
      const storedEntries = new Map();
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (!keys || keys === null) {
          // Return all stored entries when keys is null (like Chrome API)
          return Object.fromEntries(storedEntries);
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach((key: string) => {
            if (storedEntries.has(key)) {
              result[key] = storedEntries.get(key);
            }
          });
        }
        return result;
      });
      mockStorage.local.remove.mockImplementation(async (keys: string[]) => {
        keys.forEach(key => storedEntries.delete(key));
      });

      // Set entry with short TTL
      await cacheManager.set('shortLived', 'value', { ttl: 1000 }); // 1 second

      // Entry should be found immediately
      let result = await cacheManager.get('shortLived');
      expect(result.found).toBe(true);

      // Advance time past TTL
      jest.advanceTimersByTime(1500); // 1.5 seconds

      // Entry should be expired and not found
      result = await cacheManager.get('shortLived');
      expect(result.found).toBe(false);
    });

    test('should clean up expired entries during background cleanup', async () => {
      const storedEntries = new Map();
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (!keys || keys === null) {
          // Return all stored entries when keys is null (like Chrome API)
          return Object.fromEntries(storedEntries);
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach((key: string) => {
            if (storedEntries.has(key)) {
              result[key] = storedEntries.get(key);
            }
          });
        }
        return result;
      });
      mockStorage.local.remove.mockImplementation(async (keys: string[]) => {
        keys.forEach(key => storedEntries.delete(key));
      });

      // Add entries with different TTL
      await cacheManager.set('shortLived', 'value1', { ttl: 500 });
      await cacheManager.set('longLived', 'value2', { ttl: 5000 });

      // Advance time to expire short-lived entry
      jest.advanceTimersByTime(1000); // 1 second

      // Trigger background cleanup
      jest.advanceTimersByTime(1000); // Another second to trigger cleanup interval

      // Short-lived should be cleaned up, long-lived should remain
      const shortResult = await cacheManager.get('shortLived');
      const longResult = await cacheManager.get('longLived');

      expect(shortResult.found).toBe(false);
      expect(longResult.found).toBe(true);
      expect(mockStorage.local.remove).toHaveBeenCalled();
    });

    test('should respect different TTL values for different entries', async () => {
      const storedEntries = new Map();
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (!keys || keys === null) {
          // Return all stored entries when keys is null (like Chrome API)
          return Object.fromEntries(storedEntries);
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach((key: string) => {
            if (storedEntries.has(key)) {
              result[key] = storedEntries.get(key);
            }
          });
        }
        return result;
      });

      // Add entries with different TTLs
      await cacheManager.set('quick', 'value1', { ttl: 1000 });
      await cacheManager.set('medium', 'value2', { ttl: 3000 });
      await cacheManager.set('slow', 'value3', { ttl: 5000 });

      // At 1.5 seconds - only quick should expire
      jest.advanceTimersByTime(1500);
      
      let quickResult = await cacheManager.get('quick');
      let mediumResult = await cacheManager.get('medium');
      let slowResult = await cacheManager.get('slow');

      expect(quickResult.found).toBe(false);
      expect(mediumResult.found).toBe(true);
      expect(slowResult.found).toBe(true);

      // At 3.5 seconds - quick and medium should expire
      jest.advanceTimersByTime(2000);

      quickResult = await cacheManager.get('quick');
      mediumResult = await cacheManager.get('medium');
      slowResult = await cacheManager.get('slow');

      expect(quickResult.found).toBe(false);
      expect(mediumResult.found).toBe(false);
      expect(slowResult.found).toBe(true);
    });

    test('should include remainingTtl in metadata', async () => {
      mockStorage.local.set.mockResolvedValue(undefined);
      mockStorage.local.get.mockImplementation(async (keys) => {
        const now = Date.now();
        return {
          'cache:test-key': {
            key: 'test-key',
            value: 'test-value',
            ttl: 5000,
            createdAt: now - 1000, // Created 1 second ago
            lastAccessed: now - 1000,
            size: 100
          }
        };
      });

      const result = await cacheManager.get('test-key', { includeMetadata: true });

      expect(result.found).toBe(true);
      expect(result.metadata?.remainingTtl).toBeGreaterThan(3000);
      expect(result.metadata?.remainingTtl).toBeLessThan(5000);
    });
  });

  describe('Background Cleanup Scheduling', () => {
    test('should schedule cleanup at configured intervals', async () => {
      // Spy on setInterval to verify cleanup scheduling
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      
      // Create new cache manager to verify scheduling
      const testManager = new CacheManager(smallConfig);
      
      // Should have scheduled cleanup
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        smallConfig.cleanupInterval
      );

      testManager.destroy();
      setIntervalSpy.mockRestore();
    });

    test('should clear cleanup timer on destroy', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      const testManager = new CacheManager(smallConfig);
      testManager.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      
      clearIntervalSpy.mockRestore();
    });

    test('should handle cleanup errors gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const storedEntries = new Map();
      
      mockStorage.local.get.mockRejectedValue(new Error('Storage error during cleanup'));
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });

      // Add an entry and trigger cleanup
      await cacheManager.set('test', 'value');
      
      // Trigger cleanup by advancing time
      jest.advanceTimersByTime(smallConfig.cleanupInterval);

      // Should not crash and should log warning
      expect(consoleWarnSpy).toHaveBeenCalled();
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Cache Size Management', () => {
    test('should accurately track total cache size', async () => {
      const storedEntries = new Map();
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (!keys || keys === null) {
          // Return all stored entries when keys is null (like Chrome API)
          return Object.fromEntries(storedEntries);
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach((key: string) => {
            if (storedEntries.has(key)) {
              result[key] = storedEntries.get(key);
            }
          });
        }
        return result;
      });

      // Add entries of known sizes
      await cacheManager.set('small', 'x'); // ~1 byte
      await cacheManager.set('medium', 'x'.repeat(100)); // ~100 bytes
      await cacheManager.set('large', 'x'.repeat(500)); // ~500 bytes

      const stats = await cacheManager.getStatistics();
      expect(stats.totalSize).toBeGreaterThan(600); // At least 601 bytes
    });

    test('should enforce maximum cache size limits', async () => {
      // Use very small cache for easy testing
      const tinyConfig: CacheConfig = {
        ...smallConfig,
        maxSize: 200, // Only 200 bytes
        maxEntries: 10 // High entry count, limited by size
      };
      
      const tinyManager = new CacheManager(tinyConfig);
      const storedEntries = new Map();
      
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (!keys || keys === null) {
          // Return all stored entries when keys is null (like Chrome API)
          return Object.fromEntries(storedEntries);
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach((key: string) => {
            if (storedEntries.has(key)) {
              result[key] = storedEntries.get(key);
            }
          });
        }
        return result;
      });
      mockStorage.local.remove.mockImplementation(async (keys: string[]) => {
        keys.forEach(key => storedEntries.delete(key));
      });

      // Add large entries that exceed size limit
      await tinyManager.set('entry1', 'x'.repeat(100)); // ~100 bytes
      await tinyManager.set('entry2', 'x'.repeat(100)); // ~100 bytes, total ~200
      
      // This should trigger eviction of entry1
      await tinyManager.set('entry3', 'x'.repeat(100)); // ~100 bytes

      const result1 = await tinyManager.get('entry1');
      const result2 = await tinyManager.get('entry2');
      const result3 = await tinyManager.get('entry3');

      // At least one entry should be evicted due to size constraints
      const foundCount = [result1.found, result2.found, result3.found].filter(Boolean).length;
      expect(foundCount).toBeLessThan(3);

      tinyManager.destroy();
    });
  });

  describe('Event System for Eviction and Expiration', () => {
    test('should emit evict events when entries are evicted', async () => {
      const eventListener = jest.fn();
      cacheManager.addEventListener(eventListener);

      const storedEntries = new Map();
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (!keys || keys === null) {
          // Return all stored entries when keys is null (like Chrome API)
          return Object.fromEntries(storedEntries);
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach((key: string) => {
            if (storedEntries.has(key)) {
              result[key] = storedEntries.get(key);
            }
          });
        }
        return result;
      });
      mockStorage.local.remove.mockImplementation(async (keys: string[]) => {
        keys.forEach(key => storedEntries.delete(key));
      });

      // Fill cache and trigger eviction
      await cacheManager.set('a', 'valueA');
      await cacheManager.set('b', 'valueB');
      await cacheManager.set('c', 'valueC');
      // Advance time to ensure different timestamps for LRU ordering
      jest.advanceTimersByTime(10);
      await cacheManager.set('d', 'valueD'); // Should evict 'a'

      // Should have received evict event
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'evict'
        })
      );
    });

    test('should emit expire events during cleanup', async () => {
      const eventListener = jest.fn();
      cacheManager.addEventListener(eventListener);

      const storedEntries = new Map();
      mockStorage.local.set.mockImplementation(async (items) => {
        Object.entries(items).forEach(([key, value]) => {
          storedEntries.set(key, value);
        });
      });
      mockStorage.local.get.mockImplementation(async (keys) => {
        if (!keys || keys === null) {
          // Return all stored entries when keys is null (like Chrome API)
          return Object.fromEntries(storedEntries);
        }
        const result: any = {};
        if (Array.isArray(keys)) {
          keys.forEach((key: string) => {
            if (storedEntries.has(key)) {
              result[key] = storedEntries.get(key);
            }
          });
        }
        return result;
      });
      mockStorage.local.remove.mockImplementation(async (keys: string[]) => {
        keys.forEach(key => storedEntries.delete(key));
      });

      // Add entry with short TTL
      await cacheManager.set('expiring', 'value', { ttl: 500 });

      // Advance time past expiration
      jest.advanceTimersByTime(1000);
      
      // Manually trigger cleanup to avoid timer timing issues
      await (cacheManager as any).cleanup();

      // Should have received expire event
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'expire'
        })
      );
    });
  });
});