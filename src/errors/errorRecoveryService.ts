/**
 * Error Recovery Service - Task 14
 * Implements exponential backoff retry logic, DOM scraping fallback,
 * offline mode detection, and user notifications for recoverable errors
 */

import { ErrorType, ErrorContext, RetryConfig, FallbackOption } from './types';

export interface RecoveryStrategy {
  type: 'retry' | 'fallback_to_dom' | 'cached_data' | 'wait_and_retry' | 'retry_with_fallback' | 'offline_mode' | 'reauthenticate';
  successProbability: number;
  estimatedTime: number;
  description: string;
}

export interface RecoveryResult {
  success: boolean;
  data?: any;
  error?: string;
  strategyUsed: string;
  attempts: number;
  totalTime: number;
}

export interface RecoveryProgress {
  stage: 'retrying' | 'fallback' | 'offline' | 'failed';
  attempt: number;
  maxAttempts: number;
  nextRetryIn?: number;
  strategy?: string;
}

export interface RecoveryStatistics {
  strategies: {
    [key: string]: {
      attempts: number;
      successes: number;
      successRate: number;
      averageRecoveryTime: number;
    };
  };
  totalRecoveries: number;
  overallSuccessRate: number;
}

export interface NotificationCallbacks {
  retry?: () => void;
  fallback?: () => void;
  cached?: () => void;
}

export class ErrorRecoveryService {
  private recoveryStats: Map<string, { attempts: number; successes: number; totalTime: number }> = new Map();
  private activeRecoveries = new Map<string, RecoveryProgress>();

  constructor(
    private domScraper?: any,
    private cacheService?: any
  ) {
    this.initializeRecoveryTracking();
  }

  /**
   * Exponential Backoff Retry Logic
   */
  async getRetryStrategy(errorContext: ErrorContext): Promise<RetryConfig> {
    const baseConfig: RetryConfig = {
      maxAttempts: 3,
      backoffMultiplier: 2,
      initialDelay: 1000,
      maxDelay: 30000
    };

    // Adjust retry strategy based on error type
    switch (errorContext.type) {
      case ErrorType.RATE_LIMIT_EXCEEDED:
        return {
          ...baseConfig,
          maxAttempts: 5,
          initialDelay: errorContext.retryAfter || 60000,
          backoffMultiplier: 1.5
        };
      case ErrorType.NETWORK_UNAVAILABLE:
        return {
          ...baseConfig,
          maxAttempts: 4,
          initialDelay: 2000,
          backoffMultiplier: 1.8
        };
      case ErrorType.AUTHENTICATION_FAILED:
        return {
          ...baseConfig,
          maxAttempts: 2,
          initialDelay: 5000
        };
      default:
        return baseConfig;
    }
  }

  async calculateBackoffDelay(
    attempt: number, 
    initialDelay: number, 
    multiplier: number, 
    maxDelay: number = 30000,
    addJitter: boolean = false
  ): Promise<number> {
    let delay = initialDelay * Math.pow(multiplier, attempt - 1);
    delay = Math.min(delay, maxDelay);

    if (addJitter) {
      // Add ±20% jitter to prevent thundering herd
      const jitter = delay * 0.2;
      delay = delay + (Math.random() * jitter * 2 - jitter);
    }

    return Math.round(delay);
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === config.maxAttempts) {
          break;
        }

        const delay = await this.calculateBackoffDelay(
          attempt, 
          config.initialDelay, 
          config.backoffMultiplier, 
          config.maxDelay,
          true
        );

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Fallback to DOM Scraping
   */
  async shouldFallbackToDOMScraping(errorContext: ErrorContext): Promise<boolean> {
    // Don't fallback for authentication or permission errors
    if (errorContext.type === ErrorType.AUTHENTICATION_FAILED || 
        errorContext.type === ErrorType.PERMISSION_DENIED) {
      return false;
    }

    return errorContext.fallbackAvailable && this.domScraper?.isAvailable();
  }

