/**
 * Cache Manager Implementation for ThreadForge
 * Provides caching functionality using Chrome Storage API with TTL, LRU eviction, and statistics tracking
 * Requirements: 4.1 (cache storage), 4.2 (cache retrieval), 4.4 (cache eviction)
 */

import { 
  CacheConfig, 
  CacheEntry, 
  CacheStatistics, 
  CacheKeyOptions, 
  CacheSetOptions, 
  CacheGetOptions, 
  CacheResult,
  CacheEvent,
  CacheEventListener 
} from './types';

export class CacheManager {
  private config: CacheConfig;
  private eventListeners: CacheEventListener[] = [];
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxSize: 10 * 1024 * 1024, // 10MB default
      maxEntries: 1000,
      defaultTtl: 60 * 60 * 1000, // 1 hour
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      storageType: 'local',
      enableCompression: false,
      enableEncryption: false,
      ...config
    };

    this.validateConfig();
    this.startCleanupScheduler();
  }

  private validateConfig(): void {
    if (this.config.maxSize <= 0) {
      throw new Error('Invalid configuration: maxSize must be positive');
    }
    if (this.config.maxEntries <= 0) {
      throw new Error('Invalid configuration: maxEntries must be positive');
    }
    if (this.config.defaultTtl <= 0) {
      throw new Error('Invalid configuration: defaultTtl must be positive');
    }
  }

  private startCleanupScheduler(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        this.emitEvent({
          type: 'error',
          error: error as Error,
          timestamp: Date.now()
        });
      });
    }, this.config.cleanupInterval);
  }

  private getStorage() {
    this.checkChromeRuntime();
    return this.config.storageType === 'sync' ? chrome.storage.sync : chrome.storage.local;
  }

  private checkChromeRuntime(): void {
    if (chrome.runtime.lastError) {
      throw new Error(`Chrome runtime error: ${chrome.runtime.lastError.message}`);
    }
  }

  private calculateSize(value: any): number {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch {
      return JSON.stringify(value).length * 2; // Rough estimate for Unicode
    }
  }

  private generateCacheKey(key: string): string {
    return `cache:${key}`;
  }

  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    return (entry.createdAt + entry.ttl) < now;
  }

  private async updateStatistics(type: 'hit' | 'miss' | 'set' | 'evict'): Promise<void> {
    try {
      const storage = this.getStorage();
      const result = await storage.get(['cache:stats']);
      const stats = (result && result['cache:stats']) || {
        totalEntries: 0,
        totalSize: 0,
        hitCount: 0,
        missCount: 0,
        evictionCount: 0,
        hitRate: 0
      };

      switch (type) {
        case 'hit':
          stats.hitCount++;
          break;
        case 'miss':
          stats.missCount++;
          break;
        case 'set':
          stats.totalEntries++;
          break;
        case 'evict':
          stats.evictionCount++;
          stats.totalEntries--;
          break;
      }

      stats.hitRate = stats.hitCount + stats.missCount > 0 
        ? (stats.hitCount / (stats.hitCount + stats.missCount)) * 100 
        : 0;

      await storage.set({ 'cache:stats': stats });
    } catch (error) {
      // Statistics update failure shouldn't break cache operations
      console.warn('Failed to update cache statistics:', error);
    }
  }

  private emitEvent(event: CacheEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.warn('Cache event listener error:', error);
      }
    });
  }

  private async enforceEvictionPolicy(newEntrySize: number): Promise<void> {
    try {
      const storage = this.getStorage();
      const allItems = await storage.get(null);
      const cacheEntries: Array<{ key: string; entry: CacheEntry }> = [];
      let totalSize = 0;
      let totalEntries = 0;

      // Collect all cache entries
      for (const [key, value] of Object.entries(allItems || {})) {
        if (key.startsWith('cache:') && key !== 'cache:stats') {
          const entry = value as CacheEntry;
          cacheEntries.push({ key, entry });
          totalSize += entry.size;
          totalEntries++;
        }
      }

      // Sort by lastAccessed (LRU - oldest first)
      cacheEntries.sort((a, b) => a.entry.lastAccessed - b.entry.lastAccessed);

      const entriesToEvict: string[] = [];
      let sizeToFree = 0;

      // Check if we need to evict based on entry count
      // Need to make room for the new entry
      while ((totalEntries + 1) > this.config.maxEntries && cacheEntries.length > 0) {
        const evictEntry = cacheEntries.shift();
        if (evictEntry) {
          entriesToEvict.push(evictEntry.key);
          sizeToFree += evictEntry.entry.size;
          totalEntries--;
          totalSize -= evictEntry.entry.size;
        }
      }

      // Check if we need to evict based on size (including new entry size)
      const projectedSize = totalSize + newEntrySize;
      while (projectedSize - sizeToFree > this.config.maxSize && cacheEntries.length > 0) {
        const evictEntry = cacheEntries.shift();
        if (evictEntry) {
          // Only add if not already marked for eviction
          if (!entriesToEvict.includes(evictEntry.key)) {
            entriesToEvict.push(evictEntry.key);
            sizeToFree += evictEntry.entry.size;
          }
        }
      }

      // Perform evictions
      if (entriesToEvict.length > 0) {
        await storage.remove(entriesToEvict);
        
        // Emit eviction events and update statistics
        for (const key of entriesToEvict) {
          const originalKey = key.replace('cache:', '');
          this.emitEvent({
            type: 'evict',
            key: originalKey,
            timestamp: Date.now()
          });
          await this.updateStatistics('evict');
        }
      }
    } catch (error) {
      // Don't let eviction policy errors break the cache operation
      console.warn('Failed to enforce eviction policy:', error);
    }
  }

  generateKey(namespace: string, identifier: string, options: CacheKeyOptions = {}): string {
    const parts: string[] = ['cache'];
    
    if (options.prefix) {
      parts.push(options.prefix);
    }
    
    if (options.namespace) {
      parts.push(options.namespace);
    }
    
    parts.push(namespace, identifier);
    
    if (options.version) {
      parts.push(options.version);
    }

    const key = parts.join(':');
    
    if (options.includeHash) {
      // Simple hash function for key shortening
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return `cache:${Math.abs(hash).toString(16).padStart(8, '0')}`;
    }
    
    return key;
  }

  async set<T = any>(key: string, value: T, options: CacheSetOptions = {}): Promise<void> {
    try {
      const storage = this.getStorage();
      const now = Date.now();
      const cacheKey = this.generateCacheKey(key);
      
      const entry: CacheEntry<T> = {
        key,
        value,
        ttl: options.ttl || this.config.defaultTtl,
        createdAt: now,
        lastAccessed: now,
        size: this.calculateSize(value),
        version: options.version,
        tags: options.tags
      };

      // Check if we need to evict entries before adding new one
      await this.enforceEvictionPolicy(entry.size);

      await storage.set({ [cacheKey]: entry });
      
      await this.updateStatistics('set');
      
      this.emitEvent({
        type: 'set',
        key,
        size: entry.size,
        timestamp: now
      });
    } catch (error) {
      throw new Error(`Failed to set cache entry: ${(error as Error).message}`);
    }
  }

  async get<T = any>(key: string, options: CacheGetOptions = {}): Promise<CacheResult<T>> {
    try {
      const storage = this.getStorage();
      const cacheKey = this.generateCacheKey(key);
      const result = await storage.get([cacheKey]);
      const entry: CacheEntry<T> | undefined = result && result[cacheKey];

      if (!entry) {
        this.updateStatistics('miss').catch(() => {}); // Don't let stats failure block operation
        this.emitEvent({
          type: 'miss',
          key,
          timestamp: Date.now()
        });
        return { found: false };
      }

      if (this.isExpired(entry)) {
        // Remove expired entry
        await storage.remove([cacheKey]);
        this.updateStatistics('miss').catch(() => {}); // Don't let stats failure block operation
        this.emitEvent({
          type: 'expire',
          key,
          timestamp: Date.now()
        });
        return { found: false };
      }

      // Update last accessed time if requested
      if (options.updateAccessTime) {
        entry.lastAccessed = Date.now();
        await storage.set({ [cacheKey]: entry });
      }

      this.updateStatistics('hit').catch(() => {}); // Don't let stats failure block operation
      this.emitEvent({
        type: 'hit',
        key,
        size: entry.size,
        timestamp: Date.now()
      });

      const cacheResult: CacheResult<T> = {
        value: entry.value,
        found: true
      };

      if (options.includeMetadata) {
        cacheResult.metadata = {
          createdAt: entry.createdAt,
          lastAccessed: entry.lastAccessed,
          ttl: entry.ttl,
          remainingTtl: Math.max(0, (entry.createdAt + entry.ttl) - Date.now()),
          version: entry.version,
          tags: entry.tags,
          size: entry.size
        };
      }

      return cacheResult;
    } catch (error) {
      throw new Error(`Failed to get cache entry: ${(error as Error).message}`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const storage = this.getStorage();
      const cacheKey = this.generateCacheKey(key);
      await storage.remove([cacheKey]);
      
      this.emitEvent({
        type: 'delete',
        key,
        timestamp: Date.now()
      });
    } catch (error) {
      throw new Error(`Failed to delete cache entry: ${(error as Error).message}`);
    }
  }

  async clear(): Promise<void> {
    try {
      const storage = this.getStorage();
      await storage.clear();
      
      this.emitEvent({
        type: 'clear',
        timestamp: Date.now()
      });
    } catch (error) {
      throw new Error(`Failed to clear cache: ${(error as Error).message}`);
    }
  }

  async getStorageSize(): Promise<number> {
    try {
      const storage = this.getStorage();
      return await storage.getBytesInUse();
    } catch (error) {
      throw new Error(`Failed to get storage size: ${(error as Error).message}`);
    }
  }

  async getStatistics(): Promise<CacheStatistics> {
    try {
      const storage = this.getStorage();
      const result = await storage.get(['cache:stats']);
      const baseStats = (result && result['cache:stats']) || {
        totalEntries: 0,
        totalSize: 0,
        hitCount: 0,
        missCount: 0,
        evictionCount: 0,
        hitRate: 0
      };

      // Calculate real-time statistics by examining all cache entries
      const allItems = await storage.get(null);
      let actualTotalSize = 0;
      let actualTotalEntries = 0;
      let oldestEntry: number | undefined;
      let newestEntry: number | undefined;

      for (const [key, value] of Object.entries(allItems || {})) {
        if (key.startsWith('cache:') && key !== 'cache:stats') {
          const entry = value as CacheEntry;
          actualTotalSize += entry.size;
          actualTotalEntries++;
          
          if (!oldestEntry || entry.createdAt < oldestEntry) {
            oldestEntry = entry.createdAt;
          }
          if (!newestEntry || entry.createdAt > newestEntry) {
            newestEntry = entry.createdAt;
          }
        }
      }

      return {
        ...baseStats,
        totalEntries: actualTotalEntries,
        totalSize: actualTotalSize,
        oldestEntry,
        newestEntry
      };
    } catch (error) {
      throw new Error(`Failed to get cache statistics: ${(error as Error).message}`);
    }
  }

  addEventListener(listener: CacheEventListener): void {
    this.eventListeners.push(listener);
  }

  removeEventListener(listener: CacheEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  private async cleanup(): Promise<void> {
    try {
      const storage = this.getStorage();
      const allItems = await storage.get(null);
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, value] of Object.entries(allItems || {})) {
        if (key.startsWith('cache:') && key !== 'cache:stats') {
          const entry = value as CacheEntry;
          if (this.isExpired(entry)) {
            expiredKeys.push(key);
          }
        }
      }

      if (expiredKeys.length > 0) {
        await storage.remove(expiredKeys);
        for (const key of expiredKeys) {
          this.emitEvent({
            type: 'expire',
            key: key.replace('cache:', ''),
            timestamp: now
          });
        }
      }
    } catch (error) {
      this.emitEvent({
        type: 'error',
        error: error as Error,
        timestamp: Date.now()
      });
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.eventListeners = [];
  }
}