/**
 * Cache Type Definitions for Data Management
 * Based on Chrome Storage API and LRU cache requirements
 */

export interface CacheEntry<T> {
  data: T;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  key: string;
}

export interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  cleanupInterval?: number;
  enableLRU?: boolean;
}

export interface CacheStats {
  hitRate: number;
  missRate: number;
  totalEntries: number;
  totalSize: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}

export interface CacheOperation {
  type: 'get' | 'set' | 'delete' | 'clear';
  key: string;
  timestamp: Date;
  success: boolean;
  size?: number;
}

export type CacheKey = string;

export interface CacheMetadata {
  version: string;
  lastCleanup: Date;
  totalOperations: number;
  maxSizeReached: number;
}