  async fallbackToDOMScraping(operation: string, ...args: any[]): Promise<any> {
    if (!this.domScraper?.isAvailable()) {
      return null;
    }

    try {
      let result = null;
      
      switch (operation) {
        case 'getThread':
          result = await this.domScraper.scrapeThread(args[0]);
          break;
        case 'getThreadReplies':
          result = await this.domScraper.scrapeThreadReplies(args[0]);
          break;
        default:
          console.warn(`Unsupported DOM scraping operation: ${operation}`);
          return null;
      }

      // Cache the scraped data
      if (result && this.cacheService) {
        const cacheKey = `fallback_${operation.replace('get', '').toLowerCase()}_${args[0]}`;
        await this.cacheService.set(cacheKey, result, 300000); // 5 minutes TTL
      }

      return result;
    } catch (error) {
      console.error('DOM scraping fallback failed:', error);
      return null;
    }
  }

  /**
   * Offline Mode Detection and Cached Data Display
   */
  async isOfflineMode(): Promise<boolean> {
    return !navigator.onLine;
  }

  async getCachedDataForOffline(dataType: string, identifier: string): Promise<any> {
    if (!await this.isOfflineMode()) {
      return null;
    }

    const cacheKey = `${dataType}_${identifier}`;
    const hasCached = await this.cacheService?.has(cacheKey);
    
    if (!hasCached) {
      return null;
    }

    const cachedData = await this.cacheService.get(cacheKey);
    
    // Add offline indicators
    return {
      ...cachedData,
      _isOfflineData: true,
      _lastUpdated: new Date()
    };
  }

  async setupOfflineListeners(
    onOnline: (event: Event) => void,
    onOffline: (event: Event) => void
  ): Promise<void> {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }

