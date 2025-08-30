/**
 * Error Handling Service for ThreadForge
 * Provides comprehensive error handling, classification, and user-friendly messaging
 * Requirements: 5.1 (error handling), 5.2 (user messages), 5.5 (error classification)
 */

import { 
  ErrorType, 
  ErrorContext, 
  UserMessage, 
  UserMessageAction, 
  RetryConfig, 
  FallbackOption 
} from './types';

export interface APIError extends Error {
  status?: number;
  response?: any;
  headers?: Record<string, string>;
}

export interface NetworkError extends Error {
  code?: string;
}

export interface ErrorStatistics {
  totalErrors: number;
  errorsByType: Record<ErrorType, number>;
  recoverableErrors: number;
  nonRecoverableErrors: number;
  averageRecoveryTime: number;
}

export interface CachedErrorState {
  lastError: string;
  errorCount: number;
  firstErrorAt: number;
  lastErrorAt: number;
}

export interface RecoveryAction {
  type: 'retry' | 'wait_and_retry' | 'fallback_to_dom' | 'use_cache' | 'manual_intervention';
  delay?: number;
  description: string;
}

export class ErrorHandlingService {
  private errorStats: Map<ErrorType, number> = new Map();
  private rateLimitHistory: number[] = [];
  private errorCache: Map<string, CachedErrorState> = new Map();

  constructor() {
    this.initializeErrorTracking();
  }

  private initializeErrorTracking(): void {
    // Initialize error statistics
    Object.values(ErrorType).forEach(type => {
      this.errorStats.set(type, 0);
    });
  }

  async handleAPIError(error: APIError): Promise<ErrorContext> {
    const status = error.status || 0;
    const response = error.response;
    
    let errorType: ErrorType;
    let recoverable = true;
    let retryAfter: number | undefined;

    // Classify API error based on status code and response
    if (status === 401 || (response?.error?.code === 'UNAUTHENTICATED')) {
      errorType = ErrorType.AUTHENTICATION_FAILED;
      recoverable = true;
    } else if (status === 403 || (response?.error?.code === 'PERMISSION_DENIED')) {
      errorType = ErrorType.PERMISSION_DENIED;
      recoverable = false;
    } else if (status === 429) {
      errorType = ErrorType.RATE_LIMIT_EXCEEDED;
      recoverable = true;
      retryAfter = this.extractRetryAfter(error.headers);
    } else if (status >= 500) {
      errorType = ErrorType.API_REQUEST_FAILED;
      recoverable = true;
    } else if (error.message.includes('JSON') || error.message.includes('parse')) {
      errorType = ErrorType.PARSING_ERROR;
      recoverable = true;
    } else {
      errorType = ErrorType.API_REQUEST_FAILED;
      recoverable = true;
    }

    const context: ErrorContext = {
      type: errorType,
      message: this.generateErrorMessage(errorType, error),
      recoverable,
      retryAfter,
      fallbackAvailable: await this.isFallbackAvailable(errorType),
      debugInfo: {
        status,
        originalMessage: error.message,
        response: response,
        headers: error.headers
      },
      timestamp: new Date()
    };

    await this.logError(error, context);
    this.updateErrorStats(errorType);

    return context;
  }

  async handleNetworkError(error: NetworkError): Promise<ErrorContext> {
    const code = error.code || '';
    let recoverable = true;
    let retryAfter: number | undefined;

    // Classify network error by error code
    if (code === 'CERT_INVALID' || code === 'CERT_UNTRUSTED') {
      recoverable = false;
    } else if (code === 'TIMEOUT' || code === 'ETIMEDOUT') {
      retryAfter = 5000; // 5 seconds for timeout
    } else if (code === 'ENOTFOUND') {
      retryAfter = 10000; // 10 seconds for DNS issues
    } else {
      retryAfter = 3000; // 3 seconds for general network issues
    }

    const context: ErrorContext = {
      type: ErrorType.NETWORK_UNAVAILABLE,
      message: this.generateNetworkErrorMessage(code, error.message),
      recoverable,
      retryAfter,
      fallbackAvailable: await this.isFallbackAvailable(ErrorType.NETWORK_UNAVAILABLE),
      debugInfo: {
        code,
        originalMessage: error.message,
        userAgent: navigator.userAgent
      },
      timestamp: new Date()
    };

    await this.logError(error, context);
    this.updateErrorStats(ErrorType.NETWORK_UNAVAILABLE);

    return context;
  }

