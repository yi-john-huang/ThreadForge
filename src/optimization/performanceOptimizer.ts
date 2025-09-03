import { ThreadsAPIService } from '../api/threadsApiService';
import { CacheManager } from '../cache/cacheManager';
import { PerformanceMonitor } from '../performance/performanceMonitor';

/**
 * Configuration for performance optimization features
 */
interface OptimizationConfig {
  batchSize: number;
  batchDelay: number; // ms
  prefetchThreshold: number; // user behavior score threshold
  cacheWarmupEnabled: boolean;
  progressiveLoadingEnabled: boolean;
  maxConcurrentRequests: number;
  prefetchQueueSize: number;
  behaviorTrackingWindow: number; // ms
}

/**
 * User behavior pattern data
 */
interface UserBehavior {
  threadViewCount: number;
  averageViewTime: number;
  scrollDepth: number;
  clickThroughRate: number;
  lastInteractionTime: number;
  frequentlyViewedUsers: string[];
  commonInteractionPatterns: string[];
}

/**
 * Batch request data structure
 */
interface BatchRequest {
  id: string;
  threadId: string;
  priority: 'high' | 'medium' | 'low';
  timestamp: number;
  callback: (result: any) => void;
  errorCallback: (error: Error) => void;
}

/**
 * Progressive loading state
 */
interface ProgressiveState {
  threadId: string;
  summaryLoaded: boolean;
  repliesLoaded: boolean;
  loadingReplies: boolean;
  replyCount: number;
}

/**
 * Cache warming strategy configuration
 */
interface CacheWarmupStrategy {
  strategy: 'popular' | 'recent' | 'user-based' | 'predictive';
  targetSize: number;
  refreshInterval: number;
  priorityScore: (threadId: string, metadata: any) => number;
}

/**
 * Performance optimization service for ThreadForge
 * Implements request batching, prefetching, progressive loading, and cache warming
 */
export class PerformanceOptimizer {
  private config: OptimizationConfig = {
    batchSize: 5,
    batchDelay: 100,
    prefetchThreshold: 0.7,
    cacheWarmupEnabled: true,
    progressiveLoadingEnabled: true,
    maxConcurrentRequests: 3,
    prefetchQueueSize: 20,
    behaviorTrackingWindow: 30 * 60 * 1000 // 30 minutes
  };

  private batchQueue: BatchRequest[] = [];
  private prefetchQueue: string[] = [];
  private progressiveStates: Map<string, ProgressiveState> = new Map();
  private activeRepliesPromises: Map<string, Promise<any[]>> = new Map();
  private userBehavior: UserBehavior = {
    threadViewCount: 0,
    averageViewTime: 0,
    scrollDepth: 0,
    clickThroughRate: 0,
    lastInteractionTime: 0,
    frequentlyViewedUsers: [],
    commonInteractionPatterns: []
  };

  private batchTimer: NodeJS.Timeout | null = null;
  private activeRequests: Set<string> = new Set();
  private behaviorHistory: Array<{ action: string; timestamp: number; data: any }> = [];
  private cacheWarmupStrategies: CacheWarmupStrategy[] = [];
  private performanceMonitor: PerformanceMonitor;
  private threadsApi: ThreadsAPIService;
  private cache: CacheManager;

  constructor(
    performanceMonitor: PerformanceMonitor,
    threadsApi: ThreadsAPIService,
    cache: CacheManager,
    config?: Partial<OptimizationConfig>
  ) {
    this.performanceMonitor = performanceMonitor;
    this.threadsApi = threadsApi;
    this.cache = cache;
    
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.initializeCacheWarmupStrategies();
    this.loadUserBehavior();
    this.startBehaviorTracking();
  }