  /**
   * User Notification System for Recoverable Errors
   */
  async notifyUserOfRecoverableError(
    errorContext: ErrorContext, 
    options: { silent?: boolean } = {}
  ): Promise<string | null> {
    if (options.silent) {
      return null;
    }

    const notificationId = `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    let notification: chrome.notifications.NotificationOptions;

    if (await this.isOfflineMode() && errorContext.type === ErrorType.NETWORK_UNAVAILABLE) {
      notification = {
        type: 'basic',
        iconUrl: 'icons/offline-48.png',
        title: 'Working Offline',
        message: 'No internet connection. Showing cached data where available.',
        buttons: [
          { title: 'View Cached Data' }
        ]
      };
    } else if (errorContext.recoverable) {
      const retryText = errorContext.retryAfter 
        ? `Will retry in ${Math.round(errorContext.retryAfter / 1000)} seconds`
        : 'Retrying automatically';

      notification = {
        type: 'basic',
        iconUrl: 'icons/warning-48.png',
        title: 'Temporary Issue Detected',
        message: `${errorContext.message}. ${retryText}.`,
        buttons: [
          { title: 'Try Again' },
          ...(errorContext.fallbackAvailable ? [{ title: 'Use Fallback' }] : [])
        ]
      };
    } else {
      notification = {
        type: 'basic',
        iconUrl: 'icons/error-48.png',
        title: 'Service Issue',
        message: errorContext.message,
        buttons: [
          { title: 'Dismiss' }
        ]
      };
    }

    chrome.notifications.create(notificationId, notification);
    return notificationId;
  }

  async handleNotificationClick(
    notificationId: string,
    buttonIndex: number,
    callbacks: NotificationCallbacks
  ): Promise<void> {
    switch (buttonIndex) {
      case 0: // Usually "Try Again" or primary action
        if (callbacks.retry) {
          callbacks.retry();
        }
        break;
      case 1: // Usually "Use Fallback" or secondary action
        if (callbacks.fallback) {
          callbacks.fallback();
        }
        break;
      case 2: // Usually "View Cached Data" or tertiary action
        if (callbacks.cached) {
          callbacks.cached();
        }
        break;
    }

    chrome.notifications.clear(notificationId);
  }

  async updateRecoveryProgress(
    notificationId: string,
    progress: RecoveryProgress
  ): Promise<void> {
    let message = '';
    let progressValue = 0;

    switch (progress.stage) {
      case 'retrying':
        message = `Attempt ${progress.attempt} of ${progress.maxAttempts}`;
        if (progress.nextRetryIn) {
          message += `. Next retry in ${Math.round(progress.nextRetryIn / 1000)}s`;
        }
        progressValue = Math.round((progress.attempt / progress.maxAttempts) * 100);
        break;
      case 'fallback':
        message = 'Trying alternative method...';
        progressValue = 75;
        break;
      case 'offline':
        message = 'Loading cached data...';
        progressValue = 90;
        break;
      case 'failed':
        message = 'All recovery attempts failed';
        progressValue = 100;
        break;
    }

    const notification: chrome.notifications.NotificationOptions = {
      type: 'progress',
      iconUrl: 'icons/recovery-48.png',
      title: 'Attempting Recovery...',
      message,
      progress: progressValue
    };

    chrome.notifications.create(notificationId, notification);
  }

  /**
   * Recovery Strategy Selection
   */
  async selectRecoveryStrategy(
    errorContext: ErrorContext,
    options: { useHistoricalData?: boolean } = {}
  ): Promise<RecoveryStrategy> {
    const strategies = await this.getAllRecoveryStrategies(errorContext);
    
    if (options.useHistoricalData) {
      // Adjust success probabilities based on historical data
      const stats = await this.getRecoveryStatistics();
      strategies.forEach(strategy => {
        const historicalData = stats.strategies[strategy.type];
        if (historicalData && historicalData.attempts > 0) {
          strategy.successProbability = historicalData.successRate;
        }
      });
    }

    // Return the strategy with highest success probability
    return strategies.sort((a, b) => b.successProbability - a.successProbability)[0];
  }

  async getAllRecoveryStrategies(errorContext: ErrorContext): Promise<RecoveryStrategy[]> {
    const strategies: RecoveryStrategy[] = [];

    switch (errorContext.type) {
      case ErrorType.RATE_LIMIT_EXCEEDED:
        strategies.push({
          type: 'wait_and_retry',
          successProbability: 0.9,
          estimatedTime: errorContext.retryAfter || 300000,
          description: 'Wait for rate limit reset and retry'
        });
        break;

      case ErrorType.API_REQUEST_FAILED:
        strategies.push({
          type: 'retry',
          successProbability: 0.7,
          estimatedTime: 5000,
          description: 'Retry API request with exponential backoff'
        });
        
        if (errorContext.fallbackAvailable) {
          strategies.push({
            type: 'fallback_to_dom',
            successProbability: 0.6,
            estimatedTime: 8000,
            description: 'Use DOM scraping as fallback'
          });
        }
        
        strategies.push({
          type: 'cached_data',
          successProbability: 0.4,
          estimatedTime: 1000,
          description: 'Use cached data if available'
        });
        break;

      case ErrorType.NETWORK_UNAVAILABLE:
        strategies.push({
          type: 'offline_mode',
          successProbability: 0.8,
          estimatedTime: 2000,
          description: 'Switch to offline mode with cached data'
        });
        break;

      case ErrorType.AUTHENTICATION_FAILED:
        strategies.push({
          type: 'reauthenticate',
          successProbability: 0.5,
          estimatedTime: 10000,
          description: 'Attempt to reauthenticate user'
        });
        break;
    }

    return strategies.sort((a, b) => b.successProbability - a.successProbability);
  }

  /**
   * Recovery Execution and Coordination
   */
  async executeRecoveryFlow(
    errorContext: ErrorContext,
    originalOperation: () => Promise<any>,
    ...operationArgs: any[]
  ): Promise<RecoveryResult> {
    const startTime = Date.now();
    let attempts = 0;
    let lastError: Error | null = null;

    const strategies = await this.getAllRecoveryStrategies(errorContext);

    for (const strategy of strategies) {
      attempts++;
      
      try {
        let result = null;

        switch (strategy.type) {
          case 'retry':
          case 'wait_and_retry':
            const retryConfig = await this.getRetryStrategy(errorContext);
            result = await this.executeWithRetry(originalOperation, retryConfig);
            break;

          case 'fallback_to_dom':
            if (operationArgs.length > 0) {
              result = await this.fallbackToDOMScraping('getThread', ...operationArgs);
            }
            break;

          case 'cached_data':
            if (operationArgs.length > 0) {
              result = await this.getCachedDataForOffline('thread', operationArgs[0]);
            }
            break;

          case 'offline_mode':
            if (operationArgs.length > 0) {
              result = await this.getCachedDataForOffline('thread', operationArgs[0]);
            }
            break;

          default:
            continue;
        }

        if (result !== null) {
          const totalTime = Date.now() - startTime;
          await this.recordRecoveryAttempt(strategy.type, true, totalTime);
          
          return {
            success: true,
            data: result,
            strategyUsed: strategy.type,
            attempts,
            totalTime
          };
        }

      } catch (error) {
        lastError = error as Error;
        await this.recordRecoveryAttempt(strategy.type, false, Date.now() - startTime);
      }
    }

    return {
      success: false,
      error: `All recovery strategies failed. Last error: ${lastError?.message || 'Unknown error'}`,
      strategyUsed: 'none',
      attempts,
      totalTime: Date.now() - startTime
    };
  }

  /**
   * Recovery Statistics and Learning
   */
  async recordRecoveryAttempt(
    strategyType: string,
    success: boolean,
    recoveryTime: number
  ): Promise<void> {
    const existing = this.recoveryStats.get(strategyType) || {
      attempts: 0,
      successes: 0,
      totalTime: 0
    };

    existing.attempts++;
    if (success) {
      existing.successes++;
    }
    existing.totalTime += recoveryTime;

    this.recoveryStats.set(strategyType, existing);
  }

  async getRecoveryStatistics(): Promise<RecoveryStatistics> {
    const strategies: { [key: string]: any } = {};
    let totalAttempts = 0;
    let totalSuccesses = 0;

    for (const [strategyType, stats] of this.recoveryStats) {
      strategies[strategyType] = {
        attempts: stats.attempts,
        successes: stats.successes,
        successRate: stats.attempts > 0 ? stats.successes / stats.attempts : 0,
        averageRecoveryTime: stats.attempts > 0 ? stats.totalTime / stats.attempts : 0
      };

      totalAttempts += stats.attempts;
      totalSuccesses += stats.successes;
    }

    return {
      strategies,
      totalRecoveries: totalAttempts,
      overallSuccessRate: totalAttempts > 0 ? totalSuccesses / totalAttempts : 0
    };
  }

  /**
   * Utility Methods
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private initializeRecoveryTracking(): void {
    // Initialize recovery statistics from storage if available
    if (this.cacheService && this.cacheService.get) {
      this.cacheService.get('recovery_statistics').then((stats: any) => {
        if (stats) {
          this.recoveryStats = new Map(Object.entries(stats));
        }
      }).catch(() => {
        // Ignore initialization errors
      });
    }
  }

  private async saveRecoveryStatistics(): Promise<void> {
    if (this.cacheService) {
      const statsObject = Object.fromEntries(this.recoveryStats);
      await this.cacheService.set('recovery_statistics', statsObject, 86400000); // 24 hours
    }
  }

  destroy(): void {
    this.saveRecoveryStatistics();
    this.recoveryStats.clear();
    this.activeRecoveries.clear();
  }
}