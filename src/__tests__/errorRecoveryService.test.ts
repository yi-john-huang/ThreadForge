/**
 * Unit tests for Error Recovery Service - Task 14
 * Tests exponential backoff retry logic, DOM scraping fallback, 
 * offline mode detection, and user notifications for recoverable errors
 */

import { ErrorRecoveryService } from '../errors/errorRecoveryService';
import { ErrorType, ErrorContext, RetryConfig, FallbackOption } from '../errors/types';

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  },
  notifications: {
    create: jest.fn(),
    clear: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn()
    }
  }
};

(global as any).chrome = mockChrome;

// Mock DOM scraping service
const mockDOMScraper = {
  scrapeThread: jest.fn(),
  isAvailable: jest.fn()
};

// Mock cache service
const mockCacheService = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  has: jest.fn().mockResolvedValue(false)
};

describe('ErrorRecoveryService', () => {
  let recoveryService: ErrorRecoveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChrome.runtime.sendMessage.mockResolvedValue(undefined);
    recoveryService = new ErrorRecoveryService(mockDOMScraper, mockCacheService);
  });

  afterEach(() => {
    recoveryService?.destroy();
  });

  describe('Exponential Backoff Retry Logic', () => {
    test('should implement exponential backoff for API failures', async () => {
      const errorContext: ErrorContext = {
        type: ErrorType.API_REQUEST_FAILED,
        message: 'API temporarily unavailable',
        recoverable: true,
        fallbackAvailable: true
      };

      const retryConfig = await recoveryService.getRetryStrategy(errorContext);

      expect(retryConfig.maxAttempts).toBe(3);
      expect(retryConfig.backoffMultiplier).toBe(2);
      expect(retryConfig.initialDelay).toBe(1000);
      expect(retryConfig.maxDelay).toBe(30000);
    });

    test('should calculate progressive backoff delays', async () => {
      const delays = [];
      for (let attempt = 1; attempt <= 5; attempt++) {
        const delay = await recoveryService.calculateBackoffDelay(attempt, 1000, 2);
        delays.push(delay);
      }

      expect(delays[0]).toBe(1000);   // 1st attempt: 1s
      expect(delays[1]).toBe(2000);   // 2nd attempt: 2s
      expect(delays[2]).toBe(4000);   // 3rd attempt: 4s
      expect(delays[3]).toBe(8000);   // 4th attempt: 8s
      expect(delays[4]).toBe(16000);  // 5th attempt: 16s
    });

    test('should respect maximum delay limits', async () => {
      const delay = await recoveryService.calculateBackoffDelay(10, 1000, 2, 5000);
      expect(delay).toBeLessThanOrEqual(5000);
    });

    test('should add jitter to prevent thundering herd', async () => {
      const delays = [];
      for (let i = 0; i < 10; i++) {
        const delay = await recoveryService.calculateBackoffDelay(3, 1000, 2, 30000, true);
        delays.push(delay);
      }

      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
      
      // But all should be around the expected value (4000ms ± 20%)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThan(3200);
        expect(delay).toBeLessThan(4800);
      });
    });

    test('should execute retry with exponential backoff', async () => {
      const failingOperation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('Success');

      const result = await recoveryService.executeWithRetry(
        failingOperation,
        { maxAttempts: 3, backoffMultiplier: 1.5, initialDelay: 100, maxDelay: 1000 }
      );

      expect(result).toBe('Success');
      expect(failingOperation).toHaveBeenCalledTimes(3);
    });

    test('should give up after max attempts reached', async () => {
      const alwaysFailingOperation = jest.fn()
        .mockRejectedValue(new Error('Always fails'));

      await expect(
        recoveryService.executeWithRetry(
          alwaysFailingOperation,
          { maxAttempts: 2, backoffMultiplier: 2, initialDelay: 100, maxDelay: 1000 }
        )
      ).rejects.toThrow('Always fails');

      expect(alwaysFailingOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Fallback to DOM Scraping', () => {
    test('should detect when API is unavailable', async () => {
      const apiError: ErrorContext = {
        type: ErrorType.API_REQUEST_FAILED,
        message: 'API service down',
        recoverable: false,
        fallbackAvailable: true
      };

      mockDOMScraper.isAvailable.mockReturnValue(true);

      const shouldFallback = await recoveryService.shouldFallbackToDOMScraping(apiError);
      expect(shouldFallback).toBe(true);
    });

    test('should not fallback for authentication errors', async () => {
      const authError: ErrorContext = {
        type: ErrorType.AUTHENTICATION_FAILED,
        message: 'Invalid token',
        recoverable: true,
        fallbackAvailable: false
      };

      const shouldFallback = await recoveryService.shouldFallbackToDOMScraping(authError);
      expect(shouldFallback).toBe(false);
    });

    test('should execute DOM scraping fallback for thread data', async () => {
      const threadId = 'thread_123';
      const scrapedData = {
        id: threadId,
        author: 'test_user',
        content: 'Scraped thread content',
        replies: []
      };

      mockDOMScraper.scrapeThread.mockResolvedValue(scrapedData);
      mockDOMScraper.isAvailable.mockReturnValue(true);

      const result = await recoveryService.fallbackToDOMScraping('getThread', threadId);

      expect(result).toEqual(scrapedData);
      expect(mockDOMScraper.scrapeThread).toHaveBeenCalledWith(threadId);
    });

    test('should handle DOM scraping failures gracefully', async () => {
      mockDOMScraper.isAvailable.mockReturnValue(false);

      const result = await recoveryService.fallbackToDOMScraping('getThread', 'thread_123');

      expect(result).toBeNull();
      expect(mockDOMScraper.scrapeThread).not.toHaveBeenCalled();
    });

    test('should cache DOM scraped data', async () => {
      const threadId = 'thread_456';
      const scrapedData = { id: threadId, content: 'Cached scraped data' };

      mockDOMScraper.scrapeThread.mockResolvedValue(scrapedData);
      mockDOMScraper.isAvailable.mockReturnValue(true);

      await recoveryService.fallbackToDOMScraping('getThread', threadId);

      expect(mockCacheService.set).toHaveBeenCalledWith(
        `fallback_thread_${threadId}`,
        scrapedData,
        expect.any(Number) // TTL
      );
    });
  });

  describe('Offline Mode Detection and Cached Data Display', () => {
    test('should detect offline mode', async () => {
      // Mock navigator.onLine
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      });

      const isOffline = await recoveryService.isOfflineMode();
      expect(isOffline).toBe(true);
    });

    test('should detect online mode', async () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });

      const isOffline = await recoveryService.isOfflineMode();
      expect(isOffline).toBe(false);
    });

    test('should serve cached data when offline', async () => {
      const threadId = 'cached_thread';
      const cachedData = { id: threadId, content: 'Cached offline data' };

      Object.defineProperty(navigator, 'onLine', { value: false });
      mockCacheService.get.mockResolvedValue(cachedData);
      mockCacheService.has.mockResolvedValue(true);

      const result = await recoveryService.getCachedDataForOffline('thread', threadId);

      expect(result).toEqual(expect.objectContaining({
        ...cachedData,
        _isOfflineData: true,
        _lastUpdated: expect.any(Date)
      }));
      expect(mockCacheService.get).toHaveBeenCalledWith(`thread_${threadId}`);
    });

    test('should return null for uncached data when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false });
      mockCacheService.has.mockResolvedValue(false);

      const result = await recoveryService.getCachedDataForOffline('thread', 'missing_thread');

      expect(result).toBeNull();
    });

    test('should add offline indicators to cached data', async () => {
      const cachedData = { id: 'test', content: 'Test content' };
      mockCacheService.get.mockResolvedValue(cachedData);
      mockCacheService.has.mockResolvedValue(true);

      const result = await recoveryService.getCachedDataForOffline('thread', 'test');

      expect(result).toEqual(
        expect.objectContaining({
          ...cachedData,
          _isOfflineData: true,
          _lastUpdated: expect.any(Date)
        })
      );
    });

    test('should listen for online/offline events', async () => {
      const onlineListener = jest.fn();
      const offlineListener = jest.fn();

      await recoveryService.setupOfflineListeners(onlineListener, offlineListener);

      // Simulate going offline
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);

      // Simulate coming online
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);

      expect(offlineListener).toHaveBeenCalledWith(offlineEvent);
      expect(onlineListener).toHaveBeenCalledWith(onlineEvent);
    });
  });

  describe('User Notification System for Recoverable Errors', () => {
    test('should show notification for recoverable API errors', async () => {
      const errorContext: ErrorContext = {
        type: ErrorType.API_REQUEST_FAILED,
        message: 'Temporary API failure',
        recoverable: true,
        fallbackAvailable: true,
        retryAfter: 30000
      };

      await recoveryService.notifyUserOfRecoverableError(errorContext);

      expect(mockChrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'basic',
          iconUrl: expect.any(String),
          title: expect.stringContaining('Temporary Issue'),
          message: expect.stringContaining('30 seconds'),
          buttons: expect.arrayContaining([
            expect.objectContaining({ title: 'Try Again' }),
            expect.objectContaining({ title: 'Use Fallback' })
          ])
        })
      );
    });

    test('should show different notification for offline mode', async () => {
      const offlineContext: ErrorContext = {
        type: ErrorType.NETWORK_UNAVAILABLE,
        message: 'No network connection',
        recoverable: true,
        fallbackAvailable: true
      };

      Object.defineProperty(navigator, 'onLine', { value: false });

      await recoveryService.notifyUserOfRecoverableError(offlineContext);

      expect(mockChrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: expect.stringContaining('Offline'),
          message: expect.stringContaining('cached data'),
          buttons: expect.arrayContaining([
            expect.objectContaining({ title: 'View Cached Data' })
          ])
        })
      );
    });

    test('should not show notifications for silent errors', async () => {
      const silentError: ErrorContext = {
        type: ErrorType.PARSING_ERROR,
        message: 'Minor parsing issue',
        recoverable: true,
        fallbackAvailable: true
      };

      await recoveryService.notifyUserOfRecoverableError(silentError, { silent: true });

      expect(mockChrome.notifications.create).not.toHaveBeenCalled();
    });

    test('should handle notification click actions', async () => {
      const notificationId = 'recovery_notification_123';
      const mockRetryCallback = jest.fn();
      const mockFallbackCallback = jest.fn();

      await recoveryService.handleNotificationClick(
        notificationId,
        0, // button index
        { retry: mockRetryCallback, fallback: mockFallbackCallback }
      );

      expect(mockRetryCallback).toHaveBeenCalled();
    });

    test('should update notification with recovery progress', async () => {
      const notificationId = 'progress_notification';
      const progress = {
        stage: 'retrying',
        attempt: 2,
        maxAttempts: 3,
        nextRetryIn: 15000
      };

      await recoveryService.updateRecoveryProgress(notificationId, progress);

      expect(mockChrome.notifications.create).toHaveBeenCalledWith(
        notificationId,
        expect.objectContaining({
          message: expect.stringContaining('Attempt 2 of 3'),
          progress: Math.round((2 / 3) * 100)
        })
      );
    });
  });

  describe('Recovery Strategy Selection', () => {
    test('should select appropriate recovery strategy for different error types', async () => {
      const strategies = [
        { 
          errorType: ErrorType.RATE_LIMIT_EXCEEDED, 
          expectedStrategy: 'wait_and_retry' 
        },
        { 
          errorType: ErrorType.API_REQUEST_FAILED, 
          expectedStrategy: 'retry' 
        },
        { 
          errorType: ErrorType.NETWORK_UNAVAILABLE, 
          expectedStrategy: 'offline_mode' 
        },
        { 
          errorType: ErrorType.AUTHENTICATION_FAILED, 
          expectedStrategy: 'reauthenticate' 
        }
      ];

      for (const { errorType, expectedStrategy } of strategies) {
        const errorContext: ErrorContext = {
          type: errorType,
          message: 'Test error',
          recoverable: true,
          fallbackAvailable: true
        };

        const strategy = await recoveryService.selectRecoveryStrategy(errorContext);
        expect(strategy.type).toBe(expectedStrategy);
      }
    });

    test('should prioritize strategies based on success probability', async () => {
      const errorContext: ErrorContext = {
        type: ErrorType.API_REQUEST_FAILED,
        message: 'API failure',
        recoverable: true,
        fallbackAvailable: true
      };

      const strategies = await recoveryService.getAllRecoveryStrategies(errorContext);

      expect(strategies).toHaveLength(3);
      expect(strategies[0].type).toBe('retry');
      expect(strategies[1].type).toBe('fallback_to_dom');
      expect(strategies[2].type).toBe('cached_data');
      
      // Should be ordered by success probability
      expect(strategies[0].successProbability).toBeGreaterThan(strategies[1].successProbability);
      expect(strategies[1].successProbability).toBeGreaterThan(strategies[2].successProbability);
    });
  });

  describe('Recovery Execution and Coordination', () => {
    test('should execute complete recovery flow', async () => {
      const errorContext: ErrorContext = {
        type: ErrorType.API_REQUEST_FAILED,
        message: 'API temporarily down',
        recoverable: true,
        fallbackAvailable: true
      };

      const originalOperation = jest.fn()
        .mockRejectedValueOnce(new Error('API down'))
        .mockResolvedValue('API recovered');

      const result = await recoveryService.executeRecoveryFlow(errorContext, originalOperation);

      expect(result.success).toBe(true);
      expect(result.data).toBe('API recovered');
      expect(result.strategyUsed).toBe('retry');
      expect(originalOperation).toHaveBeenCalledTimes(2);
    });

    test('should fall back through multiple strategies on failure', async () => {
      const errorContext: ErrorContext = {
        type: ErrorType.API_REQUEST_FAILED,
        message: 'API completely down',
        recoverable: true,
        fallbackAvailable: true
      };

      const failingOperation = jest.fn().mockRejectedValue(new Error('Still failing'));
      mockDOMScraper.isAvailable.mockReturnValue(true);
      mockDOMScraper.scrapeThread.mockResolvedValue({ fallback: 'data' });
      
      // Set up cache to return cached data for fallback strategy
      mockCacheService.has.mockResolvedValue(true);
      mockCacheService.get.mockResolvedValue({ fallback: 'data' });

      const result = await recoveryService.executeRecoveryFlow(errorContext, failingOperation, 'thread_123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({
        fallback: 'data'
      }));
      expect(result.strategyUsed).toBe('fallback_to_dom');
    });

    test('should report failure when all strategies exhausted', async () => {
      const errorContext: ErrorContext = {
        type: ErrorType.API_REQUEST_FAILED,
        message: 'Complete failure',
        recoverable: true,
        fallbackAvailable: false
      };

      const failingOperation = jest.fn().mockRejectedValue(new Error('Complete failure'));
      mockDOMScraper.isAvailable.mockReturnValue(false);
      mockCacheService.has.mockResolvedValue(false);

      const result = await recoveryService.executeRecoveryFlow(errorContext, failingOperation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('All recovery strategies failed');
    });
  });

  describe('Recovery Statistics and Learning', () => {
    test('should track recovery success rates by strategy', async () => {
      // Simulate successful retry recovery
      await recoveryService.recordRecoveryAttempt('retry', true, 2000);
      await recoveryService.recordRecoveryAttempt('retry', true, 1500);
      await recoveryService.recordRecoveryAttempt('fallback_to_dom', false, 5000);

      const stats = await recoveryService.getRecoveryStatistics();

      expect(stats.strategies.retry.attempts).toBe(2);
      expect(stats.strategies.retry.successes).toBe(2);
      expect(stats.strategies.retry.successRate).toBe(1.0);
      expect(stats.strategies.retry.averageRecoveryTime).toBe(1750);

      expect(stats.strategies.fallback_to_dom.attempts).toBe(1);
      expect(stats.strategies.fallback_to_dom.successes).toBe(0);
      expect(stats.strategies.fallback_to_dom.successRate).toBe(0.0);
    });

    test('should adapt strategy selection based on historical success', async () => {
      // Record DOM scraping as more successful recently
      await recoveryService.recordRecoveryAttempt('fallback_to_dom', true, 1000);
      await recoveryService.recordRecoveryAttempt('retry', false, 10000);

      const errorContext: ErrorContext = {
        type: ErrorType.API_REQUEST_FAILED,
        message: 'API failure',
        recoverable: true,
        fallbackAvailable: true
      };

      const strategy = await recoveryService.selectRecoveryStrategy(errorContext, { useHistoricalData: true });

      expect(strategy.type).toBe('fallback_to_dom');
    });
  });
});