  /**
   * Initialize default cache warmup strategies
   */
  private initializeCacheWarmupStrategies(): void {
    // Popular threads strategy
    this.cacheWarmupStrategies.push({
      strategy: 'popular',
      targetSize: 50,
      refreshInterval: 15 * 60 * 1000, // 15 minutes
      priorityScore: (threadId: string, metadata: any) => {
        const { likes = 0, replies = 0, reposts = 0, views = 0 } = metadata;
        return (likes * 3 + replies * 5 + reposts * 2 + views * 0.1) / 100;
      }
    });

    // Recent threads strategy
    this.cacheWarmupStrategies.push({
      strategy: 'recent',
      targetSize: 30,
      refreshInterval: 5 * 60 * 1000, // 5 minutes
      priorityScore: (threadId: string, metadata: any) => {
        const { timestamp = 0 } = metadata;
        const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
        return Math.max(0, 1 - (ageHours / 24)); // Decay over 24 hours
      }
    });

    // User-based strategy
    this.cacheWarmupStrategies.push({
      strategy: 'user-based',
      targetSize: 25,
      refreshInterval: 10 * 60 * 1000, // 10 minutes
      priorityScore: (threadId: string, metadata: any) => {
        const { author = '' } = metadata;
        return this.userBehavior.frequentlyViewedUsers.includes(author) ? 1 : 0;
      }
    });

    // Predictive strategy based on behavior patterns
    this.cacheWarmupStrategies.push({
      strategy: 'predictive',
      targetSize: 15,
      refreshInterval: 20 * 60 * 1000, // 20 minutes
      priorityScore: (threadId: string, metadata: any) => {
        return this.calculatePredictiveScore(threadId, metadata);
      }
    });
  }

  /**
   * Calculate predictive score based on user behavior patterns
   */
  private calculatePredictiveScore(threadId: string, metadata: any): number {
    const { author = '', tags = [], content = '', timestamp = 0 } = metadata;
    let score = 0;

    // Author affinity
    if (this.userBehavior.frequentlyViewedUsers.includes(author)) {
      score += 0.4;
    }

    // Time-based patterns
    const hour = new Date(timestamp).getHours();
    const userActiveHours = this.extractActiveHours();
    if (userActiveHours.includes(hour)) {
      score += 0.2;
    }

    // Content pattern matching
    const contentScore = this.calculateContentAffinity(content, tags);
    score += contentScore * 0.3;

    // Engagement prediction
    const engagementScore = this.predictEngagement(metadata);
    score += engagementScore * 0.1;

    return Math.min(1, score);
  }

