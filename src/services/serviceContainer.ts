/**
 * Service Container for Dependency Injection and Service Management
 * Provides centralized service lifecycle management, health monitoring, and dependency injection
 * Requirements: Integration of all services with proper initialization order and monitoring
 */

import { ThreadsAPIService } from '../api/threadsApiService';
import { CacheManager } from '../cache/cacheManager';
import { PerformanceMonitor } from '../performance/performanceMonitor';
import { PerformanceOptimizer } from '../optimization/performanceOptimizer';
import { UpgradeNotificationService } from '../migration/upgradeNotificationService';
import { MigrationGuideManager } from '../migration/migrationGuideManager';
import { GracefulDegradationService } from '../migration/gracefulDegradationService';
import { OAuth2AuthenticationService } from '../auth/oauth2Service';
import { CredentialsManager } from '../auth/credentialsManager';

/**
 * Service health status
 */
export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'initializing' | 'stopped';
  lastCheck: number;
  uptime: number;
  errorCount: number;
  lastError?: string;
  metadata?: Record<string, any>;
}

/**
 * Service configuration options
 */
export interface ServiceConfig {
  enabled: boolean;
  priority: number; // Lower number = higher priority for initialization
  dependencies: string[];
  healthCheckInterval?: number; // ms
  maxRetries?: number;
  retryDelay?: number; // ms
}

/**
 * Service registry entry
 */
interface ServiceEntry {
  instance: any;
  config: ServiceConfig;
  health: ServiceHealth;
  initPromise?: Promise<void>;
  healthCheckTimer?: NodeJS.Timeout;
  retryCount: number;
  startTime: number;
}

/**
 * Service lifecycle events
 */
export type ServiceEventType = 'initializing' | 'initialized' | 'error' | 'degraded' | 'recovered' | 'stopped';

export interface ServiceEvent {
  type: ServiceEventType;
  serviceName: string;
  timestamp: number;
  data?: any;
  error?: Error;
}

export type ServiceEventListener = (event: ServiceEvent) => void;

/**
 * Comprehensive service container with dependency injection,
 * lifecycle management, and health monitoring
 */
export class ServiceContainer {
  private services: Map<string, ServiceEntry> = new Map();
  private eventListeners: ServiceEventListener[] = [];
  private initialized = false;
  private initializing = false;
  private destroyed = false;

  /**
   * Default service configurations
   */
  private defaultConfigs: Record<string, ServiceConfig> = {
    'cache': {
      enabled: true,
      priority: 1,
      dependencies: [],
      healthCheckInterval: 30000,
      maxRetries: 3,
      retryDelay: 1000
    },
    'oauth2': {
      enabled: true,
      priority: 2,
      dependencies: [],
      healthCheckInterval: 60000,
      maxRetries: 3,
      retryDelay: 2000
    },
    'credentials': {
      enabled: true,
      priority: 3,
      dependencies: ['oauth2'],
      healthCheckInterval: 60000,
      maxRetries: 3,
      retryDelay: 1000
    },
    'threadsApi': {
      enabled: true,
      priority: 4,
      dependencies: ['credentials'],
      healthCheckInterval: 30000,
      maxRetries: 5,
      retryDelay: 2000
    },
    'performanceMonitor': {
      enabled: true,
      priority: 5,
      dependencies: [],
      healthCheckInterval: 15000,
      maxRetries: 2,
      retryDelay: 500
    },
    'performanceOptimizer': {
      enabled: true,
      priority: 6,
      dependencies: ['performanceMonitor', 'threadsApi', 'cache'],
      healthCheckInterval: 30000,
      maxRetries: 3,
      retryDelay: 1000
    },
    'upgradeNotification': {
      enabled: true,
      priority: 7,
      dependencies: [],
      healthCheckInterval: 120000,
      maxRetries: 2,
      retryDelay: 5000
    },
    'migrationGuide': {
      enabled: true,
      priority: 8,
      dependencies: ['upgradeNotification'],
      healthCheckInterval: 60000,
      maxRetries: 2,
      retryDelay: 2000
    },
    'gracefulDegradation': {
      enabled: true,
      priority: 9,
      dependencies: ['performanceMonitor'],
      healthCheckInterval: 45000,
      maxRetries: 2,
      retryDelay: 1500
    }
  };

