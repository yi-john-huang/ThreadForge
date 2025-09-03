/**
 * Performance Monitor Service - Task 24
 * Monitors memory usage, response times, and resource consumption
 */

interface PerformanceConfiguration {
  memoryThreshold: number; // bytes
  responseTimeThreshold: number; // milliseconds
  sampleInterval: number; // milliseconds
  maxHistorySize: number;
  maxOperationTypes: number;
  alertCooldown: number; // milliseconds
}

interface MemoryMetrics {
  usedHeapSize: number;
  totalHeapSize: number;
  heapSizeLimit: number;
  usagePercentage: number;
}

interface MemorySnapshot {
  timestamp: number;
  usedHeapSize: number;
  totalHeapSize: number;
}

interface MemoryStatistics {
  average: number;
  peak: number;
  minimum: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

interface ResponseTimeMetrics {
  latestResponse: number;
  totalCalls: number;
  averageResponse: number;
  minResponse: number;
  maxResponse: number;
  history: number[];
}

interface ResponseTimePercentiles {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

interface SlowOperation {
  operation: string;
  duration: number;
  timestamp: number;
}

interface ResourceMetrics {
  domNodeCount: number;
  eventListenerCount: number;
  activeTimers: number;
  openConnections: number;
}

interface ExtensionMetrics {
  [key: string]: number;
}

interface EfficiencyScore {
  score: number; // 0-100
  breakdown: {
    memoryEfficiency: number;
    responseTimeEfficiency: number;
    resourceEfficiency: number;
  };
}

interface PerformanceAlert {
  type: 'memory' | 'response-time' | 'resource';
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: number;
  data?: any;
}

interface OptimizationSuggestion {
  category: 'memory' | 'performance' | 'resource';
  priority: 'high' | 'medium' | 'low';
  description: string;
  impact: string;
  steps: string[];
}

interface PerformanceDegradation {
  detected: boolean;
  operations: string[];
  timeframe: number;
  degradationRate: number;
}

interface PerformanceUpdate {
  type: 'performance-update';
  data: {
    memoryMetrics: MemoryMetrics;
    responseTimeMetrics: { [operation: string]: ResponseTimeMetrics };
    resourceMetrics: ResourceMetrics;
    alerts: PerformanceAlert[];
  };
}

export class PerformanceMonitor {
  private config: PerformanceConfiguration = {
    memoryThreshold: 100 * 1024 * 1024, // 100MB
    responseTimeThreshold: 1000, // 1 second
    sampleInterval: 10000, // 10 seconds
    maxHistorySize: 100,
    maxOperationTypes: 50,
    alertCooldown: 5 * 60 * 1000 // 5 minutes
  };

  private memoryHistory: MemorySnapshot[] = [];
  private responseTimeMetrics: { [operation: string]: ResponseTimeMetrics } = {};
  private extensionMetrics: ExtensionMetrics = {};
  private slowOperations: SlowOperation[] = [];
  private activeTimers: Map<string, number> = new Map();
  private performanceCallbacks: ((update: PerformanceUpdate) => void)[] = [];
  
  private isMonitoring = false;
  private isRealtimeActive = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastAlerts: { [type: string]: number } = {};

  constructor() {
    this.initializeEventListeners();
  }

