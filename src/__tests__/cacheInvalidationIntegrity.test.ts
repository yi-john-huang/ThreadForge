/**
 * Unit tests for Cache Invalidation and Integrity Management - Task 12
 * Tests pattern-based invalidation, corruption detection, cache warming, and versioning
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

describe('CacheManager - Cache Invalidation and Integrity Management', () => {
  let cacheManager: CacheManager;
  let testConfig: CacheConfig;
  let storedEntries: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    mockChrome.runtime.lastError = null;
    
    testConfig = {
      maxSize: 10 * 1024 * 1024, // 10MB
      maxEntries: 1000,
      defaultTtl: 60 * 60 * 1000, // 1 hour
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      storageType: 'local',
      enableCompression: false,
      enableEncryption: false
    };

    // Setup comprehensive mock storage implementation
    storedEntries = new Map();
    
    mockStorage.local.set.mockImplementation(async (items) => {
      Object.entries(items).forEach(([key, value]) => {
        storedEntries.set(key, value);
      });
    });
    
    mockStorage.local.get.mockImplementation(async (keys) => {
      if (!keys || keys === null) {
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
    
    mockStorage.local.clear.mockImplementation(async () => {
      storedEntries.clear();
    });

    cacheManager = new CacheManager(testConfig);
    
    // Clear any existing cache data
    storedEntries.clear();
  });

  afterEach(() => {
    cacheManager?.destroy();
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  describe('Pattern-based Cache Invalidation', () => {
    test('should invalidate entries matching exact pattern', async () => {
      // Setup test data
      await cacheManager.set('user:123', { name: 'John', id: 123 });
      await cacheManager.set('user:456', { name: 'Jane', id: 456 });
      await cacheManager.set('post:789', { title: 'Test Post', id: 789 });
      await cacheManager.set('user:settings:123', { theme: 'dark' });

      // Invalidate all user entries
      const invalidatedKeys = await cacheManager.invalidate('user:*');

      // Should invalidate user:123, user:456, and user:settings:123
      expect(invalidatedKeys.length).toBe(3);

      // Verify invalidated entries are gone
      const user123 = await cacheManager.get('user:123');
      const user456 = await cacheManager.get('user:456');
      const userSettings = await cacheManager.get('user:settings:123');
      const post789 = await cacheManager.get('post:789');

      expect(user123.found).toBe(false);
      expect(user456.found).toBe(false);
      expect(userSettings.found).toBe(false);
      expect(post789.found).toBe(true); // Should remain
    });

    test('should invalidate entries matching wildcard patterns', async () => {
      await cacheManager.set('api:v1:users', 'users data');
      await cacheManager.set('api:v1:posts', 'posts data');
      await cacheManager.set('api:v2:users', 'v2 users data');
      await cacheManager.set('cache:stats', 'stats data');

      // Invalidate all v1 API entries
      const invalidatedKeys = await cacheManager.invalidate('api:v1:*');

      expect(invalidatedKeys.length).toBe(2);

      const v1Users = await cacheManager.get('api:v1:users');
      const v1Posts = await cacheManager.get('api:v1:posts');
      const v2Users = await cacheManager.get('api:v2:users');

      expect(v1Users.found).toBe(false);
      expect(v1Posts.found).toBe(false);
      expect(v2Users.found).toBe(true); // Should remain
    });

    test('should invalidate entries matching complex patterns with multiple wildcards', async () => {
      await cacheManager.set('thread:123:reply:456', 'reply data');
      await cacheManager.set('thread:123:reply:789', 'reply data 2');
      await cacheManager.set('thread:456:reply:123', 'reply data 3');
      await cacheManager.set('thread:123:metadata', 'metadata');

      // Invalidate all replies for thread 123
      const invalidatedKeys = await cacheManager.invalidate('thread:123:reply:*');

      expect(invalidatedKeys.length).toBe(2);

      const reply456 = await cacheManager.get('thread:123:reply:456');
      const reply789 = await cacheManager.get('thread:123:reply:789');
      const otherReply = await cacheManager.get('thread:456:reply:123');
      const metadata = await cacheManager.get('thread:123:metadata');

      expect(reply456.found).toBe(false);
      expect(reply789.found).toBe(false);
      expect(otherReply.found).toBe(true); // Different thread
      expect(metadata.found).toBe(true); // Different type
    });

    test('should emit invalidate events when entries are invalidated', async () => {
      const eventListener = jest.fn();
      cacheManager.addEventListener(eventListener);

      await cacheManager.set('test:1', 'data1');
      await cacheManager.set('test:2', 'data2');

      await cacheManager.invalidate('test:*');

      // Should have received delete events for each invalidated key
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'delete',
          key: 'test:1'
        })
      );
      expect(eventListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'delete',
          key: 'test:2'
        })
      );
    });

    test('should handle empty pattern matches gracefully', async () => {
      await cacheManager.set('user:123', 'data');

      const invalidatedKeys = await cacheManager.invalidate('nonexistent:*');

      expect(invalidatedKeys.length).toBe(0);
    });

    test('should invalidate entries by tag groups', async () => {
      await cacheManager.set('entry1', 'data1', { tags: ['user', 'profile'] });
      await cacheManager.set('entry2', 'data2', { tags: ['user', 'settings'] });
      await cacheManager.set('entry3', 'data3', { tags: ['post', 'content'] });

      const invalidatedCount = await cacheManager.invalidateByTags(['user']);

      expect(invalidatedCount).toBe(2);

      const entry1 = await cacheManager.get('entry1');
      const entry2 = await cacheManager.get('entry2');
      const entry3 = await cacheManager.get('entry3');

      expect(entry1.found).toBe(false);
      expect(entry2.found).toBe(false);
      expect(entry3.found).toBe(true); // Different tag
    });
  });

  describe('Cache Corruption Detection and Recovery', () => {
    test('should detect corrupted cache entries with invalid structure', async () => {
      // Manually insert corrupted data
      storedEntries.set('cache:corrupted1', { invalid: 'structure' }); // Missing required fields
      storedEntries.set('cache:corrupted2', 'not an object'); // Wrong type
      storedEntries.set('cache:valid', {
        key: 'valid',
        value: 'test',
        ttl: 5000,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        size: 4
      });

      const corruptionReport = await cacheManager.detectCorruption();

      expect(corruptionReport.corruptedEntries).toEqual(['corrupted1', 'corrupted2']);
      expect(corruptionReport.totalEntries).toBe(3);
      expect(corruptionReport.corruptionRate).toBeCloseTo(0.67, 2);
    });

    test('should automatically recover from corruption by removing invalid entries', async () => {
      // Insert mix of valid and corrupted entries
      storedEntries.set('cache:corrupted', { invalid: true });
      await cacheManager.set('valid', 'test data');

      const recoveryResult = await cacheManager.recoverFromCorruption();

      expect(recoveryResult.removed).toContain('corrupted');
      expect(recoveryResult.recovered).toBe(1);
      expect(recoveryResult.remaining).toBe(1); // Valid entry remains

      // Verify corrupted entry is gone
      const corruptedResult = await cacheManager.get('corrupted');
      const validResult = await cacheManager.get('valid');

      expect(corruptedResult.found).toBe(false);
      expect(validResult.found).toBe(true);
    });

    test('should validate cache entry checksums for data integrity', async () => {
      await cacheManager.set('test', { important: 'data' }, { enableIntegrityCheck: true });

      // Manually corrupt the data by making it invalid JSON
      const corruptedData = storedEntries.get('cache:test');
      // Create a circular reference which will break JSON.stringify
      corruptedData.value = { data: 'test' };
      corruptedData.value.circular = corruptedData.value;
      storedEntries.set('cache:test', corruptedData);

      const result = await cacheManager.get('test', { verifyIntegrity: true });

      expect(result.found).toBe(false); // Should be rejected due to corruption
    });

    test('should handle storage quota corruption gracefully', async () => {
      const result = await cacheManager.handleStorageCorruption();

      expect(result.actionTaken).toBe('emergency_cleanup');
      expect(result.spacecleared).toBeGreaterThan(0);
    });
  });

  describe('Cache Versioning for Data Consistency', () => {
    test('should store and validate cache entry versions', async () => {
      await cacheManager.set('versioned:data', 'v1 data', { version: '1.0.0' });

      const result = await cacheManager.get('versioned:data', { includeMetadata: true });

      expect(result.found).toBe(true);
      expect(result.metadata?.version).toBe('1.0.0');
    });

    test('should invalidate entries with outdated versions', async () => {
      await cacheManager.set('api:response', 'old data', { version: '1.0.0' });

      // Update global version
      cacheManager.setGlobalVersion('2.0.0');

      const result = await cacheManager.get('api:response', { requireVersion: '2.0.0' });

      expect(result.found).toBe(false); // Should be rejected due to version mismatch
    });

    test('should migrate cache entries to new versions', async () => {
      await cacheManager.set('legacy:data', 'old format', { version: '1.0.0' });

      const migrationResult = await cacheManager.migrateVersion(
        '1.0.0',
        '2.0.0',
        (oldData) => ({ migrated: oldData, newField: 'added' })
      );

      expect(migrationResult.migrated).toBe(1);

      const result = await cacheManager.get('legacy:data', { includeMetadata: true });
      expect(result.metadata?.version).toBe('2.0.0');
      expect(result.value).toEqual({ migrated: 'old format', newField: 'added' });
    });

    test('should handle version conflicts with merge strategies', async () => {
      await cacheManager.set('conflict:data', 'original', { version: '1.0.0' });

      // Simulate concurrent update
      await cacheManager.set('conflict:data', 'updated', { 
        version: '1.0.0', 
        mergeStrategy: 'latest_wins' 
      });

      const result = await cacheManager.get('conflict:data');
      expect(result.value).toBe('updated');
    });
  });

  describe('Cache Warming Strategies', () => {
    test('should warm cache with frequently accessed data', async () => {
      const warmingData = [
        { key: 'popular:1', value: 'data1' },
        { key: 'popular:2', value: 'data2' },
        { key: 'popular:3', value: 'data3' }
      ];

      const warmingResult = await cacheManager.warmCache(warmingData);

      expect(warmingResult.loaded).toBe(3);
      expect(warmingResult.failed).toBe(0);

      // Verify data is cached
      for (const item of warmingData) {
        const result = await cacheManager.get(item.key);
        expect(result.found).toBe(true);
        expect(result.value).toBe(item.value);
      }
    });

    test('should implement predictive cache warming based on access patterns', async () => {
      // Simulate access pattern learning
      await cacheManager.recordAccessPattern('user:123', 'profile');
      await cacheManager.recordAccessPattern('user:123', 'settings');
      await cacheManager.recordAccessPattern('user:456', 'profile');

      const predictions = await cacheManager.predictAccessPatterns();

      expect(predictions).toContainEqual(
        expect.objectContaining({
          pattern: 'user:*:profile',
          confidence: expect.any(Number)
        })
      );
    });

    test('should warm cache with priority-based loading', async () => {
      const priorityData = [
        { key: 'critical:data', value: 'important', priority: 1 },
        { key: 'normal:data', value: 'regular', priority: 2 },
        { key: 'low:data', value: 'background', priority: 3 }
      ];

      const warmingResult = await cacheManager.warmCacheWithPriority(priorityData);

      expect(warmingResult.loadOrder).toEqual(['critical:data', 'normal:data', 'low:data']);
    });

    test('should handle cache warming failures gracefully', async () => {
      const warmingData = [
        { key: 'valid:data', value: 'good' },
        { key: 'invalid:data', value: null } // This should fail
      ];

      const warmingResult = await cacheManager.warmCache(warmingData);

      expect(warmingResult.loaded).toBe(1);
      expect(warmingResult.failed).toBe(1);
      expect(warmingResult.errors).toHaveLength(1);
    });
  });

  describe('Advanced Cache Management', () => {
    test('should implement cache snapshots for backup and restore', async () => {
      await cacheManager.set('important:1', 'data1');
      await cacheManager.set('important:2', 'data2');

      const snapshot = await cacheManager.createSnapshot();

      // Clear cache
      await cacheManager.clear();

      // Restore from snapshot
      const restoreResult = await cacheManager.restoreFromSnapshot(snapshot);

      expect(restoreResult.restored).toBe(2);

      const data1 = await cacheManager.get('important:1');
      const data2 = await cacheManager.get('important:2');

      expect(data1.found).toBe(true);
      expect(data2.found).toBe(true);
    });

    test('should implement cache entry dependencies and cascading invalidation', async () => {
      await cacheManager.set('parent:data', 'parent', { 
        dependencies: ['child:1', 'child:2'] 
      });
      await cacheManager.set('child:1', 'child1', { dependents: ['parent:data'] });
      await cacheManager.set('child:2', 'child2', { dependents: ['parent:data'] });

      // Invalidating child should cascade to parent
      await cacheManager.invalidate('child:1');

      const parentResult = await cacheManager.get('parent:data');
      const child1Result = await cacheManager.get('child:1');
      const child2Result = await cacheManager.get('child:2');

      expect(parentResult.found).toBe(false); // Should be invalidated
      expect(child1Result.found).toBe(false); // Directly invalidated
      expect(child2Result.found).toBe(true); // Should remain
    });

    test('should track cache performance metrics and optimization suggestions', async () => {
      // Generate some cache activity
      await cacheManager.set('metric:1', 'data1');
      await cacheManager.get('metric:1');
      await cacheManager.get('nonexistent');

      const metrics = await cacheManager.getPerformanceMetrics();

      expect(metrics.hitRate).toBeGreaterThan(0);
      expect(metrics.missRate).toBeGreaterThan(0);
      expect(metrics.suggestions).toBeInstanceOf(Array);
    });

    test('should implement cache compression for large entries', async () => {
      // Create a cache manager with compression enabled
      const compressConfig = { ...testConfig, enableCompression: true };
      const compressManager = new CacheManager(compressConfig);
      
      const largeData = 'x'.repeat(10000); // 10KB of data

      await compressManager.set('large:data', largeData);

      const result = await compressManager.get('large:data');

      expect(result.found).toBe(true);
      expect(result.value).toBe(largeData); // Should be decompressed automatically
      
      // Check that compressed size is smaller
      const stats = await compressManager.getStatistics();
      expect(stats.compressionRatio).toBeLessThan(1.0);
      
      compressManager.destroy();
    });
  });

  describe('Integration Tests', () => {
    test('should handle complex invalidation scenarios with multiple patterns', async () => {
      // Setup complex cache hierarchy
      await cacheManager.set('app:user:123:profile', 'profile data');
      await cacheManager.set('app:user:123:settings', 'settings data');
      await cacheManager.set('app:user:456:profile', 'other profile');
      await cacheManager.set('app:post:789:content', 'post content');
      await cacheManager.set('app:cache:metadata', 'metadata');

      // Invalidate all user-related cache
      const result = await cacheManager.invalidateMultiple([
        'app:user:*:profile',
        'app:user:*:settings'
      ]);

      expect(result.totalInvalidated).toBe(3);
      expect(result.patterns).toHaveLength(2);

      // Verify correct entries were invalidated
      const profile123 = await cacheManager.get('app:user:123:profile');
      const settings123 = await cacheManager.get('app:user:123:settings');
      const profile456 = await cacheManager.get('app:user:456:profile');
      const postContent = await cacheManager.get('app:post:789:content');

      expect(profile123.found).toBe(false);
      expect(settings123.found).toBe(false);
      expect(profile456.found).toBe(false);
      expect(postContent.found).toBe(true); // Should remain
    });

    test('should maintain cache consistency during concurrent operations', async () => {
      const concurrentOperations = [
        cacheManager.set('concurrent:1', 'data1'),
        cacheManager.set('concurrent:2', 'data2'),
        cacheManager.invalidate('concurrent:*'),
        cacheManager.set('concurrent:3', 'data3')
      ];

      await Promise.all(concurrentOperations);

      // Should handle race conditions gracefully
      const result3 = await cacheManager.get('concurrent:3');
      expect(result3.found).toBe(true);
    });
  });
});