  /**
   * Register a service with the container
   */
  public registerService<T>(
    name: string, 
    factory: () => T | Promise<T>, 
    config?: Partial<ServiceConfig>
  ): void {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    if (this.destroyed) {
      throw new Error('Cannot register services on destroyed container');
    }

    const serviceConfig: ServiceConfig = {
      enabled: true,
      priority: 10,
      dependencies: [],
      healthCheckInterval: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      ...this.defaultConfigs[name],
      ...config
    };

    const health: ServiceHealth = {
      name,
      status: 'stopped',
      lastCheck: 0,
      uptime: 0,
      errorCount: 0
    };

    // Don't create instance yet - lazy initialization
    const entry: ServiceEntry = {
      instance: null,
      config: serviceConfig,
      health,
      retryCount: 0,
      startTime: 0
    };

    // Store factory function temporarily
    (entry as any).factory = factory;

    this.services.set(name, entry);
  }

  /**
   * Get service instance (lazy initialization)
   */
  public async getService<T>(name: string): Promise<T> {
    const entry = this.services.get(name);
    if (!entry) {
      throw new Error(`Service '${name}' not found`);
    }

    if (!entry.config.enabled) {
      throw new Error(`Service '${name}' is disabled`);
    }

    if (entry.instance) {
      return entry.instance as T;
    }

    // Initialize if needed
    if (!entry.initPromise) {
      entry.initPromise = this.initializeService(name);
    }

    await entry.initPromise;
    return entry.instance as T;
  }

  /**
   * Initialize a specific service
   */
  private async initializeService(name: string): Promise<void> {
    const entry = this.services.get(name);
    if (!entry || entry.instance) {
      return;
    }

    this.emitEvent({
      type: 'initializing',
      serviceName: name,
      timestamp: Date.now()
    });

    entry.health.status = 'initializing';
    entry.startTime = Date.now();

    try {
      // Initialize dependencies first
      for (const depName of entry.config.dependencies) {
        await this.getService(depName);
      }

      // Create service instance
      const factory = (entry as any).factory;
      if (!factory) {
        throw new Error(`No factory function found for service '${name}'`);
      }

      const instance = await factory();
      entry.instance = instance;

      // Initialize service-specific setup
      await this.setupService(name, instance);

      entry.health.status = 'healthy';
      entry.health.lastCheck = Date.now();
      entry.health.uptime = Date.now() - entry.startTime;

      // Start health checking
      this.startHealthCheck(name);

      this.emitEvent({
        type: 'initialized',
        serviceName: name,
        timestamp: Date.now()
      });

    } catch (error) {
      entry.health.status = 'unhealthy';
      entry.health.errorCount++;
      entry.health.lastError = error instanceof Error ? error.message : String(error);

      this.emitEvent({
        type: 'error',
        serviceName: name,
        timestamp: Date.now(),
        error: error instanceof Error ? error : new Error(String(error))
      });

      throw error;
    }
  }

  /**
   * Setup service-specific configuration after initialization
   */
  private async setupService(name: string, instance: any): Promise<void> {
    switch (name) {
      case 'performanceOptimizer':
        // Configure optimization settings based on environment
        instance.configure({
          batchSize: 5,
          batchDelay: 100,
          prefetchThreshold: 0.7,
          maxConcurrentRequests: 3
        });
        break;

      case 'performanceMonitor':
        // Start monitoring
        instance.startMonitoring();
        break;

      case 'cache':
        // Setup cache event listeners for health monitoring
        instance.addEventListener?.((event: any) => {
          if (event.type === 'error') {
            this.handleServiceError(name, event.error);
          }
        });
        break;

      case 'threadsApi':
        // Setup API interceptors for health monitoring
        instance.addRequestInterceptor?.((config: any) => {
          // Track API health
          return config;
        });

        instance.addResponseInterceptor?.(
          (response: any) => response,
          (error: any) => {
            this.handleServiceError(name, error);
            return Promise.reject(error);
          }
        );
        break;

      case 'gracefulDegradation':
        // Initialize browser capability detection
        if (typeof instance.detectBrowserCapabilities === 'function') {
          instance.detectBrowserCapabilities();
        }
        break;
    }
  }