  /**
   * Extract user's active hours from behavior history
   */
  private extractActiveHours(): number[] {
    const hourCounts: { [key: number]: number } = {};
    
    this.behaviorHistory.forEach(entry => {
      const hour = new Date(entry.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    // Return hours with above-average activity
    const avgActivity = Object.values(hourCounts).reduce((a, b) => a + b, 0) / 24;
    return Object.entries(hourCounts)
      .filter(([_, count]) => count > avgActivity)
      .map(([hour, _]) => parseInt(hour));
  }

  /**
   * Calculate content affinity score
   */
  private calculateContentAffinity(content: string, tags: string[]): number {
    let score = 0;
    
    // Tag matching
    tags.forEach(tag => {
      if (this.userBehavior.commonInteractionPatterns.includes(tag)) {
        score += 0.1;
      }
    });

    // Content length preference
    const preferredLength = this.calculatePreferredContentLength();
    const lengthScore = Math.max(0, 1 - Math.abs(content.length - preferredLength) / preferredLength);
    score += lengthScore * 0.2;

    return Math.min(1, score);
  }

  /**
   * Calculate user's preferred content length
   */
  private calculatePreferredContentLength(): number {
    const contentLengths = this.behaviorHistory
      .filter(entry => entry.action === 'view_thread')
      .map(entry => entry.data.contentLength || 500);
    
    return contentLengths.length > 0 
      ? contentLengths.reduce((a, b) => a + b) / contentLengths.length 
      : 500;
  }

  /**
   * Predict engagement likelihood
   */
  private predictEngagement(metadata: any): number {
    const { likes = 0, replies = 0, reposts = 0, timestamp = 0 } = metadata;
    
    // Recent content gets higher engagement prediction
    const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - (ageHours / 12)); // Peak in first 12 hours

    // Engagement velocity
    const engagementVelocity = (likes + replies * 2 + reposts) / Math.max(1, ageHours);
    const velocityScore = Math.min(1, engagementVelocity / 10);

    return (recencyScore + velocityScore) / 2;
  }

  /**
   * Load user behavior data from storage
   */
  private async loadUserBehavior(): Promise<void> {
    try {
      const behaviorResult = await this.cache.get('user_behavior');
      if (behaviorResult.found && behaviorResult.value) {
        this.userBehavior = { ...this.userBehavior, ...behaviorResult.value };
      }

      const historyResult = await this.cache.get('behavior_history');
      if (historyResult.found && historyResult.value) {
        this.behaviorHistory = historyResult.value;
        // Clean old entries
        const cutoffTime = Date.now() - this.config.behaviorTrackingWindow;
        this.behaviorHistory = this.behaviorHistory.filter(entry => entry.timestamp > cutoffTime);
      }
    } catch (error) {
      console.warn('Failed to load user behavior data:', error);
    }
  }

  /**
   * Save user behavior data to storage
   */
  private async saveUserBehavior(): Promise<void> {
    try {
      await this.cache.set('user_behavior', this.userBehavior, { ttl: 7 * 24 * 60 * 60 * 1000 }); // 7 days
      await this.cache.set('behavior_history', this.behaviorHistory, { ttl: 7 * 24 * 60 * 60 * 1000 }); // 7 days
    } catch (error) {
      console.warn('Failed to save user behavior data:', error);
    }
  }

  /**
   * Start tracking user behavior
   */
  private startBehaviorTracking(): void {
    // Track scroll behavior
    let scrollTimeout: NodeJS.Timeout;
    document.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const scrollPercentage = (window.scrollY + window.innerHeight) / document.body.scrollHeight;
        this.trackBehavior('scroll', { depth: scrollPercentage });
      }, 250);
    });

    // Track click behavior
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.thread-container') || target.closest('.reply-container')) {
        this.trackBehavior('click', { element: target.className });
      }
    });

    // Save behavior data periodically
    setInterval(() => {
      this.saveUserBehavior();
    }, 60000); // Every minute
  }

  /**
   * Track user behavior action
   */
  public trackBehavior(action: string, data: any = {}): void {
    const entry = {
      action,
      timestamp: Date.now(),
      data
    };

    this.behaviorHistory.push(entry);
    
    // Limit history size
    if (this.behaviorHistory.length > 1000) {
      this.behaviorHistory = this.behaviorHistory.slice(-800);
    }

    // Update behavior metrics
    this.updateBehaviorMetrics(action, data);

    // Trigger prefetching if behavior indicates high engagement
    if (this.shouldTriggerPrefetch(action, data)) {
      this.triggerPrefetch();
    }
  }

  /**
   * Update behavior metrics based on action
   */
  private updateBehaviorMetrics(action: string, data: any): void {
    switch (action) {
      case 'view_thread':
        this.userBehavior.threadViewCount++;
        if (data.viewTime) {
          const totalTime = this.userBehavior.averageViewTime * (this.userBehavior.threadViewCount - 1);
          this.userBehavior.averageViewTime = (totalTime + data.viewTime) / this.userBehavior.threadViewCount;
        }
        if (data.author && !this.userBehavior.frequentlyViewedUsers.includes(data.author)) {
          if (this.userBehavior.frequentlyViewedUsers.length >= 20) {
            this.userBehavior.frequentlyViewedUsers.shift();
          }
          this.userBehavior.frequentlyViewedUsers.push(data.author);
        }
        break;

      case 'scroll':
        if (data.depth > this.userBehavior.scrollDepth) {
          this.userBehavior.scrollDepth = data.depth;
        }
        break;

      case 'click':
        // Update click-through rate calculation
        const recentClicks = this.behaviorHistory
          .filter(entry => entry.action === 'click' && Date.now() - entry.timestamp < 300000)
          .length;
        const recentViews = this.behaviorHistory
          .filter(entry => entry.action === 'view_thread' && Date.now() - entry.timestamp < 300000)
          .length;
        
        if (recentViews > 0) {
          this.userBehavior.clickThroughRate = recentClicks / recentViews;
        }
        break;
    }

    this.userBehavior.lastInteractionTime = Date.now();
  }

  /**
   * Determine if behavior should trigger prefetching
   */
  private shouldTriggerPrefetch(action: string, data: any): boolean {
    // High engagement indicators
    if (action === 'scroll' && data.depth > 0.7) return true;
    if (action === 'view_thread' && data.viewTime > 10000) return true; // 10+ seconds
    if (this.userBehavior.clickThroughRate > this.config.prefetchThreshold) return true;

    return false;
  }

  /**
   * Trigger prefetch based on user behavior
   */
  private async triggerPrefetch(): Promise<void> {
    if (this.prefetchQueue.length >= this.config.prefetchQueueSize) {
      return;
    }

    try {
      // Get predictive thread suggestions
      const suggestions = await this.getPredictiveThreadSuggestions();
      
      suggestions.slice(0, 5).forEach(threadId => {
        if (!this.prefetchQueue.includes(threadId)) {
          this.prefetchQueue.push(threadId);
          this.prefetchThread(threadId);
        }
      });
    } catch (error) {
      console.warn('Failed to trigger prefetch:', error);
    }
  }

  /**
   * Get predictive thread suggestions based on behavior
   */
  private async getPredictiveThreadSuggestions(): Promise<string[]> {
    // This would typically call an API or analyze current page content
    // For now, return mock suggestions based on behavior patterns
    const suggestions: string[] = [];

    // Add threads from frequently viewed users
    this.userBehavior.frequentlyViewedUsers.slice(0, 3).forEach(author => {
      // Mock thread ID generation - in real implementation this would query the API
      suggestions.push(`thread_${author}_${Date.now()}`);
    });

    return suggestions;
  }

  /**
   * Add request to batch queue
   */
  public batchRequest(
    threadId: string,
    priority: 'high' | 'medium' | 'low' = 'medium',
    callback: (result: any) => void,
    errorCallback: (error: Error) => void
  ): void {
    const request: BatchRequest = {
      id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      threadId,
      priority,
      timestamp: Date.now(),
      callback,
      errorCallback
    };

    this.batchQueue.push(request);

    // Sort by priority
    this.batchQueue.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Start batch timer if not already running
    if (!this.batchTimer && this.batchQueue.length >= this.config.batchSize) {
      this.processBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.config.batchDelay);
    }
  }

  /**
   * Process batch of requests
   */
  private async processBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batchQueue.length === 0) {
      return;
    }

    // Process batches even if at max concurrent requests, just queue them up
    const batch = this.batchQueue.splice(0, this.config.batchSize);
    const batchId = `batch_${Date.now()}`;
    
    this.activeRequests.add(batchId);

    try {
      const timer = this.performanceMonitor.startTimer('batch_request');
      
      // Execute batch requests concurrently
      const promises = batch.map(async (request) => {
        try {
          const result = await this.threadsApi.getThread(request.threadId);
          request.callback(result);
          return { success: true, threadId: request.threadId };
        } catch (error) {
          request.errorCallback(error as Error);
          return { success: false, threadId: request.threadId, error };
        }
      });

      const results = await Promise.allSettled(promises);
      
      this.performanceMonitor.endTimer(timer, 'batch_request');
      
      // Log batch performance
      const successCount = results.filter(r => r.status === 'fulfilled' && 
        (r.value as any).success).length;
      
      console.log(`Batch ${batchId}: ${successCount}/${batch.length} successful`);

    } catch (error) {
      console.error('Batch processing error:', error);
      batch.forEach(request => request.errorCallback(error as Error));
    } finally {
      this.activeRequests.delete(batchId);
      
      // Continue processing remaining batches immediately
      if (this.batchQueue.length > 0) {
        // Use shorter delay to process remaining items quickly
        setTimeout(() => this.processBatch(), 10);
      }
    }
  }

  /**
   * Prefetch thread data in the background
   */
  public async prefetchThread(threadId: string): Promise<void> {
    if (this.activeRequests.has(`prefetch_${threadId}`)) {
      return;
    }

    this.activeRequests.add(`prefetch_${threadId}`);

    try {
      const timer = this.performanceMonitor.startTimer('prefetch_request');
      
      // Use low priority for prefetch
      const result = await this.threadsApi.getThread(threadId);
      
      // Store in cache
      await this.cache.set(`thread_cache_${threadId}`, {
        data: result,
        timestamp: Date.now(),
        prefetched: true
      }, { ttl: 60 * 60 * 1000 }); // 1 hour TTL

      this.performanceMonitor.endTimer(timer, 'prefetch_request');

      // Remove from prefetch queue
      const queueIndex = this.prefetchQueue.indexOf(threadId);
      if (queueIndex > -1) {
        this.prefetchQueue.splice(queueIndex, 1);
      }

    } catch (error) {
      console.warn(`Prefetch failed for thread ${threadId}:`, error);
    } finally {
      this.activeRequests.delete(`prefetch_${threadId}`);
    }
  }

  /**
   * Implement progressive loading for a thread
   */
  public async progressiveLoadThread(threadId: string): Promise<{
    summary: any;
    loadReplies: () => Promise<any[]>;
  }> {
    const state: ProgressiveState = {
      threadId,
      summaryLoaded: false,
      repliesLoaded: false,
      loadingReplies: false,
      replyCount: 0
    };

    this.progressiveStates.set(threadId, state);

    try {
      const timer = this.performanceMonitor.startTimer('progressive_load_summary');
      
      // Load thread data first (includes basic metadata)
      const threadData = await this.threadsApi.getThread(threadId);
      state.summaryLoaded = true;
      // Extract reply count from thread data if available
      state.replyCount = (threadData as any).replyCount || 0;

      this.performanceMonitor.endTimer(timer, 'progressive_load_summary');

      // Return summary with lazy-loaded replies function
      return {
        summary: threadData,
        loadReplies: async () => {
          // Check if replies are already loaded and cached
          if (state.repliesLoaded && !state.loadingReplies) {
            const cachedResult = await this.cache.get(`replies_cache_${threadId}`);
            if (cachedResult.found && cachedResult.value) {
              return cachedResult.value.data;
            }
          }

          // Check if there's already an active request for this thread
          const existingPromise = this.activeRepliesPromises.get(threadId);
          if (existingPromise) {
            return existingPromise;
          }

          // Start new request
          state.loadingReplies = true;
          const replyTimer = this.performanceMonitor.startTimer('progressive_load_replies');

          const repliesPromise = (async (): Promise<any[]> => {
            try {
              const repliesResponse = await this.threadsApi.getThreadReplies(threadId);
              const replies = repliesResponse.data || repliesResponse; // Handle both wrapped and direct data
              state.repliesLoaded = true;
              state.loadingReplies = false;

              // Cache replies
              await this.cache.set(`replies_cache_${threadId}`, {
                data: replies,
                timestamp: Date.now()
              }, { ttl: 30 * 60 * 1000 }); // 30 minutes TTL

              this.performanceMonitor.endTimer(replyTimer, 'progressive_load_replies');
              return replies;
            } catch (error) {
              state.loadingReplies = false;
              throw error;
            } finally {
              // Clean up the promise reference
              this.activeRepliesPromises.delete(threadId);
            }
          })();

          this.activeRepliesPromises.set(threadId, repliesPromise);
          return repliesPromise;
        }
      };

    } catch (error) {
      this.progressiveStates.delete(threadId);
      throw error;
    }
  }

  /**
   * Execute cache warming strategies
   */
  public async warmCache(): Promise<void> {
    if (!this.config.cacheWarmupEnabled) {
      return;
    }

    for (const strategy of this.cacheWarmupStrategies) {
      try {
        await this.executeWarmupStrategy(strategy);
      } catch (error) {
        console.warn(`Cache warmup failed for strategy ${strategy.strategy}:`, error);
      }
    }
  }

  /**
   * Execute a specific cache warmup strategy
   */
  private async executeWarmupStrategy(strategy: CacheWarmupStrategy): Promise<void> {
    const timer = this.performanceMonitor.startTimer(`warmup_${strategy.strategy}`);

    try {
      // Get candidate threads (mock implementation)
      const candidates = await this.getCacheWarmupCandidates(strategy);
      
      // Sort by priority score
      candidates.sort((a, b) => 
        strategy.priorityScore(b.threadId, b.metadata) - 
        strategy.priorityScore(a.threadId, a.metadata)
      );

      // Warm cache for top candidates
      const topCandidates = candidates.slice(0, strategy.targetSize);
      const warmupPromises = topCandidates.map(candidate => 
        this.prefetchThread(candidate.threadId)
      );

      await Promise.allSettled(warmupPromises);

    } finally {
      this.performanceMonitor.endTimer(timer, `warmup_${strategy.strategy}`);
    }
  }

  /**
   * Get cache warmup candidates for a strategy
   */
  private async getCacheWarmupCandidates(strategy: CacheWarmupStrategy): Promise<Array<{
    threadId: string;
    metadata: any;
  }>> {
    // Mock implementation - in real app this would call appropriate APIs
    const mockCandidates: Array<{ threadId: string; metadata: any }> = [];

    for (let i = 0; i < strategy.targetSize * 2; i++) {
      mockCandidates.push({
        threadId: `thread_${strategy.strategy}_${i}`,
        metadata: {
          likes: Math.floor(Math.random() * 1000),
          replies: Math.floor(Math.random() * 50),
          reposts: Math.floor(Math.random() * 100),
          views: Math.floor(Math.random() * 5000),
          author: `user_${Math.floor(Math.random() * 100)}`,
          timestamp: Date.now() - (Math.random() * 24 * 60 * 60 * 1000),
          tags: [`tag_${Math.floor(Math.random() * 10)}`]
        }
      });
    }

    return mockCandidates;
  }

  /**
   * Get optimization statistics
   */
  public getOptimizationStats(): {
    batchQueue: number;
    prefetchQueue: number;
    activeRequests: number;
    cacheHitRate: number;
    averageBatchSize: number;
    prefetchSuccessRate: number;
    behaviorScore: number;
  } {
    const recentBatches = this.behaviorHistory
      .filter(entry => entry.action === 'batch_request' && 
        Date.now() - entry.timestamp < 300000);

    const recentPrefetches = this.behaviorHistory
      .filter(entry => entry.action === 'prefetch_request' && 
        Date.now() - entry.timestamp < 300000);

    return {
      batchQueue: this.batchQueue.length,
      prefetchQueue: this.prefetchQueue.length,
      activeRequests: this.activeRequests.size,
      cacheHitRate: this.calculateCacheHitRate(),
      averageBatchSize: recentBatches.length > 0 ? 
        recentBatches.reduce((sum, entry) => sum + (entry.data.batchSize || 0), 0) / recentBatches.length : 0,
      prefetchSuccessRate: recentPrefetches.length > 0 ?
        recentPrefetches.filter(entry => entry.data.success).length / recentPrefetches.length : 0,
      behaviorScore: this.calculateBehaviorScore()
    };
  }

  /**
   * Calculate cache hit rate
   */
  private calculateCacheHitRate(): number {
    const cacheRequests = this.behaviorHistory
      .filter(entry => entry.action === 'cache_request' && 
        Date.now() - entry.timestamp < 300000);

    if (cacheRequests.length === 0) return 0;

    const hits = cacheRequests.filter(entry => entry.data.hit).length;
    return hits / cacheRequests.length;
  }

  /**
   * Calculate user behavior score
   */
  private calculateBehaviorScore(): number {
    let score = 0;

    // Engagement metrics
    score += Math.min(0.3, this.userBehavior.clickThroughRate);
    score += Math.min(0.2, this.userBehavior.scrollDepth);
    score += Math.min(0.2, this.userBehavior.averageViewTime / 30000); // Normalize to 30 seconds
    
    // Activity metrics
    const recentActivity = this.behaviorHistory
      .filter(entry => Date.now() - entry.timestamp < 3600000) // Last hour
      .length;
    score += Math.min(0.3, recentActivity / 50); // Normalize to 50 actions per hour

    return Math.min(1, score);
  }

  /**
   * Configure optimization settings
   */
  public configure(newConfig: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.batchQueue = [];
    this.prefetchQueue = [];
    this.progressiveStates.clear();
    this.activeRepliesPromises.clear();
    this.activeRequests.clear();
    this.saveUserBehavior();
  }
}