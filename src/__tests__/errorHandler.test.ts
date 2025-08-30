/**
 * Unit tests for Error Handling Service - Task 13
 * Tests API error conversion, network error handling, and rate limit messaging
 */

import { ErrorHandlingService } from '../errors/errorHandler';
import { ErrorType, ErrorContext, UserMessage, RetryConfig, FallbackOption } from '../errors/types';

// Mock Chrome runtime for notifications
const mockChrome = {
  notifications: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  runtime: {
    lastError: null
  }
};

(global as any).chrome = mockChrome;

describe('ErrorHandlingService', () => {
  let errorHandler: ErrorHandlingService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;
    errorHandler = new ErrorHandlingService();
  });

  afterEach(() => {
    errorHandler?.destroy();
  });

  describe('API Error Handling', () => {
    test('should handle Threads API authentication errors', async () => {
      const apiError = new Error('Invalid access token');
      (apiError as any).status = 401;
      (apiError as any).response = { error: { code: 'UNAUTHENTICATED' } };

      const result = await errorHandler.handleAPIError(apiError);

      expect(result.type).toBe(ErrorType.AUTHENTICATION_FAILED);
      expect(result.recoverable).toBe(true);
      expect(result.fallbackAvailable).toBe(true);
      expect(result.message.toLowerCase()).toContain('authentication');
    });

    test('should handle Threads API rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;
      (rateLimitError as any).headers = {
        'x-ratelimit-reset': '3600',
        'retry-after': '3600'
      };

      const result = await errorHandler.handleAPIError(rateLimitError);

      expect(result.type).toBe(ErrorType.RATE_LIMIT_EXCEEDED);
      expect(result.retryAfter).toBe(3600000); // Should be in milliseconds
      expect(result.recoverable).toBe(true);
      expect(result.fallbackAvailable).toBe(true);
    });

    test('should handle Threads API permission errors', async () => {
      const permissionError = new Error('Insufficient permissions');
      (permissionError as any).status = 403;
      (permissionError as any).response = { error: { code: 'PERMISSION_DENIED' } };

      const result = await errorHandler.handleAPIError(permissionError);

      expect(result.type).toBe(ErrorType.PERMISSION_DENIED);
      expect(result.recoverable).toBe(false);
      expect(result.fallbackAvailable).toBe(false);
    });

    test('should handle generic API errors', async () => {
      const genericError = new Error('Internal server error');
      (genericError as any).status = 500;

      const result = await errorHandler.handleAPIError(genericError);

      expect(result.type).toBe(ErrorType.API_REQUEST_FAILED);
      expect(result.recoverable).toBe(true);
      expect(result.fallbackAvailable).toBe(true);
    });

    test('should handle malformed API responses', async () => {
      const parseError = new Error('Unexpected token in JSON');
      (parseError as any).status = 200;
      (parseError as any).response = 'invalid json response';

      const result = await errorHandler.handleAPIError(parseError);

      expect(result.type).toBe(ErrorType.PARSING_ERROR);
      expect(result.recoverable).toBe(true);
      expect(result.fallbackAvailable).toBe(true);
    });
  });

  describe('Network Error Handling', () => {
    test('should handle network connectivity errors', async () => {
      const networkError = new Error('Failed to fetch');
      (networkError as any).code = 'NETWORK_ERROR';

      const result = await errorHandler.handleNetworkError(networkError);

      expect(result.type).toBe(ErrorType.NETWORK_UNAVAILABLE);
      expect(result.recoverable).toBe(true);
      expect(result.fallbackAvailable).toBe(true);
      expect(result.message.toLowerCase()).toContain('network');
    });

    test('should handle DNS resolution errors', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND');
      (dnsError as any).code = 'ENOTFOUND';

      const result = await errorHandler.handleNetworkError(dnsError);

      expect(result.type).toBe(ErrorType.NETWORK_UNAVAILABLE);
      expect(result.message).toContain('DNS');
      expect(result.fallbackAvailable).toBe(true);
    });

    test('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'TIMEOUT';

      const result = await errorHandler.handleNetworkError(timeoutError);

      expect(result.type).toBe(ErrorType.NETWORK_UNAVAILABLE);
      expect(result.message).toContain('timeout');
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    test('should handle SSL/TLS certificate errors', async () => {
      const certError = new Error('Certificate verification failed');
      (certError as any).code = 'CERT_INVALID';

      const result = await errorHandler.handleNetworkError(certError);

      expect(result.type).toBe(ErrorType.NETWORK_UNAVAILABLE);
      expect(result.recoverable).toBe(false);
      expect(result.message).toContain('certificate');
    });
  });

  describe('Rate Limit Handling', () => {
    test('should handle rate limit with retry-after header', async () => {
      const rateLimitError = new Error('Too many requests');
      (rateLimitError as any).status = 429;
      (rateLimitError as any).headers = { 'retry-after': '300' };

      const result = await errorHandler.handleRateLimit(rateLimitError);

      expect(result.type).toBe(ErrorType.RATE_LIMIT_EXCEEDED);
      expect(result.retryAfter).toBe(300000); // 5 minutes in milliseconds
      expect(result.recoverable).toBe(true);
      expect(result.message.toLowerCase()).toContain('rate limit');
    });

    test('should handle rate limit without retry-after header', async () => {
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).status = 429;

      const result = await errorHandler.handleRateLimit(rateLimitError);

      expect(result.type).toBe(ErrorType.RATE_LIMIT_EXCEEDED);
      expect(result.retryAfter).toBeGreaterThan(0); // Should have default retry time
      expect(result.message.toLowerCase()).toContain('rate limit');
    });

    test('should calculate appropriate backoff time for repeated rate limits', async () => {
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).status = 429;

      // First rate limit
      const result1 = await errorHandler.handleRateLimit(rateLimitError);
      // Second rate limit (should have longer backoff)
      const result2 = await errorHandler.handleRateLimit(rateLimitError);

      expect(result2.retryAfter).toBeGreaterThan(result1.retryAfter!);
    });
  });

  describe('User Message Generation', () => {
    test('should generate user-friendly error messages for authentication failures', async () => {
      const authError: ErrorContext = {
        type: ErrorType.AUTHENTICATION_FAILED,
        message: 'Invalid token',
        recoverable: true,
        fallbackAvailable: true
      };

      const userMessage = await errorHandler.generateUserMessage(authError);

      expect(userMessage.title).toContain('Authentication');
      expect(userMessage.severity).toBe('warning');
      expect(userMessage.actions).toContainEqual(
        expect.objectContaining({ action: 'retry' })
      );
      expect(userMessage.actions).toContainEqual(
        expect.objectContaining({ action: 'settings' })
      );
    });

    test('should generate user messages for network errors', async () => {
      const networkError: ErrorContext = {
        type: ErrorType.NETWORK_UNAVAILABLE,
        message: 'Network connectivity lost',
        recoverable: true,
        fallbackAvailable: true
      };

      const userMessage = await errorHandler.generateUserMessage(networkError);

      expect(userMessage.title).toContain('Network');
      expect(userMessage.severity).toBe('error');
      expect(userMessage.actions).toContainEqual(
        expect.objectContaining({ action: 'fallback' })
      );
    });

    test('should generate rate limit messages with countdown', async () => {
      const rateLimitError: ErrorContext = {
        type: ErrorType.RATE_LIMIT_EXCEEDED,
        message: 'Rate limit exceeded',
        recoverable: true,
        retryAfter: 300000, // 5 minutes
        fallbackAvailable: true
      };

      const userMessage = await errorHandler.generateUserMessage(rateLimitError);

      expect(userMessage.title).toContain('Rate Limit');
      expect(userMessage.body).toContain('5 minutes');
      expect(userMessage.severity).toBe('warning');
    });

    test('should generate non-recoverable error messages', async () => {
      const nonRecoverableError: ErrorContext = {
        type: ErrorType.PERMISSION_DENIED,
        message: 'Access denied',
        recoverable: false,
        fallbackAvailable: false
      };

      const userMessage = await errorHandler.generateUserMessage(nonRecoverableError);

      expect(userMessage.severity).toBe('error');
      expect(userMessage.dismissible).toBe(true);
      expect(userMessage.actions).not.toContainEqual(
        expect.objectContaining({ action: 'retry' })
      );
    });
  });

  describe('Error Classification and Recovery', () => {
    test('should classify errors by recoverability', async () => {
      const errors = [
        { error: new Error('Network timeout'), expected: true },
        { error: new Error('Invalid token'), expected: true },
        { error: new Error('Permission denied'), expected: false },
        { error: new Error('Malformed response'), expected: true }
      ];

      for (const { error, expected } of errors) {
        const isRecoverable = await errorHandler.isRecoverable(error);
        expect(isRecoverable).toBe(expected);
      }
    });

    test('should determine fallback availability', async () => {
      const scenarios = [
        { errorType: ErrorType.API_REQUEST_FAILED, expected: true },
        { errorType: ErrorType.RATE_LIMIT_EXCEEDED, expected: true },
        { errorType: ErrorType.NETWORK_UNAVAILABLE, expected: true },
        { errorType: ErrorType.PERMISSION_DENIED, expected: false }
      ];

      for (const { errorType, expected } of scenarios) {
        const fallbackAvailable = await errorHandler.isFallbackAvailable(errorType);
        expect(fallbackAvailable).toBe(expected);
      }
    });

    test('should get appropriate retry configuration', async () => {
      const retryConfig = await errorHandler.getRetryConfig(ErrorType.API_REQUEST_FAILED);

      expect(retryConfig.maxAttempts).toBeGreaterThan(0);
      expect(retryConfig.backoffMultiplier).toBeGreaterThan(1);
      expect(retryConfig.initialDelay).toBeGreaterThan(0);
      expect(retryConfig.maxDelay).toBeGreaterThan(retryConfig.initialDelay);
    });
  });

  describe('Error Logging and Debugging', () => {
    test('should log errors with appropriate detail level', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Create a fresh error handler to avoid pollution from other tests
      const freshErrorHandler = new ErrorHandlingService();
      
      const error = new Error('Test error');
      const context: ErrorContext = {
        type: ErrorType.API_REQUEST_FAILED,
        message: 'API call failed',
        recoverable: true,
        fallbackAvailable: true,
        debugInfo: { endpoint: '/api/threads', method: 'GET' }
      };

      await freshErrorHandler.logError(error, context);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('api_failed'),
        expect.objectContaining({
          message: 'API call failed',
          debugInfo: expect.any(Object)
        })
      );

      consoleSpy.mockRestore();
      freshErrorHandler.destroy();
    });

    test('should collect error statistics', async () => {
      // Generate some errors
      await errorHandler.handleAPIError(new Error('API Error 1'));
      await errorHandler.handleNetworkError(new Error('Network Error 1'));
      await errorHandler.handleAPIError(new Error('API Error 2'));

      const stats = await errorHandler.getErrorStatistics();

      expect(stats.totalErrors).toBe(3);
      expect(stats.errorsByType[ErrorType.API_REQUEST_FAILED]).toBe(2);
      expect(stats.errorsByType[ErrorType.NETWORK_UNAVAILABLE]).toBe(1);
      expect(stats.recoverableErrors).toBe(3);
    });
  });

  describe('Integration with Other Services', () => {
    test('should integrate with cache service for error state caching', async () => {
      const error = new Error('API unavailable');
      
      await errorHandler.handleAPIError(error);
      
      // Check cached error state using the error type as key
      const cachedErrorState = await errorHandler.getCachedErrorState('api_failed');
      
      expect(cachedErrorState).toBeDefined();
      expect(cachedErrorState!.lastError).toContain('API unavailable');
      expect(cachedErrorState!.errorCount).toBeGreaterThan(0);
    });

    test('should notify background service of critical errors', async () => {
      const criticalError = new Error('Extension context lost');
      
      const notificationSent = await errorHandler.notifyCriticalError(criticalError);
      
      expect(notificationSent).toBe(true);
      // Should have sent message to background service
      expect(mockChrome.notifications.create).toHaveBeenCalled();
    });
  });

  describe('Error Recovery Strategies', () => {
    test('should suggest appropriate recovery actions', async () => {
      const errorContext: ErrorContext = {
        type: ErrorType.RATE_LIMIT_EXCEEDED,
        message: 'Rate limit hit',
        recoverable: true,
        retryAfter: 300000,
        fallbackAvailable: true
      };

      const recoveryActions = await errorHandler.getRecoveryActions(errorContext);

      expect(recoveryActions).toContainEqual(
        expect.objectContaining({
          type: 'wait_and_retry',
          delay: 300000
        })
      );
      expect(recoveryActions).toContainEqual(
        expect.objectContaining({
          type: 'fallback_to_dom'
        })
      );
    });

    test('should provide fallback options for different error types', async () => {
      const fallbackOptions = await errorHandler.getFallbackOptions(ErrorType.API_REQUEST_FAILED);

      expect(fallbackOptions).toContainEqual(
        expect.objectContaining({
          type: 'dom_scraping',
          available: true
        })
      );
      expect(fallbackOptions).toContainEqual(
        expect.objectContaining({
          type: 'cached_data',
          available: true
        })
      );
    });
  });

  describe('Error Context Enhancement', () => {
    test('should enhance error context with debugging information', async () => {
      const basicError = new Error('Simple error');
      
      const enhancedContext = await errorHandler.enhanceErrorContext(basicError, {
        operation: 'fetchThread',
        threadId: '123',
        timestamp: Date.now()
      });

      expect(enhancedContext.debugInfo).toEqual(
        expect.objectContaining({
          operation: 'fetchThread',
          threadId: '123',
          timestamp: expect.any(Number)
        })
      );
      expect(enhancedContext.type).toBeDefined();
      expect(enhancedContext.recoverable).toBeDefined();
    });

    test('should add browser and extension context to errors', async () => {
      const error = new Error('Context test');
      
      const context = await errorHandler.addBrowserContext(error);

      expect(context.debugInfo).toEqual(
        expect.objectContaining({
          userAgent: expect.any(String),
          extensionVersion: expect.any(String),
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('Error Notification System', () => {
    test('should show notifications for recoverable errors', async () => {
      const recoverableError: ErrorContext = {
        type: ErrorType.NETWORK_UNAVAILABLE,
        message: 'Connection lost',
        recoverable: true,
        fallbackAvailable: true
      };

      await errorHandler.showErrorNotification(recoverableError);

      expect(mockChrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'basic',
          iconUrl: expect.any(String),
          title: expect.stringContaining('Network'),
          message: expect.stringContaining('Connection lost')
        })
      );
    });

    test('should not show notifications for minor errors', async () => {
      const minorError: ErrorContext = {
        type: ErrorType.PARSING_ERROR,
        message: 'Minor parse issue',
        recoverable: true,
        fallbackAvailable: true
      };

      await errorHandler.showErrorNotification(minorError, { silent: true });

      expect(mockChrome.notifications.create).not.toHaveBeenCalled();
    });
  });
});