  async handleRateLimit(error: APIError): Promise<ErrorContext> {
    const retryAfter = this.extractRetryAfter(error.headers) || this.calculateBackoffDelay();
    
    // Track rate limit occurrences for progressive backoff
    this.rateLimitHistory.push(Date.now());
    
    const context: ErrorContext = {
      type: ErrorType.RATE_LIMIT_EXCEEDED,
      message: `Rate limit exceeded. Please wait ${Math.ceil(retryAfter / 1000)} seconds before retrying.`,
      recoverable: true,
      retryAfter,
      fallbackAvailable: await this.isFallbackAvailable(ErrorType.RATE_LIMIT_EXCEEDED),
      debugInfo: {
        retryAfter,
        rateLimitHistory: this.rateLimitHistory.slice(-5), // Last 5 occurrences
        backoffCalculated: !error.headers?.['retry-after']
      },
      timestamp: new Date()
    };

    await this.logError(error, context);
    this.updateErrorStats(ErrorType.RATE_LIMIT_EXCEEDED);

    return context;
  }

  private extractRetryAfter(headers?: Record<string, string>): number | undefined {
    if (!headers) return undefined;
    
    const retryAfter = headers['retry-after'] || headers['x-ratelimit-reset'];
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      return isNaN(seconds) ? undefined : seconds * 1000; // Convert to milliseconds
    }
    
