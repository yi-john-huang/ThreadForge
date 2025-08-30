/**
 * Cache Type Definitions for ThreadForge Cache Management System
 * Defines interfaces for cache entries, configurations, and cache operations
 * Requirements: 4.1 (cache storage), 4.2 (cache retrieval), 4.4 (cache eviction)
 */

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  ttl: number; // Time to live in milliseconds
  createdAt: number; // Unix timestamp
  lastAccessed: number; // Unix timestamp for LRU
  size: number; // Approximate size in bytes
  version?: string; // For cache versioning
  tags?: string[]; // For grouped invalidation
  dependencies?: string[]; // Keys this entry depends on
  dependents?: string[]; // Keys that depend on this entry
}

export interface CacheConfig {
  maxSize: number; // Maximum cache size in bytes
  maxEntries: number; // Maximum number of entries
  defaultTtl: number; // Default TTL in milliseconds
  cleanupInterval: number; // Cleanup interval in milliseconds
  storageType: 'local' | 'sync'; // Chrome storage type
  enableCompression: boolean; // Whether to compress large entries
  enableEncryption: boolean; // Whether to encrypt sensitive data
}

export interface CacheStatistics {
  totalEntries: number;
  totalSize: number; // Total size in bytes
  hitCount: number;
  missCount: number;
  evictionCount: number;
  hitRate: number; // Calculated hit rate percentage
  oldestEntry?: number; // Timestamp of oldest entry
  newestEntry?: number; // Timestamp of newest entry
  compressionRatio?: number; // Compression effectiveness
}

export interface CacheKeyOptions {
  prefix?: string;
  namespace?: string;
  version?: string;
  includeHash?: boolean; // Whether to hash the key for length reduction
}

export interface CacheSetOptions {
  ttl?: number; // Override default TTL
  tags?: string[]; // Tags for grouped operations
  version?: string; // Version for cache versioning
  priority?: number; // Priority for eviction (higher = keep longer)
  dependencies?: string[]; // Keys this entry depends on
  dependents?: string[]; // Keys that depend on this entry
}

export interface CacheGetOptions {
  updateAccessTime?: boolean; // Whether to update last accessed time
  includeMetadata?: boolean; // Whether to include cache metadata
  verifyIntegrity?: boolean; // Whether to verify data integrity
  requireVersion?: string; // Require specific version
}

export interface CacheResult<T = any> {
  value?: T;
  found: boolean;
  metadata?: {
    createdAt: number;
    lastAccessed: number;
    ttl: number;
    remainingTtl: number;
    version?: string;
    tags?: string[];
    size: number;
  };
}

export type CacheEventType = 
  | 'hit' 
  | 'miss' 
  | 'set' 
  | 'delete' 
  | 'evict' 
  | 'expire' 
  | 'clear' 
  | 'error';

export interface CacheEvent {
  type: CacheEventType;
  key?: string;
  size?: number;
  error?: Error;
  timestamp: number;
}

export interface CacheEventListener {
  (event: CacheEvent): void;
}

export interface InvalidationOptions {
  tags?: string[]; // Invalidate entries with these tags
  version?: string; // Invalidate entries with this version
  olderThan?: number; // Invalidate entries older than timestamp
}

export interface CacheSnapshot {
  entries: Array<{ key: string; entry: CacheEntry }>;
  timestamp: number;
  version: string;
}

export interface WarmingStrategy {
  keys: string[];
  preloadFn?: (key: string) => Promise<any>;
  priority?: number;
}

export interface IntegrityCheckResult {
  isValid: boolean;
  corruptedKeys: string[];
  errors: string[];
  recommendation: 'continue' | 'clear' | 'recover';
}