  /**
   * Handle service error for health monitoring
   */
  private handleServiceError(serviceName: string, error: Error): void {
    const entry = this.services.get(serviceName);
    if (!entry) return;

    entry.health.errorCount++;
    entry.health.lastError = error.message;

    // Determine if service should be marked as degraded
    if (entry.health.errorCount > 3) {
      entry.health.status = 'degraded';
      this.emitEvent({
        type: 'degraded',
        serviceName,
        timestamp: Date.now(),
        error
      });
    }
  }

  /**
   * Start health check for a service
   */
  private startHealthCheck(name: string): void {
    const entry = this.services.get(name);
    if (!entry || !entry.config.healthCheckInterval) {
      return;
    }

    entry.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck(name);
    }, entry.config.healthCheckInterval);
  }

  /**
   * Perform health check on a service
   */
  private async performHealthCheck(name: string): Promise<void> {
    const entry = this.services.get(name);
    if (!entry || !entry.instance) {
      return;
    }

    const previousStatus = entry.health.status;

    try {
      let isHealthy = true;
      const metadata: Record<string, any> = {};

      // Service-specific health checks
      switch (name) {
        case 'cache':
          try {
            await entry.instance.getStatistics();
            const stats = await entry.instance.getStatistics();
            metadata.hitRate = stats.hitRate;
            metadata.totalEntries = stats.totalEntries;
          } catch {
            isHealthy = false;
          }
          break;

        case 'threadsApi':
          // Check if API is responsive
          metadata.rateLimitInfo = entry.instance.getRateLimitInfo?.() || {};
          break;

        case 'performanceMonitor':
          try {
            const metrics = entry.instance.getMemoryMetrics();
            metadata.memoryUsage = metrics.usagePercentage;
            isHealthy = metrics.usagePercentage < 90; // Consider unhealthy if > 90% memory
          } catch {
            isHealthy = false;
          }
          break;

        case 'performanceOptimizer':
          const stats = entry.instance.getOptimizationStats();
          metadata.queueSizes = {
            batch: stats.batchQueue,
            prefetch: stats.prefetchQueue
          };
          metadata.behaviorScore = stats.behaviorScore;
          break;
      }

      entry.health.status = isHealthy ? 'healthy' : 'degraded';
      entry.health.lastCheck = Date.now();
      entry.health.uptime = Date.now() - entry.startTime;
      entry.health.metadata = metadata;

      // Emit recovery event if service recovered
      if (previousStatus === 'degraded' && entry.health.status === 'healthy') {
        this.emitEvent({
          type: 'recovered',
          serviceName: name,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      entry.health.status = 'unhealthy';
      entry.health.errorCount++;
      entry.health.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Initialize all services in proper order
   */
  public async initialize(): Promise<void> {
    if (this.initialized || this.initializing) {
      return;
    }

    if (this.destroyed) {
      throw new Error('Cannot initialize destroyed container');
    }

    this.initializing = true;

    try {
      // Get services sorted by priority
      const sortedServices = Array.from(this.services.entries())
        .filter(([_, entry]) => entry.config.enabled)
        .sort(([_a, entryA], [_b, entryB]) => entryA.config.priority - entryB.config.priority);

      // Initialize services in order
      for (const [name, _] of sortedServices) {
        await this.getService(name);
      }

      this.initialized = true;
      this.initializing = false;

    } catch (error) {
      this.initializing = false;
      throw error;
    }
  }

  /**
   * Get health status of all services
   */
  public getHealthStatus(): ServiceHealth[] {
    return Array.from(this.services.values()).map(entry => ({ ...entry.health }));
  }

  /**
   * Get health status of a specific service
   */
  public getServiceHealth(name: string): ServiceHealth | null {
    const entry = this.services.get(name);
    return entry ? { ...entry.health } : null;
  }

  /**
   * Check if all services are healthy
   */
  public isHealthy(): boolean {
    return Array.from(this.services.values()).every(entry => 
      !entry.config.enabled || entry.health.status === 'healthy'
    );
  }

  /**
   * Get overall system health summary
   */
  public getSystemHealth(): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceHealth[];
    summary: {
      total: number;
      healthy: number;
      degraded: number;
      unhealthy: number;
      stopped: number;
    };
  } {
    const services = this.getHealthStatus();
    const summary = {
      total: services.length,
      healthy: services.filter(s => s.status === 'healthy').length,
      degraded: services.filter(s => s.status === 'degraded').length,
      unhealthy: services.filter(s => s.status === 'unhealthy').length,
      stopped: services.filter(s => s.status === 'stopped').length
    };

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (summary.unhealthy > 0) {
      overall = 'unhealthy';
    } else if (summary.degraded > 0) {
      overall = 'degraded';
    } else {
      overall = 'healthy';
    }

    return { overall, services, summary };
  }

  /**
   * Restart a service
   */
  public async restartService(name: string): Promise<void> {
    const entry = this.services.get(name);
    if (!entry) {
      throw new Error(`Service '${name}' not found`);
    }

    // Stop service
    await this.stopService(name);

    // Reset state
    entry.instance = null;
    entry.initPromise = undefined;
    entry.health.status = 'stopped';
    entry.health.errorCount = 0;
    entry.retryCount = 0;

    // Reinitialize
    await this.getService(name);
  }

  /**
   * Stop a service
   */
  public async stopService(name: string): Promise<void> {
    const entry = this.services.get(name);
    if (!entry) {
      return;
    }

    // Clear health check timer
    if (entry.healthCheckTimer) {
      clearInterval(entry.healthCheckTimer);
      entry.healthCheckTimer = undefined;
    }

    // Call service cleanup if available
    if (entry.instance && typeof entry.instance.destroy === 'function') {
      try {
        await entry.instance.destroy();
      } catch (error) {
        console.warn(`Error during ${name} service cleanup:`, error);
      }
    }

    entry.health.status = 'stopped';
    entry.health.uptime = 0;

    this.emitEvent({
      type: 'stopped',
      serviceName: name,
      timestamp: Date.now()
    });
  }

  /**
   * Add event listener
   */
  public addEventListener(listener: ServiceEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener
   */
  public removeEventListener(listener: ServiceEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Emit service event
   */
  private emitEvent(event: ServiceEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in service event listener:', error);
      }
    });
  }

  /**
   * Gracefully shutdown all services
   */
  public async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    // Stop all services in reverse order
    const sortedServices = Array.from(this.services.entries())
      .sort(([_a, entryA], [_b, entryB]) => entryB.config.priority - entryA.config.priority);

    for (const [name, _] of sortedServices) {
      await this.stopService(name);
    }

    this.services.clear();
    this.eventListeners = [];
    this.initialized = false;
  }
}

/**
 * Default service container instance with all ThreadForge services
 */
export class ThreadForgeServiceContainer extends ServiceContainer {
  private static instance: ThreadForgeServiceContainer | null = null;

  private constructor() {
    super();
    this.registerDefaultServices();
  }

  public static getInstance(): ThreadForgeServiceContainer {
    if (!ThreadForgeServiceContainer.instance) {
      ThreadForgeServiceContainer.instance = new ThreadForgeServiceContainer();
    }
    return ThreadForgeServiceContainer.instance;
  }

  /**
   * Register all default ThreadForge services
   */
  private registerDefaultServices(): void {
    // Cache Manager
    this.registerService('cache', () => new CacheManager({
      maxSize: 50 * 1024 * 1024, // 50MB
      maxEntries: 5000,
      defaultTtl: 60 * 60 * 1000, // 1 hour
      storageType: 'local'
    }));

    // OAuth2 Service
    this.registerService('oauth2', () => new OAuth2AuthenticationService({
      clientId: process.env.THREADS_CLIENT_ID || 'test-client-id',
      clientSecret: process.env.THREADS_CLIENT_SECRET || 'test-client-secret',
      redirectUri: 'https://localhost:3000/callback',
      scopes: ['threads_basic', 'threads_content_publish'],
      authorizationUrl: 'https://threads.net/oauth/authorize',
      tokenUrl: 'https://graph.threads.net/oauth/access_token'
    }));

    // Credentials Manager
    this.registerService('credentials', async () => {
      const oauth2 = await this.getService<OAuth2AuthenticationService>('oauth2');
      return new CredentialsManager(oauth2);
    });

    // Threads API Service
    this.registerService('threadsApi', async () => {
      const credentials = await this.getService<CredentialsManager>('credentials');
      const apiService = new ThreadsAPIService({
        timeout: 15000,
        maxRetries: 3
      });

      // Setup authentication
      apiService.addRequestInterceptor(async (config) => {
        const token = await credentials.getAccessToken();
        if (token) {
          config.headers = {
            ...config.headers,
            'Authorization': `Bearer ${token}`
          };
        }
        return config;
      });

      return apiService;
    });

    // Performance Monitor
    this.registerService('performanceMonitor', () => new PerformanceMonitor({
      memoryThreshold: 100 * 1024 * 1024, // 100MB
      responseTimeThreshold: 2000, // 2 seconds
      sampleInterval: 15000 // 15 seconds
    }));

    // Performance Optimizer
    this.registerService('performanceOptimizer', async () => {
      const monitor = await this.getService<PerformanceMonitor>('performanceMonitor');
      const api = await this.getService<ThreadsAPIService>('threadsApi');
      const cache = await this.getService<CacheManager>('cache');
      
      return new PerformanceOptimizer(monitor, api, cache, {
        batchSize: 5,
        prefetchThreshold: 0.7,
        cacheWarmupEnabled: true
      });
    });

    // Upgrade Notification Service
    this.registerService('upgradeNotification', () => new UpgradeNotificationService());

    // Migration Guide Manager
    this.registerService('migrationGuide', async () => {
      const upgradeService = await this.getService<UpgradeNotificationService>('upgradeNotification');
      return new MigrationGuideManager(upgradeService);
    });

    // Graceful Degradation Service
    this.registerService('gracefulDegradation', async () => {
      const monitor = await this.getService<PerformanceMonitor>('performanceMonitor');
      return new GracefulDegradationService(monitor);
    });
  }

  /**
   * Get typed service instances
   */
  public async getCache(): Promise<CacheManager> {
    return this.getService<CacheManager>('cache');
  }

  public async getThreadsAPI(): Promise<ThreadsAPIService> {
    return this.getService<ThreadsAPIService>('threadsApi');
  }

  public async getPerformanceMonitor(): Promise<PerformanceMonitor> {
    return this.getService<PerformanceMonitor>('performanceMonitor');
  }

  public async getPerformanceOptimizer(): Promise<PerformanceOptimizer> {
    return this.getService<PerformanceOptimizer>('performanceOptimizer');
  }

  public async getCredentialsManager(): Promise<CredentialsManager> {
    return this.getService<CredentialsManager>('credentials');
  }

  public async getOAuth2Service(): Promise<OAuth2AuthenticationService> {
    return this.getService<OAuth2AuthenticationService>('oauth2');
  }

  public async getUpgradeNotificationService(): Promise<UpgradeNotificationService> {
    return this.getService<UpgradeNotificationService>('upgradeNotification');
  }

  public async getMigrationGuideManager(): Promise<MigrationGuideManager> {
    return this.getService<MigrationGuideManager>('migrationGuide');
  }

  public async getGracefulDegradationService(): Promise<GracefulDegradationService> {
    return this.getService<GracefulDegradationService>('gracefulDegradation');
  }
}