    return undefined;
  }

  private calculateBackoffDelay(): number {
    const recentLimits = this.rateLimitHistory.filter(
      timestamp => Date.now() - timestamp < 3600000 // Last hour
    );
    
    // Progressive backoff: 5min, 15min, 30min, 1hr
    const baseDelay = 5 * 60 * 1000; // 5 minutes
    const multiplier = Math.min(recentLimits.length, 4);
    
    return baseDelay * Math.pow(2, multiplier - 1);
  }

  private generateErrorMessage(errorType: ErrorType, error: Error): string {
    switch (errorType) {
      case ErrorType.AUTHENTICATION_FAILED:
        return 'Authentication failed. Please check your Threads account connection.';
      case ErrorType.PERMISSION_DENIED:
        return 'Permission denied. This content may be private or your account lacks access.';
      case ErrorType.RATE_LIMIT_EXCEEDED:
        return 'Rate limit exceeded. Too many requests have been made recently.';
      case ErrorType.PARSING_ERROR:
        return 'Failed to parse response from Threads API. The data format may have changed.';
      case ErrorType.API_REQUEST_FAILED:
        return 'Threads API request failed. The service may be temporarily unavailable.';
      default:
        return `An error occurred: ${error.message}`;
    }
  }

  private generateNetworkErrorMessage(code: string, originalMessage: string): string {
    switch (code) {
      case 'ENOTFOUND':
        return 'DNS resolution failed. Please check your internet connection.';
      case 'TIMEOUT':
      case 'ETIMEDOUT':
        return 'Request timeout. The server took too long to respond.';
      case 'CERT_INVALID':
      case 'CERT_UNTRUSTED':
        return 'SSL certificate verification failed. This may be a security issue.';
      case 'NETWORK_ERROR':
        return 'Network connectivity lost. Please check your internet connection.';
      default:
        return `Network error: ${originalMessage}`;
    }
  }

  async generateUserMessage(errorContext: ErrorContext): Promise<UserMessage> {
    const actions: UserMessageAction[] = [];
    
    // Add appropriate actions based on error type and recoverability
    if (errorContext.recoverable) {
      if (errorContext.retryAfter) {
        actions.push({
          label: 'Retry',
          action: 'retry'
        });
      } else {
        actions.push({
          label: 'Try Again',
          action: 'retry'
        });
      }
    }

    if (errorContext.fallbackAvailable) {
      actions.push({
        label: 'Use Fallback',
        action: 'fallback'
      });
    }

    if (errorContext.type === ErrorType.AUTHENTICATION_FAILED) {
      actions.push({
        label: 'Open Settings',
        action: 'settings'
      });
    }

    actions.push({
      label: 'Dismiss',
      action: 'dismiss'
    });

    return {
      title: this.generateUserTitle(errorContext.type),
      body: this.generateUserBody(errorContext),
      severity: this.getErrorSeverity(errorContext),
      actions,
      dismissible: true
    };
  }

  private generateUserTitle(errorType: ErrorType): string {
    switch (errorType) {
      case ErrorType.AUTHENTICATION_FAILED:
        return 'Authentication Required';
      case ErrorType.RATE_LIMIT_EXCEEDED:
        return 'Rate Limit Reached';
      case ErrorType.NETWORK_UNAVAILABLE:
        return 'Network Issue';
      case ErrorType.PERMISSION_DENIED:
        return 'Access Denied';
      case ErrorType.API_REQUEST_FAILED:
        return 'Service Unavailable';
      default:
        return 'Error Occurred';
    }
  }

  private generateUserBody(errorContext: ErrorContext): string {
    let body = errorContext.message;
    
    if (errorContext.retryAfter) {
      const minutes = Math.ceil(errorContext.retryAfter / 60000);
      body += ` Please wait ${minutes} minutes before trying again.`;
    }

    if (errorContext.fallbackAvailable) {
      body += ' You can use the fallback mode to continue browsing.';
    }

    return body;
  }

  private getErrorSeverity(errorContext: ErrorContext): 'info' | 'warning' | 'error' {
    if (!errorContext.recoverable) {
      return 'error';
    }
    
    if (errorContext.type === ErrorType.RATE_LIMIT_EXCEEDED) {
      return 'warning';
    }

    if (errorContext.type === ErrorType.NETWORK_UNAVAILABLE) {
      return 'error';
    }

    return 'warning';
  }

  async isRecoverable(error: Error): Promise<boolean> {
    // Simple heuristics for error recoverability
    const message = error.message.toLowerCase();
    
    // Non-recoverable errors
    if (message.includes('permission denied') || 
        message.includes('access denied') ||
        message.includes('certificate')) {
      return false;
    }

    // Recoverable errors
    if (message.includes('timeout') ||
        message.includes('network') ||
        message.includes('token') ||
        message.includes('parse') ||
        message.includes('json')) {
      return true;
    }

    // Default to recoverable for unknown errors
    return true;
  }

  async isFallbackAvailable(errorType: ErrorType): Promise<boolean> {
    switch (errorType) {
      case ErrorType.API_REQUEST_FAILED:
      case ErrorType.RATE_LIMIT_EXCEEDED:
      case ErrorType.NETWORK_UNAVAILABLE:
      case ErrorType.AUTHENTICATION_FAILED:
      case ErrorType.PARSING_ERROR:
        return true;
      case ErrorType.PERMISSION_DENIED:
        return false; // If access is denied, fallback won't help
      default:
        return false;
    }
  }

  async getRetryConfig(errorType: ErrorType): Promise<RetryConfig> {
    switch (errorType) {
      case ErrorType.RATE_LIMIT_EXCEEDED:
        return {
          maxAttempts: 3,
          backoffMultiplier: 2,
          initialDelay: 300000, // 5 minutes
          maxDelay: 3600000 // 1 hour
        };
      case ErrorType.NETWORK_UNAVAILABLE:
        return {
          maxAttempts: 5,
          backoffMultiplier: 1.5,
          initialDelay: 3000, // 3 seconds
          maxDelay: 30000 // 30 seconds
        };
      case ErrorType.API_REQUEST_FAILED:
        return {
          maxAttempts: 3,
          backoffMultiplier: 2,
          initialDelay: 1000, // 1 second
          maxDelay: 10000 // 10 seconds
        };
      case ErrorType.AUTHENTICATION_FAILED:
        return {
          maxAttempts: 2,
          backoffMultiplier: 1,
          initialDelay: 5000, // 5 seconds
          maxDelay: 5000
        };
      default:
        return {
          maxAttempts: 2,
          backoffMultiplier: 1.5,
          initialDelay: 2000,
          maxDelay: 10000
        };
    }
  }

  async logError(error: Error, context: ErrorContext): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: context.type,
      message: context.message,
      recoverable: context.recoverable,
      debugInfo: context.debugInfo,
      stack: error.stack
    };

    // Log to console with appropriate level
    if (context.recoverable) {
      console.warn(`[ThreadForge] ${context.type}:`, logEntry);
    } else {
      console.error(`[ThreadForge] ${context.type}:`, logEntry);
    }

    // Store in error cache for analytics
    this.cacheErrorState(context.type.toString(), error.message);
  }

  private cacheErrorState(key: string, errorMessage: string): void {
    const existing = this.errorCache.get(key);
    const now = Date.now();

    if (existing) {
      existing.lastError = errorMessage;
      existing.errorCount++;
      existing.lastErrorAt = now;
    } else {
      this.errorCache.set(key, {
        lastError: errorMessage,
        errorCount: 1,
        firstErrorAt: now,
        lastErrorAt: now
      });
    }
  }

  private updateErrorStats(errorType: ErrorType): void {
    const current = this.errorStats.get(errorType) || 0;
    this.errorStats.set(errorType, current + 1);
  }

  async getErrorStatistics(): Promise<ErrorStatistics> {
    const errorsByType: Record<ErrorType, number> = {} as Record<ErrorType, number>;
    let totalErrors = 0;
    let recoverableErrors = 0;

    for (const [type, count] of this.errorStats.entries()) {
      errorsByType[type] = count;
      totalErrors += count;
      
      // Count recoverable errors (most error types are recoverable except permission denied)
      if (type !== ErrorType.PERMISSION_DENIED) {
        recoverableErrors += count;
      }
    }

    return {
      totalErrors,
      errorsByType,
      recoverableErrors,
      nonRecoverableErrors: totalErrors - recoverableErrors,
      averageRecoveryTime: 0 // Would need to track actual recovery times
    };
  }

  async getCachedErrorState(key: string): Promise<CachedErrorState | undefined> {
    return this.errorCache.get(key);
  }

  async notifyCriticalError(error: Error): Promise<boolean> {
    try {
      if (chrome?.notifications) {
        await chrome.notifications.create(`critical-${Date.now()}`, {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'ThreadForge Critical Error',
          message: `Critical error occurred: ${error.message}`
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to send critical error notification:', err);
      return false;
    }
  }

  async getRecoveryActions(errorContext: ErrorContext): Promise<RecoveryAction[]> {
    const actions: RecoveryAction[] = [];

    if (errorContext.recoverable) {
      if (errorContext.retryAfter) {
        actions.push({
          type: 'wait_and_retry',
          delay: errorContext.retryAfter,
          description: `Wait ${Math.ceil(errorContext.retryAfter / 1000)} seconds and retry`
        });
      } else {
        actions.push({
          type: 'retry',
          description: 'Retry the operation immediately'
        });
      }
    }

    if (errorContext.fallbackAvailable) {
      actions.push({
        type: 'fallback_to_dom',
        description: 'Switch to DOM scraping mode'
      });
      
      actions.push({
        type: 'use_cache',
        description: 'Use cached data if available'
      });
    }

    if (!errorContext.recoverable || errorContext.type === ErrorType.AUTHENTICATION_FAILED) {
      actions.push({
        type: 'manual_intervention',
        description: 'Manual configuration required'
      });
    }

    return actions;
  }

  async getFallbackOptions(errorType: ErrorType): Promise<FallbackOption[]> {
    const options: FallbackOption[] = [];

    if (await this.isFallbackAvailable(errorType)) {
      options.push({
        type: 'dom_scraping',
        available: true,
        description: 'Extract thread data from webpage DOM'
      });

      options.push({
        type: 'cached_data',
        available: true,
        description: 'Use previously cached thread data'
      });

      if (errorType === ErrorType.NETWORK_UNAVAILABLE) {
        options.push({
          type: 'offline_mode',
          available: true,
          description: 'Browse cached threads offline'
        });
      }
    }

    return options;
  }

  async enhanceErrorContext(error: Error, additionalInfo: any): Promise<ErrorContext> {
    const context: ErrorContext = {
      type: ErrorType.API_REQUEST_FAILED, // Default, will be refined
      message: error.message,
      recoverable: await this.isRecoverable(error),
      fallbackAvailable: await this.isFallbackAvailable(ErrorType.API_REQUEST_FAILED),
      debugInfo: {
        ...additionalInfo,
        timestamp: Date.now(),
        errorStack: error.stack
      },
      timestamp: new Date()
    };

    // Enhance with specific error type detection
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return await this.handleNetworkError(error as NetworkError);
    } else if ((error as APIError).status) {
      return await this.handleAPIError(error as APIError);
    }

    return context;
  }

  async addBrowserContext(error: Error): Promise<ErrorContext> {
    const context: ErrorContext = {
      type: ErrorType.API_REQUEST_FAILED,
      message: error.message,
      recoverable: await this.isRecoverable(error),
      fallbackAvailable: await this.isFallbackAvailable(ErrorType.API_REQUEST_FAILED),
      debugInfo: {
        userAgent: navigator.userAgent,
        extensionVersion: chrome?.runtime?.getManifest?.()?.version || 'unknown',
        timestamp: Date.now(),
        url: window.location?.href,
        errorStack: error.stack
      },
      timestamp: new Date()
    };

    return context;
  }

  async showErrorNotification(errorContext: ErrorContext, options: { silent?: boolean } = {}): Promise<void> {
    if (options.silent || !chrome?.notifications) {
      return;
    }

    // Only show notifications for significant errors
    if (errorContext.type === ErrorType.PARSING_ERROR && errorContext.recoverable) {
      return; // Skip minor parsing errors
    }

    const notificationId = `error-${Date.now()}`;
    
    try {
      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: this.getErrorIcon(errorContext.type),
        title: this.generateUserTitle(errorContext.type),
        message: errorContext.message
      });
    } catch (err) {
      console.warn('Failed to show error notification:', err);
    }
  }

  private getErrorIcon(errorType: ErrorType): string {
    switch (errorType) {
      case ErrorType.AUTHENTICATION_FAILED:
        return 'icons/auth-error.png';
      case ErrorType.NETWORK_UNAVAILABLE:
        return 'icons/network-error.png';
      case ErrorType.RATE_LIMIT_EXCEEDED:
        return 'icons/rate-limit.png';
      default:
        return 'icons/icon48.png';
    }
  }

  private generateUserTitle(errorType: ErrorType): string {
    switch (errorType) {
      case ErrorType.AUTHENTICATION_FAILED:
        return 'Authentication Required';
      case ErrorType.RATE_LIMIT_EXCEEDED:
        return 'Rate Limit Reached';
      case ErrorType.NETWORK_UNAVAILABLE:
        return 'Network Issue';
      case ErrorType.PERMISSION_DENIED:
        return 'Access Denied';
      case ErrorType.API_REQUEST_FAILED:
        return 'Service Unavailable';
      default:
        return 'Error Occurred';
    }
  }

  destroy(): void {
    this.errorStats.clear();
    this.rateLimitHistory = [];
    this.errorCache.clear();
  }
}