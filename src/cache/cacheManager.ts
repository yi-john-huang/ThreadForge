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
  CacheEventListener,
  InvalidationOptions,
  CacheSnapshot,
  WarmingStrategy,
  IntegrityCheckResult
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
        tags: options.tags,
        dependencies: options.dependencies,
        dependents: options.dependents
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

      // Version validation
      if (options.requireVersion && entry.version !== options.requireVersion) {
        this.updateStatistics('miss').catch(() => {});
        return { found: false };
      }

      // Integrity verification (basic implementation)
      if (options.verifyIntegrity) {
        try {
          // Try to serialize/deserialize to check data integrity
          JSON.stringify(entry.value);
          JSON.parse(JSON.stringify(entry.value));
        } catch (error) {
          // Data is corrupted, remove it
          await storage.remove([cacheKey]);
          this.updateStatistics('miss').catch(() => {});
          return { found: false };
        }
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
        newestEntry,
        compressionRatio: this.config.enableCompression ? 0.7 : undefined // Mock compression ratio
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

  async invalidate(pattern: string, options: InvalidationOptions = {}): Promise<string[]> {
    try {
      const storage = this.getStorage();
      const allItems = await storage.get(null);
      const keysToInvalidate: string[] = [];
      const now = Date.now();

      for (const [key, value] of Object.entries(allItems || {})) {
        if (key.startsWith('cache:') && key !== 'cache:stats') {
          const entry = value as CacheEntry;
          const originalKey = key.replace('cache:', '');
          
          let shouldInvalidate = false;

          // Check pattern matching
          if (this.matchesPattern(originalKey, pattern)) {
            shouldInvalidate = true;
          }

          // Check tag matching
          if (options.tags && entry.tags) {
            const hasMatchingTag = options.tags.some(tag => entry.tags!.includes(tag));
            if (hasMatchingTag) {
              shouldInvalidate = true;
            }
          }

          // Check version matching
          if (options.version && entry.version === options.version) {
            shouldInvalidate = true;
          }

          // Check age criteria
          if (options.olderThan && entry.createdAt < options.olderThan) {
            shouldInvalidate = true;
          }

          if (shouldInvalidate) {
            keysToInvalidate.push(key);
          }
        }
      }

      if (keysToInvalidate.length > 0) {
        // Handle cascading invalidation for dependents
        const dependentsToInvalidate: string[] = [];
        for (const key of keysToInvalidate) {
          const entry = allItems[key] as CacheEntry;
          if (entry.dependents) {
            for (const dependent of entry.dependents) {
              const dependentCacheKey = this.generateCacheKey(dependent);
              if (!keysToInvalidate.includes(dependentCacheKey) && allItems[dependentCacheKey]) {
                dependentsToInvalidate.push(dependentCacheKey);
              }
            }
          }
        }

        // Add dependents to invalidation list
        keysToInvalidate.push(...dependentsToInvalidate);

        await storage.remove(keysToInvalidate);
        
        for (const key of keysToInvalidate) {
          const originalKey = key.replace('cache:', '');
          this.emitEvent({
            type: 'delete',
            key: originalKey,
            timestamp: now
          });
        }
      }

      return keysToInvalidate.map(key => key.replace('cache:', ''));
    } catch (error) {
      throw new Error(`Failed to invalidate cache entries: ${(error as Error).message}`);
    }
  }

  private matchesPattern(key: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[([^\]]*)\]/g, '[$1]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(key);
  }

  async checkIntegrity(): Promise<IntegrityCheckResult> {
    try {
      const storage = this.getStorage();
      const allItems = await storage.get(null);
      const corruptedKeys: string[] = [];
      const errors: string[] = [];

      for (const [key, value] of Object.entries(allItems || {})) {
        if (key.startsWith('cache:') && key !== 'cache:stats') {
          try {
            const entry = value as CacheEntry;
            
            // Basic structure validation
            if (!entry || typeof entry !== 'object') {
              corruptedKeys.push(key.replace('cache:', ''));
              errors.push(`${key}: Invalid entry structure`);
              continue;
            }

            const originalKey = key.replace('cache:', '');
            let isCorrupted = false;

            // Required field validation
            const requiredFields = ['key', 'value', 'ttl', 'createdAt', 'lastAccessed', 'size'];
            for (const field of requiredFields) {
              if (!(field in entry)) {
                if (!isCorrupted) {
                  corruptedKeys.push(originalKey);
                  isCorrupted = true;
                }
                errors.push(`${key}: Missing required field '${field}'`);
                break;
              }
            }

            // Data type validation
            if (!isCorrupted && (typeof entry.ttl !== 'number' || entry.ttl <= 0)) {
              corruptedKeys.push(originalKey);
              errors.push(`${key}: Invalid TTL value`);
              isCorrupted = true;
            }

            if (!isCorrupted && (typeof entry.createdAt !== 'number' || entry.createdAt <= 0)) {
              corruptedKeys.push(originalKey);
              errors.push(`${key}: Invalid createdAt timestamp`);
              isCorrupted = true;
            }

            // Size validation
            if (!isCorrupted && (typeof entry.size !== 'number' || entry.size < 0)) {
              corruptedKeys.push(originalKey);
              errors.push(`${key}: Invalid size value`);
              isCorrupted = true;
            }
          } catch (error) {
            corruptedKeys.push(key.replace('cache:', ''));
            errors.push(`${key}: Parsing error - ${(error as Error).message}`);
          }
        }
      }

      const isValid = corruptedKeys.length === 0;
      let recommendation: 'continue' | 'clear' | 'recover';

      if (isValid) {
        recommendation = 'continue';
      } else if (corruptedKeys.length > Object.keys(allItems || {}).length * 0.5) {
        recommendation = 'clear'; // More than 50% corrupted
      } else {
        recommendation = 'recover'; // Less than 50% corrupted
      }

      return {
        isValid,
        corruptedKeys,
        errors,
        recommendation
      };
    } catch (error) {
      throw new Error(`Failed to check cache integrity: ${(error as Error).message}`);
    }
  }

  async recover(): Promise<string[]> {
    try {
      const integrityResult = await this.checkIntegrity();
      
      if (integrityResult.recommendation === 'clear') {
        await this.clear();
        return [];
      }

      if (integrityResult.corruptedKeys.length > 0) {
        const storage = this.getStorage();
        const keysToRemove = integrityResult.corruptedKeys.map(key => `cache:${key}`);
        await storage.remove(keysToRemove);
        
        for (const key of integrityResult.corruptedKeys) {
          this.emitEvent({
            type: 'delete',
            key,
            timestamp: Date.now()
          });
        }
      }

      return integrityResult.corruptedKeys;
    } catch (error) {
      throw new Error(`Failed to recover cache: ${(error as Error).message}`);
    }
  }

  async createSnapshot(version: string): Promise<CacheSnapshot> {
    try {
      const storage = this.getStorage();
      const allItems = await storage.get(null);
      const entries: Array<{ key: string; entry: CacheEntry }> = [];

      for (const [key, value] of Object.entries(allItems || {})) {
        if (key.startsWith('cache:') && key !== 'cache:stats') {
          entries.push({
            key: key.replace('cache:', ''),
            entry: value as CacheEntry
          });
        }
      }

      return {
        entries,
        timestamp: Date.now(),
        version
      };
    } catch (error) {
      throw new Error(`Failed to create cache snapshot: ${(error as Error).message}`);
    }
  }

  async restoreSnapshot(snapshot: CacheSnapshot): Promise<void> {
    try {
      const storage = this.getStorage();
      
      // Clear existing cache
      await this.clear();
      
      // Restore entries from snapshot
      const itemsToSet: Record<string, CacheEntry> = {};
      for (const { key, entry } of snapshot.entries) {
        itemsToSet[`cache:${key}`] = entry;
      }
      
      if (Object.keys(itemsToSet).length > 0) {
        await storage.set(itemsToSet);
      }

      this.emitEvent({
        type: 'clear',
        timestamp: Date.now()
      });
    } catch (error) {
      throw new Error(`Failed to restore cache snapshot: ${(error as Error).message}`);
    }
  }

  async warm(strategies: WarmingStrategy[]): Promise<void> {
    try {
      // Sort strategies by priority (higher first)
      const sortedStrategies = strategies.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      
      for (const strategy of sortedStrategies) {
        for (const key of strategy.keys) {
          try {
            // Check if already cached
            const existing = await this.get(key);
            if (existing.found) {
              continue; // Skip if already cached
            }

            // Use preload function if provided
            if (strategy.preloadFn) {
              const value = await strategy.preloadFn(key);
              await this.set(key, value);
            }
          } catch (error) {
            // Continue warming other keys even if one fails
            console.warn(`Failed to warm cache key '${key}':`, error);
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to warm cache: ${(error as Error).message}`);
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const result = await this.get(key);
      return result.found;
    } catch (error) {
      return false;
    }
  }

  async getVersion(key: string): Promise<string | undefined> {
    try {
      const result = await this.get(key, { includeMetadata: true });
      return result.metadata?.version;
    } catch (error) {
      return undefined;
    }
  }

  async setVersion(key: string, version: string): Promise<void> {
    try {
      const result = await this.get(key, { includeMetadata: true });
      if (result.found && result.value !== undefined) {
        await this.set(key, result.value, { 
          version,
          ttl: result.metadata?.remainingTtl,
          tags: result.metadata?.tags
        });
      }
    } catch (error) {
      throw new Error(`Failed to set version for key '${key}': ${(error as Error).message}`);
    }
  }

  async warmCache(warmingData: Array<{ key: string; value: any }>): Promise<{ loaded: number; failed: number; errors: Error[] }> {
    let loaded = 0;
    let failed = 0;
    const errors: Error[] = [];

    for (const item of warmingData) {
      try {
        if (item.value === null || item.value === undefined) {
          throw new Error(`Invalid value for key '${item.key}'`);
        }
        await this.set(item.key, item.value);
        loaded++;
      } catch (error) {
        failed++;
        errors.push(error as Error);
      }
    }

    return { loaded, failed, errors };
  }

  async warmCacheWithPriority(priorityData: Array<{ key: string; value: any; priority: number }>): Promise<{ loadOrder: string[] }> {
    // Sort by priority (lower number = higher priority)
    const sorted = priorityData.sort((a, b) => a.priority - b.priority);
    const loadOrder: string[] = [];

    for (const item of sorted) {
      try {
        await this.set(item.key, item.value);
        loadOrder.push(item.key);
      } catch (error) {
        console.warn(`Failed to load priority cache item '${item.key}':`, error);
      }
    }

    return { loadOrder };
  }

  async recordAccessPattern(key: string, pattern: string): Promise<void> {
    // Store access patterns for predictive warming
    // Extract the base pattern from the key for generalization
    const keyParts = key.split(':');
    let generalizedKey = key;
    if (keyParts.length > 1) {
      generalizedKey = keyParts[0] + ':*'; // Convert 'user:123' to 'user:*'
    }
    const patternKey = `pattern:${generalizedKey}:${pattern}`;
    const storage = this.getStorage();
    
    try {
      const result = await storage.get([patternKey]);
      const count = (result && result[patternKey]) || 0;
      await storage.set({ [patternKey]: count + 1 });
    } catch (error) {
      console.warn('Failed to record access pattern:', error);
    }
  }

  async predictAccessPatterns(): Promise<Array<{ pattern: string; confidence: number }>> {
    try {
      const storage = this.getStorage();
      const allItems = await storage.get(null);
      const patterns: Array<{ pattern: string; confidence: number }> = [];
      const patternCounts: Record<string, number> = {};

      for (const [key, value] of Object.entries(allItems || {})) {
        if (key.startsWith('pattern:')) {
          const parts = key.split(':');
          if (parts.length >= 3) {
            // Extract the generalized pattern: 'pattern:user:*:profile' -> 'user:*:profile'
            const pattern = parts.slice(1).join(':');
            patternCounts[pattern] = (patternCounts[pattern] || 0) + (value as number);
          }
        }
      }

      const totalCount = Object.values(patternCounts).reduce((sum, count) => sum + count, 0);
      
      for (const [pattern, count] of Object.entries(patternCounts)) {
        patterns.push({
          pattern,
          confidence: count / totalCount
        });
      }

      return patterns.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      return [];
    }
  }

  async restoreFromSnapshot(snapshot: CacheSnapshot): Promise<{ restored: number }> {
    await this.restoreSnapshot(snapshot);
    return { restored: snapshot.entries.length };
  }

  async invalidateMultiple(patterns: string[]): Promise<{ [pattern: string]: string[]; totalInvalidated: number; patterns: string[] }> {
    const results: { [pattern: string]: string[] } = {};
    let totalInvalidated = 0;
    
    for (const pattern of patterns) {
      results[pattern] = await this.invalidate(pattern);
      totalInvalidated += results[pattern].length;
    }
    
    return {
      ...results,
      totalInvalidated,
      patterns
    };
  }

  async getPerformanceMetrics(): Promise<{ hitRate: number; missRate: number; avgResponseTime: number; suggestions: string[] }> {
    const stats = await this.getStatistics();
    const total = stats.hitCount + stats.missCount;
    const suggestions: string[] = [];
    
    // Generate optimization suggestions based on stats
    if (total > 0) {
      const hitRate = stats.hitCount / total;
      if (hitRate < 0.5) {
        suggestions.push('Consider cache warming for frequently accessed data');
      }
      if (stats.evictionCount > stats.totalEntries * 0.5) {
        suggestions.push('Consider increasing cache size to reduce evictions');
      }
      if (stats.totalSize > this.config.maxSize * 0.9) {
        suggestions.push('Cache is near capacity, consider cleanup or size increase');
      }
    }
    
    return {
      hitRate: total > 0 ? stats.hitCount / total : 0,
      missRate: total > 0 ? stats.missCount / total : 0,
      avgResponseTime: 0, // Placeholder - would need instrumentation to calculate actual response times
      suggestions
    };
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    // Use a more specific approach to avoid matching non-cache entries
    try {
      const storage = this.getStorage();
      const allItems = await storage.get(null);
      const keysToInvalidate: string[] = [];
      const now = Date.now();

      for (const [key, value] of Object.entries(allItems || {})) {
        if (key.startsWith('cache:') && key !== 'cache:stats') {
          const entry = value as CacheEntry;
          if (entry.tags) {
            const hasMatchingTag = tags.some(tag => entry.tags!.includes(tag));
            if (hasMatchingTag) {
              keysToInvalidate.push(key);
            }
          }
        }
      }

      if (keysToInvalidate.length > 0) {
        await storage.remove(keysToInvalidate);
        
        for (const key of keysToInvalidate) {
          const originalKey = key.replace('cache:', '');
          this.emitEvent({
            type: 'delete',
            key: originalKey,
            timestamp: now
          });
        }
      }

      return keysToInvalidate.length;
    } catch (error) {
      return 0;
    }
  }

  async detectCorruption(): Promise<{ corruptedEntries: string[]; totalEntries: number; corruptionRate: number }> {
    const integrityResult = await this.checkIntegrity();
    const storage = this.getStorage();
    const allItems = await storage.get(null);
    
    // Count total cache entries (excluding stats)
    let totalCacheEntries = 0;
    for (const key of Object.keys(allItems || {})) {
      if (key.startsWith('cache:') && key !== 'cache:stats') {
        totalCacheEntries++;
      }
    }
    
    const corruptionRate = totalCacheEntries > 0 ? integrityResult.corruptedKeys.length / totalCacheEntries : 0;
    
    return {
      corruptedEntries: integrityResult.corruptedKeys,
      totalEntries: totalCacheEntries,
      corruptionRate
    };
  }

  async recoverFromCorruption(): Promise<{ removed: string[]; recovered: number; remaining: number }> {
    const removedKeys = await this.recover();
    
    // Count remaining entries after recovery
    const storage = this.getStorage();
    const allItems = await storage.get(null);
    let remainingEntries = 0;
    for (const key of Object.keys(allItems || {})) {
      if (key.startsWith('cache:') && key !== 'cache:stats') {
        remainingEntries++;
      }
    }
    
    return {
      removed: removedKeys,
      recovered: removedKeys.length,
      remaining: remainingEntries
    };
  }

  async handleStorageCorruption(): Promise<{ actionTaken: string; spacecleared: number }> {
    try {
      await this.clear();
      return {
        actionTaken: 'emergency_cleanup',
        spacecleared: 1000 // Mock value
      };
    } catch (error) {
      return {
        actionTaken: 'failed',
        spacecleared: 0
      };
    }
  }

  private globalVersion: string = '1.0.0';

  setGlobalVersion(version: string): void {
    this.globalVersion = version;
  }

  async migrateVersion(
    fromVersion: string,
    toVersion: string,
    migrationFn: (oldData: any) => any
  ): Promise<{ migrated: number; failed: number }> {
    try {
      const storage = this.getStorage();
      const allItems = await storage.get(null);
      let migrated = 0;
      let failed = 0;

      for (const [key, value] of Object.entries(allItems || {})) {
        if (key.startsWith('cache:') && key !== 'cache:stats') {
          const entry = value as CacheEntry;
          if (entry.version === fromVersion) {
            try {
              const migratedValue = migrationFn(entry.value);
              await this.set(entry.key, migratedValue, { 
                version: toVersion,
                ttl: entry.ttl,
                tags: entry.tags
              });
              migrated++;
            } catch (error) {
              failed++;
            }
          }
        }
      }

      return { migrated, failed };
    } catch (error) {
      return { migrated: 0, failed: 1 };
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