  /**
   * Initializes event listeners for automatic monitoring
   */
  private initializeEventListeners(): void {
    // Monitor for extension lifecycle events
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'PERFORMANCE_SAMPLE') {
          this.recordMemoryUsage();
        }
      });
    }
  }

  /**
   * Gets current configuration
   */
  public getConfiguration(): PerformanceConfiguration {
    return { ...this.config };
  }

  /**
   * Updates configuration with validation
   */
  public configure(newConfig: Partial<PerformanceConfiguration>): void {
    // Validate configuration
    if (newConfig.memoryThreshold && newConfig.memoryThreshold <= 0) {
      throw new Error('Invalid configuration: memoryThreshold must be positive');
    }
    if (newConfig.responseTimeThreshold && newConfig.responseTimeThreshold <= 0) {
      throw new Error('Invalid configuration: responseTimeThreshold must be positive');
    }
    if (newConfig.sampleInterval && newConfig.sampleInterval <= 0) {
      throw new Error('Invalid configuration: sampleInterval must be positive');
    }

    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Starts performance monitoring
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.recordInitialBaseline();
  }

  /**
   * Stops performance monitoring
   */
  public stopMonitoring(): void {
    this.isMonitoring = false;
    this.stopRealtimeMonitoring();
  }

  /**
   * Checks if monitoring is active
   */
  public isRunning(): boolean {
    return this.isMonitoring;
  }

  /**
   * Records initial performance baseline
   */
  private recordInitialBaseline(): void {
    this.recordMemoryUsage();
    this.extensionMetrics = {};
  }

  /**
   * Gets current memory metrics
   */
  public getMemoryMetrics(): MemoryMetrics {
    if (typeof performance === 'undefined' || !performance || !performance.memory) {
      return {
        usedHeapSize: 0,
        totalHeapSize: 0,
        heapSizeLimit: 0,
        usagePercentage: 0
      };
    }

    const memory = performance.memory;
    return {
      usedHeapSize: memory.usedJSHeapSize,
      totalHeapSize: memory.totalJSHeapSize,
      heapSizeLimit: memory.jsHeapSizeLimit,
      usagePercentage: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100
    };
  }

  /**
   * Records current memory usage
   */
  public recordMemoryUsage(): void {
    const metrics = this.getMemoryMetrics();
    
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      usedHeapSize: metrics.usedHeapSize,
      totalHeapSize: metrics.totalHeapSize
    };

    this.memoryHistory.push(snapshot);

    // Limit history size
    if (this.memoryHistory.length > this.config.maxHistorySize) {
      this.memoryHistory = this.memoryHistory.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * Gets memory history
   */
  public getMemoryHistory(): MemorySnapshot[] {
    return [...this.memoryHistory];
  }

  /**
   * Checks if memory usage is over threshold
   */
  public isMemoryOverThreshold(): boolean {
    const metrics = this.getMemoryMetrics();
    return metrics.usedHeapSize > this.config.memoryThreshold;
  }

  /**
   * Gets memory usage statistics
   */
  public getMemoryStatistics(): MemoryStatistics {
    if (this.memoryHistory.length === 0) {
      return {
        average: 0,
        peak: 0,
        minimum: 0,
        trend: 'stable'
      };
    }

    const usedSizes = this.memoryHistory.map(h => h.usedHeapSize);
    const average = usedSizes.reduce((sum, size) => sum + size, 0) / usedSizes.length;
    const peak = Math.max(...usedSizes);
    const minimum = Math.min(...usedSizes);

    // Calculate trend
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (this.memoryHistory.length >= 5) {
      const recent = usedSizes.slice(-5);
      const older = usedSizes.slice(-10, -5);
      
      if (older.length > 0) {
        const recentAvg = recent.reduce((sum, size) => sum + size, 0) / recent.length;
        const olderAvg = older.reduce((sum, size) => sum + size, 0) / older.length;
        
        const changePercentage = ((recentAvg - olderAvg) / olderAvg) * 100;
        
        if (changePercentage > 10) {
          trend = 'increasing';
        } else if (changePercentage < -10) {
          trend = 'decreasing';
        }
      }
    }

    return { average, peak, minimum, trend };
  }

  /**
   * Starts a performance timer
   */
  public startTimer(operation: string): string {
    const timerId = `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = this.getPerformanceNow();
    
    this.activeTimers.set(timerId, startTime);
    return timerId;
  }

  /**
   * Ends a performance timer and records metrics
   */
  public endTimer(timerId: string, operation: string): void {
    const startTime = this.activeTimers.get(timerId);
    if (!startTime) {
      return; // Timer not found or already ended
    }

    const endTime = this.getPerformanceNow();
    const duration = endTime - startTime;

    this.activeTimers.delete(timerId);
    this.recordResponseTime(operation, duration);
  }

  /**
   * Gets performance.now() or fallback
   */
  private getPerformanceNow(): number {
    if (typeof performance !== 'undefined' && performance && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * Records response time for an operation
   */
  private recordResponseTime(operation: string, duration: number): void {
    if (!this.responseTimeMetrics[operation]) {
      this.responseTimeMetrics[operation] = {
        latestResponse: 0,
        totalCalls: 0,
        averageResponse: 0,
        minResponse: Infinity,
        maxResponse: 0,
        history: []
      };
    }

    const metrics = this.responseTimeMetrics[operation];
    metrics.latestResponse = duration;
    metrics.totalCalls++;
    metrics.minResponse = Math.min(metrics.minResponse, duration);
    metrics.maxResponse = Math.max(metrics.maxResponse, duration);
    
    // Update running average
    metrics.averageResponse = ((metrics.averageResponse * (metrics.totalCalls - 1)) + duration) / metrics.totalCalls;
    
    // Add to history
    metrics.history.push(duration);
    if (metrics.history.length > 100) { // Limit history size
      metrics.history = metrics.history.slice(-100);
    }

    // Check for slow operations
    if (duration > this.config.responseTimeThreshold) {
      this.slowOperations.push({
        operation,
        duration,
        timestamp: Date.now()
      });

      // Limit slow operations history
      if (this.slowOperations.length > 50) {
        this.slowOperations = this.slowOperations.slice(-50);
      }
    }

    // Limit operation types to prevent memory leaks
    if (Object.keys(this.responseTimeMetrics).length > this.config.maxOperationTypes) {
      // Remove oldest operation type
      const oldestOperation = Object.keys(this.responseTimeMetrics)[0];
      delete this.responseTimeMetrics[oldestOperation];
    }
  }

  /**
   * Gets response time metrics for specific operation
   */
  public getResponseTimeMetrics(operation: string): ResponseTimeMetrics {
    return this.responseTimeMetrics[operation] || {
      latestResponse: 0,
      totalCalls: 0,
      averageResponse: 0,
      minResponse: 0,
      maxResponse: 0,
      history: []
    };
  }

  /**
   * Gets all response time metrics
   */
  public getAllResponseTimeMetrics(): { [operation: string]: ResponseTimeMetrics } {
    return { ...this.responseTimeMetrics };
  }

  /**
   * Gets slow operations
   */
  public getSlowOperations(): SlowOperation[] {
    return [...this.slowOperations];
  }

  /**
   * Gets response time percentiles for operation
   */
  public getResponseTimePercentiles(operation: string): ResponseTimePercentiles {
    const metrics = this.responseTimeMetrics[operation];
    if (!metrics || metrics.history.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    const sorted = [...metrics.history].sort((a, b) => a - b);
    const length = sorted.length;

    return {
      p50: this.getPercentile(sorted, 50),
      p90: this.getPercentile(sorted, 90),
      p95: this.getPercentile(sorted, 95),
      p99: this.getPercentile(sorted, 99)
    };
  }

  /**
   * Calculates percentile from sorted array
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedArray[lower];
    }
    
    return sortedArray[lower] + (sortedArray[upper] - sortedArray[lower]) * (index - lower);
  }

  /**
   * Gets current resource metrics
   */
  public getResourceMetrics(): ResourceMetrics {
    let domNodeCount = 0;
    let eventListenerCount = 0;

    try {
      if (typeof document !== 'undefined') {
        domNodeCount = document.querySelectorAll('*').length;
        
        // Estimate event listener count (approximation)
        eventListenerCount = document.querySelectorAll('[onclick]').length +
                            document.querySelectorAll('[onload]').length +
                            document.querySelectorAll('[onchange]').length;
      }
    } catch (error) {
      // Ignore errors in resource counting
    }

    return {
      domNodeCount,
      eventListenerCount,
      activeTimers: this.activeTimers.size,
      openConnections: 0 // Would need more sophisticated tracking
    };
  }

  /**
   * Gets resource usage warnings
   */
  public getResourceWarnings(): string[] {
    const warnings: string[] = [];
    const resources = this.getResourceMetrics();

    if (resources.domNodeCount > 3000) {
      warnings.push(`High DOM node count (${resources.domNodeCount}). Consider virtual scrolling.`);
    }

    if (resources.activeTimers > 20) {
      warnings.push(`Many active timers (${resources.activeTimers}). Check for timer leaks.`);
    }

    if (this.activeTimers.size > 10) {
      warnings.push(`${this.activeTimers.size} active performance timers. Some operations may not have been completed.`);
    }

    return warnings;
  }

  /**
   * Records extension-specific metrics
   */
  public recordExtensionMetric(metric: string, value: number): void {
    this.extensionMetrics[metric] = value;
  }

  /**
   * Gets extension metrics
   */
  public getExtensionMetrics(): ExtensionMetrics {
    return { ...this.extensionMetrics };
  }

  /**
   * Calculates efficiency score
   */
  public getEfficiencyScore(): EfficiencyScore {
    let memoryEfficiency = 100;
    let responseTimeEfficiency = 100;
    let resourceEfficiency = 100;

    // Memory efficiency
    const memoryMetrics = this.getMemoryMetrics();
    if (memoryMetrics.usagePercentage > 0) {
      memoryEfficiency = Math.max(0, 100 - memoryMetrics.usagePercentage);
    }

    // Response time efficiency
    const allMetrics = Object.values(this.responseTimeMetrics);
    if (allMetrics.length > 0) {
      const avgResponseTime = allMetrics.reduce((sum, m) => sum + m.averageResponse, 0) / allMetrics.length;
      responseTimeEfficiency = Math.max(0, 100 - (avgResponseTime / this.config.responseTimeThreshold) * 100);
    }

    // Resource efficiency
    const resources = this.getResourceMetrics();
    const domScore = Math.max(0, 100 - (resources.domNodeCount / 5000) * 100);
    const timerScore = Math.max(0, 100 - (resources.activeTimers / 50) * 100);
    resourceEfficiency = (domScore + timerScore) / 2;

    const score = (memoryEfficiency + responseTimeEfficiency + resourceEfficiency) / 3;

    return {
      score: Math.round(score),
      breakdown: {
        memoryEfficiency: Math.round(memoryEfficiency),
        responseTimeEfficiency: Math.round(responseTimeEfficiency),
        resourceEfficiency: Math.round(resourceEfficiency)
      }
    };
  }

  /**
   * Checks performance thresholds and triggers alerts
   */
  public async checkThresholds(): Promise<void> {
    const alerts: PerformanceAlert[] = [];
    const now = Date.now();

    // Check memory threshold
    if (this.isMemoryOverThreshold()) {
      const lastMemoryAlert = this.lastAlerts['memory'] || 0;
      if (now - lastMemoryAlert > this.config.alertCooldown) {
        const memoryMetrics = this.getMemoryMetrics();
        alerts.push({
          type: 'memory',
          severity: memoryMetrics.usagePercentage > 80 ? 'high' : 'medium',
          message: `Memory usage is high: ${Math.round(memoryMetrics.usagePercentage)}% (${Math.round(memoryMetrics.usedHeapSize / 1024 / 1024)}MB)`,
          timestamp: now,
          data: memoryMetrics
        });
        this.lastAlerts['memory'] = now;
      }
    }

    // Check slow operations
    const recentSlowOps = this.slowOperations.filter(op => now - op.timestamp < 60000); // Last minute
    if (recentSlowOps.length > 0) {
      const lastResponseAlert = this.lastAlerts['response-time'] || 0;
      if (now - lastResponseAlert > this.config.alertCooldown) {
        alerts.push({
          type: 'response-time',
          severity: recentSlowOps.length > 5 ? 'high' : 'medium',
          message: `${recentSlowOps.length} slow operations detected in the last minute`,
          timestamp: now,
          data: recentSlowOps
        });
        this.lastAlerts['response-time'] = now;
      }
    }

    // Check resource usage
    const resourceWarnings = this.getResourceWarnings();
    if (resourceWarnings.length > 0) {
      const lastResourceAlert = this.lastAlerts['resource'] || 0;
      if (now - lastResourceAlert > this.config.alertCooldown) {
        alerts.push({
          type: 'resource',
          severity: resourceWarnings.length > 2 ? 'high' : 'medium',
          message: `Resource usage warnings: ${resourceWarnings.length} issues detected`,
          timestamp: now,
          data: resourceWarnings
        });
        this.lastAlerts['resource'] = now;
      }
    }

    // Send alerts
    for (const alert of alerts) {
      await this.sendAlert(alert);
    }
  }

  /**
   * Sends performance alert
   */
  private async sendAlert(alert: PerformanceAlert): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.notifications) {
      return;
    }

    try {
      const iconColor = alert.severity === 'high' ? '🔴' : alert.severity === 'medium' ? '🟡' : '🟢';
      const alertId = `perf-alert-${Date.now()}`;
      
      await chrome.notifications.create(alertId, {
        type: 'basic',
        iconUrl: chrome.runtime?.getURL?.('icons/icon48.png') || 'icons/icon48.png',
        title: `${iconColor} Performance Alert`,
        message: alert.message
      });
    } catch (error) {
      console.warn('Failed to send performance alert:', error);
    }
  }

  /**
   * Gets performance recommendations
   */
  public getPerformanceRecommendations(): string[] {
    const recommendations: string[] = [];
    
    // Memory recommendations
    const memoryStats = this.getMemoryStatistics();
    if (memoryStats.trend === 'increasing') {
      recommendations.push('Memory usage is increasing. Consider optimizing data structures or adding cleanup routines.');
    }
    
    if (this.isMemoryOverThreshold()) {
      recommendations.push('Memory usage is above threshold. Review object retention and garbage collection.');
    }

    // Performance recommendations
    const slowOps = this.getSlowOperations();
    const recentSlowOps = slowOps.filter(op => Date.now() - op.timestamp < 300000); // Last 5 minutes
    if (recentSlowOps.length > 0) {
      const operations = [...new Set(recentSlowOps.map(op => op.operation))];
      recommendations.push(`Optimize slow operations: ${operations.join(', ')}`);
    }

    // Resource recommendations
    const resourceWarnings = this.getResourceWarnings();
    if (resourceWarnings.length > 0) {
      recommendations.push(...resourceWarnings);
    }

    // API efficiency recommendations
    if (this.extensionMetrics.apiCallsMade && this.extensionMetrics.threadsProcessed) {
      const efficiency = this.extensionMetrics.threadsProcessed / this.extensionMetrics.apiCallsMade;
      if (efficiency < 2) {
        recommendations.push('API call efficiency is low. Consider batching requests or caching responses.');
      }
    }

    return recommendations;
  }

  /**
   * Starts real-time monitoring
   */
  public startRealtimeMonitoring(): void {
    if (this.isRealtimeActive) {
      return;
    }

    this.isRealtimeActive = true;
    this.monitoringInterval = setInterval(() => {
      this.recordMemoryUsage();
      this.checkThresholds();
      this.broadcastPerformanceUpdate();
    }, this.config.sampleInterval);
  }

  /**
   * Stops real-time monitoring
   */
  public stopRealtimeMonitoring(): void {
    this.isRealtimeActive = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Checks if real-time monitoring is active
   */
  public isRealtimeMonitoringActive(): boolean {
    return this.isRealtimeActive;
  }

  /**
   * Adds performance update callback
   */
  public onPerformanceUpdate(callback: (update: PerformanceUpdate) => void): void {
    this.performanceCallbacks.push(callback);
  }

  /**
   * Broadcasts performance update
   */
  private broadcastPerformanceUpdate(): void {
    const update: PerformanceUpdate = {
      type: 'performance-update',
      data: {
        memoryMetrics: this.getMemoryMetrics(),
        responseTimeMetrics: this.responseTimeMetrics,
        resourceMetrics: this.getResourceMetrics(),
        alerts: [] // Would include recent alerts
      }
    };

    this.performanceCallbacks.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        console.warn('Performance update callback error:', error);
      }
    });
  }

  /**
   * Detects performance degradation trends
   */
  public detectPerformanceDegradation(): PerformanceDegradation {
    const degradingOperations: string[] = [];
    const timeframe = 300000; // 5 minutes
    const now = Date.now();

    Object.entries(this.responseTimeMetrics).forEach(([operation, metrics]) => {
      if (metrics.history.length < 10) return;

      // Check recent vs older performance
      const recentResponses = metrics.history.slice(-5);
      const olderResponses = metrics.history.slice(-15, -10);

      if (olderResponses.length === 0) return;

      const recentAvg = recentResponses.reduce((sum, time) => sum + time, 0) / recentResponses.length;
      const olderAvg = olderResponses.reduce((sum, time) => sum + time, 0) / olderResponses.length;

      const degradationRate = ((recentAvg - olderAvg) / olderAvg) * 100;

      if (degradationRate > 50) { // 50% slower
        degradingOperations.push(operation);
      }
    });

    return {
      detected: degradingOperations.length > 0,
      operations: degradingOperations,
      timeframe,
      degradationRate: degradingOperations.length > 0 ? 50 : 0
    };
  }

  /**
   * Gets optimization suggestions
   */
  public getOptimizationSuggestions(): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Memory optimization suggestions
    const memoryMetrics = this.getMemoryMetrics();
    if (memoryMetrics.usagePercentage > 70) {
      suggestions.push({
        category: 'memory',
        priority: 'high',
        description: 'High memory usage detected',
        impact: 'Reduce memory consumption by up to 30%',
        steps: [
          'Review object references and remove unused variables',
          'Implement object pooling for frequently created objects',
          'Use weak references where appropriate',
          'Clear interval timers and event listeners when done',
          'Optimize data structures and avoid memory leaks'
        ]
      });
    }

    // Performance optimization suggestions
    const slowOps = this.getSlowOperations();
    const recentSlowOps = slowOps.filter(op => Date.now() - op.timestamp < 300000);
    if (recentSlowOps.length > 0) {
      const slowOperations = [...new Set(recentSlowOps.map(op => op.operation))];
      suggestions.push({
        category: 'performance',
        priority: slowOperations.length > 3 ? 'high' : 'medium',
        description: `Slow operations detected: ${slowOperations.join(', ')}`,
        impact: 'Improve response times by up to 60%',
        steps: [
          'Add caching for frequently accessed data',
          'Implement request batching and debouncing',
          'Use asynchronous operations where possible',
          'Optimize DOM manipulation and queries',
          'Consider using Web Workers for heavy computations'
        ]
      });
    }

    // Resource optimization suggestions
    const resources = this.getResourceMetrics();
    if (resources.domNodeCount > 3000) {
      suggestions.push({
        category: 'resource',
        priority: 'medium',
        description: 'High DOM node count affecting performance',
        impact: 'Improve rendering performance by up to 40%',
        steps: [
          'Implement virtual scrolling for large lists',
          'Use document fragments for batch DOM operations',
          'Remove unused DOM elements periodically',
          'Optimize CSS selectors and avoid deep nesting',
          'Consider using shadow DOM for encapsulation'
        ]
      });
    }

    // Sort by priority
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    suggestions.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);

    return suggestions;
  }

  /**
   * Saves metrics to storage
   */
  public async saveMetricsToStorage(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      const metricsData = {
        memoryHistory: this.memoryHistory,
        responseTimeMetrics: this.responseTimeMetrics,
        extensionMetrics: this.extensionMetrics,
        slowOperations: this.slowOperations,
        timestamp: Date.now()
      };

      await chrome.storage.local.set({
        performanceMetrics: metricsData
      });
    } catch (error) {
      console.warn('Failed to save performance metrics:', error);
    }
  }

  /**
   * Loads metrics from storage
   */
  public async loadMetricsFromStorage(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      const result = await chrome.storage.local.get(['performanceMetrics']);
      const metricsData = result.performanceMetrics;

      if (metricsData) {
        this.memoryHistory = metricsData.memoryHistory || [];
        this.responseTimeMetrics = metricsData.responseTimeMetrics || {};
        this.extensionMetrics = metricsData.extensionMetrics || {};
        this.slowOperations = metricsData.slowOperations || [];
      }
    } catch (error) {
      console.warn('Failed to load performance metrics:', error);
    }
  }

  /**
   * Exports comprehensive performance report
   */
  public async exportPerformanceReport(): Promise<any> {
    const efficiency = this.getEfficiencyScore();
    const memoryStats = this.getMemoryStatistics();
    const degradation = this.detectPerformanceDegradation();
    
    return {
      timestamp: Date.now(),
      configuration: this.config,
      memoryMetrics: {
        current: this.getMemoryMetrics(),
        statistics: memoryStats,
        history: this.memoryHistory.slice(-20) // Last 20 samples
      },
      responseTimeMetrics: this.responseTimeMetrics,
      resourceMetrics: this.getResourceMetrics(),
      extensionMetrics: this.extensionMetrics,
      performanceIssues: {
        slowOperations: this.slowOperations.slice(-10),
        resourceWarnings: this.getResourceWarnings(),
        degradation
      },
      efficiency,
      recommendations: this.getPerformanceRecommendations(),
      optimizationSuggestions: this.getOptimizationSuggestions()
    };
  }

  /**
   * Destroys the monitor and cleans up resources
   */
  public destroy(): void {
    this.stopMonitoring();
    this.stopRealtimeMonitoring();
    this.activeTimers.clear();
    this.performanceCallbacks = [];
    this.memoryHistory = [];
    this.responseTimeMetrics = {};
    this.extensionMetrics = {};
    this.slowOperations = [];
  }
}