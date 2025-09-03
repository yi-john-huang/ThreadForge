/**
 * Unit tests for Hybrid Architecture for Gradual Migration - Task 22
 * Tests compatibility layer, feature flags, automatic fallback, 
 * user preference migration, and hybrid mode operation
 */

import { CompatibilityLayer } from '../migration/compatibilityLayer';
import { FeatureFlagService } from '../migration/featureFlagService';
import { UserPreferenceMigrator } from '../migration/userPreferenceMigrator';
import { ExtensionSettings, CommentData } from '../types';

// Mock Chrome APIs
const mockChrome = {
  storage: {
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn()
      }
    },
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined)
    }
  },
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({}),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getURL: jest.fn().mockReturnValue('chrome-extension://test')
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({})
  }
};

(global as any).chrome = mockChrome;

describe('Hybrid Architecture for Gradual Migration - Task 22', () => {
  let compatibilityLayer: CompatibilityLayer;
  let featureFlagService: FeatureFlagService;
  let userPreferenceMigrator: UserPreferenceMigrator;
  let container: HTMLElement;

  beforeEach(() => {
    compatibilityLayer = new CompatibilityLayer();
    featureFlagService = new FeatureFlagService();
    userPreferenceMigrator = new UserPreferenceMigrator();
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default Chrome API responses with credentials
    mockChrome.storage.sync.get.mockResolvedValue({
      threads_credentials: {
        access_token: 'mock_access_token',
        client_id: 'mock_client_id'
      }
    });
    mockChrome.storage.sync.set.mockResolvedValue(undefined);
    mockChrome.storage.local.get.mockResolvedValue({});
    
    // Mock fetch for API availability tests
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy' })
    });
  });

  afterEach(() => {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('Compatibility Layer Fallback Logic', () => {
    test('should initialize with both API and DOM scraping capabilities', () => {
      const layer = new CompatibilityLayer();
      
      expect(layer.isApiSupported()).toBeDefined();
      expect(layer.isDomScrapingSupported()).toBeDefined();
      expect(layer.getCurrentMode()).toBeDefined();
    });

    test('should attempt API first and fallback to DOM scraping', async () => {
      // Mock API failure
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('API unavailable'));
      
      const threadId = 'test-thread-123';
      const result = await compatibilityLayer.fetchThreadData(threadId);
      
      expect(result).toBeTruthy();
      expect(result.source).toBe('dom'); // Should fallback to DOM
      expect(result.data).toBeDefined();
    });

    test('should use API when available and enabled', async () => {
      // Mock successful API response
      const mockApiResponse = {
        id: 'thread-123',
        author: 'test-user',
        text: 'Test thread content',
        replies: []
      };
      
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse)
      });
      
      // Enable API mode
      await compatibilityLayer.setMode('api');
      
      const threadId = 'test-thread-123';
      const result = await compatibilityLayer.fetchThreadData(threadId);
      
      expect(result.source).toBe('api');
      expect(result.data).toEqual(mockApiResponse);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(threadId),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer')
          })
        })
      );
    });

    test('should maintain DOM scraping capability as fallback', async () => {
      // Mock DOM elements that would exist on Threads pages
      const mockThreadElement = document.createElement('div');
      mockThreadElement.setAttribute('data-testid', 'thread-content');
      mockThreadElement.innerHTML = `
        <div class="thread-author">test-user</div>
        <div class="thread-text">Test DOM content</div>
        <div class="replies-container">
          <div class="reply">Reply 1</div>
          <div class="reply">Reply 2</div>
        </div>
      `;
      document.body.appendChild(mockThreadElement);
      
      // Force DOM mode
      await compatibilityLayer.setMode('dom');
      
      const threadId = 'test-thread-123';
      const result = await compatibilityLayer.fetchThreadData(threadId);
      
      expect(result.source).toBe('dom');
      expect(result.data).toBeTruthy();
      expect(result.data.author).toBe('test-user');
      expect(result.data.text).toBe('Test DOM content');
      expect(result.data.replies).toBeDefined();
      
      mockThreadElement.remove();
    });

    test('should handle mixed mode operations', async () => {
      // Setup for hybrid mode
      await compatibilityLayer.setMode('hybrid');
      
      const threadId1 = 'api-thread';
      const threadId2 = 'dom-thread';
      
      // Mock API success for first thread
      (global as any).fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: threadId1, source: 'api' })
        })
        .mockRejectedValueOnce(new Error('API error'));
      
      const result1 = await compatibilityLayer.fetchThreadData(threadId1);
      const result2 = await compatibilityLayer.fetchThreadData(threadId2);
      
      expect(result1.source).toBe('api');
      expect(result2.source).toBe('dom'); // Fallback
    });

    test('should track fallback statistics', async () => {
      // Force multiple fallback scenarios
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('API down'));
      
      await compatibilityLayer.fetchThreadData('thread1');
      await compatibilityLayer.fetchThreadData('thread2');
      await compatibilityLayer.fetchThreadData('thread3');
      
      const stats = compatibilityLayer.getFallbackStatistics();
      
      expect(stats.totalRequests).toBe(3);
      expect(stats.apiFallbacks).toBe(3);
      expect(stats.domFallbacks).toBe(0);
      expect(stats.fallbackRate).toBeGreaterThan(0);
    });
  });

  describe('Feature Flag System for A/B Testing', () => {
    test('should initialize feature flags with default values', () => {
      const flags = featureFlagService.getAllFlags();
      
      expect(flags).toHaveProperty('useThreadsApi');
      expect(flags).toHaveProperty('enableHybridMode');
      expect(flags).toHaveProperty('autoFallback');
      expect(typeof flags.useThreadsApi).toBe('boolean');
    });

    test('should support A/B testing groups', async () => {
      // Set up A/B test
      await featureFlagService.createABTest('api_vs_dom', {
        control: { useThreadsApi: false },
        treatment: { useThreadsApi: true },
        splitRatio: 0.5
      });
      
      // Test group assignment
      const userGroup = featureFlagService.getUserGroup('api_vs_dom');
      expect(['control', 'treatment']).toContain(userGroup);
      
      // Get flags for user group
      const flags = featureFlagService.getFlagsForUser('api_vs_dom');
      expect(flags).toHaveProperty('useThreadsApi');
    });

    test('should enable/disable features dynamically', async () => {
      // Initially disabled
      expect(featureFlagService.isFeatureEnabled('newUIFeature')).toBe(false);
      
      // Enable feature
      await featureFlagService.setFeatureFlag('newUIFeature', true);
      expect(featureFlagService.isFeatureEnabled('newUIFeature')).toBe(true);
      
      // Disable feature
      await featureFlagService.setFeatureFlag('newUIFeature', false);
      expect(featureFlagService.isFeatureEnabled('newUIFeature')).toBe(false);
    });

    test('should support conditional feature flags', async () => {
      // Set up conditional flag
      await featureFlagService.setConditionalFlag('premiumFeature', {
        condition: 'user.hasCredentials',
        enabled: true
      });
      
      // Test with credentials
      mockChrome.storage.sync.get.mockResolvedValue({
        threads_credentials: { access_token: 'test' }
      });
      
      const isEnabled = await featureFlagService.isConditionalFeatureEnabled('premiumFeature');
      expect(isEnabled).toBe(true);
    });

    test('should track feature flag usage statistics', async () => {
      await featureFlagService.setFeatureFlag('testFeature', true);
      
      // Simulate feature usage
      featureFlagService.trackFeatureUsage('testFeature');
      featureFlagService.trackFeatureUsage('testFeature');
      featureFlagService.trackFeatureUsage('testFeature');
      
      const stats = featureFlagService.getFeatureStats('testFeature');
      expect(stats.usageCount).toBe(3);
      expect(stats.enabled).toBe(true);
      expect(stats.lastUsed).toBeDefined();
    });

    test('should persist feature flags to storage', async () => {
      await featureFlagService.setFeatureFlag('persistentFeature', true);
      
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'feature_flags': expect.objectContaining({
            'persistentFeature': true
          })
        })
      );
    });
  });

  describe('Automatic Fallback When API is Unavailable', () => {
    test('should detect API availability', async () => {
      // Test API available
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy' })
      });
      
      const isAvailable = await compatibilityLayer.checkApiAvailability();
      expect(isAvailable).toBe(true);
      
      // Test API unavailable
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      const isUnavailable = await compatibilityLayer.checkApiAvailability();
      expect(isUnavailable).toBe(false);
    });

    test('should automatically switch to DOM when API fails', async () => {
      // Start in API mode
      await compatibilityLayer.setMode('api');
      expect(compatibilityLayer.getCurrentMode()).toBe('api');
      
      // Mock API failure
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('API down'));
      
      // This should trigger automatic fallback
      const result = await compatibilityLayer.fetchThreadData('test-thread');
      
      expect(result.source).toBe('dom');
      expect(compatibilityLayer.getCurrentMode()).toBe('dom'); // Should switch automatically
    });

    test('should recover to API when it becomes available again', async () => {
      // Start in fallback DOM mode
      await compatibilityLayer.setMode('dom');
      
      // Mock API recovery
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy' })
      });
      
      // Check for API recovery
      await compatibilityLayer.attemptApiRecovery();
      
      // Should switch back to API mode if user preference allows
      const mode = compatibilityLayer.getCurrentMode();
      expect(['api', 'hybrid']).toContain(mode);
    });

    test('should implement circuit breaker pattern', async () => {
      // Configure circuit breaker
      compatibilityLayer.configureCircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 1000
      });
      
      // Mock API failures
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('API error'));
      
      // Trigger failures to trip circuit breaker
      await compatibilityLayer.fetchThreadData('thread1');
      await compatibilityLayer.fetchThreadData('thread2');
      await compatibilityLayer.fetchThreadData('thread3');
      
      const circuitState = compatibilityLayer.getCircuitBreakerState();
      expect(circuitState.isOpen).toBe(true);
      expect(circuitState.failures).toBe(3);
    });

    test('should notify users of fallback mode', async () => {
      const notificationSpy = jest.fn();
      compatibilityLayer.onFallback(notificationSpy);
      
      // Force fallback
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('API error'));
      await compatibilityLayer.fetchThreadData('test-thread');
      
      expect(notificationSpy).toHaveBeenCalledWith({
        reason: 'api_unavailable',
        fallbackMode: 'dom',
        timestamp: expect.any(Number)
      });
    });
  });

  describe('User Preference Migration', () => {
    test('should detect old settings format', async () => {
      // Mock old format settings
      const oldSettings = {
        enable_inline: true,
        auto_expand: false,
        max_depth: 5,
        debug_mode: true
      };
      
      mockChrome.storage.sync.get.mockResolvedValue({
        threadForgeOldSettings: oldSettings
      });
      
      const needsMigration = await userPreferenceMigrator.needsMigration();
      expect(needsMigration).toBe(true);
    });

    test('should migrate old settings to new format', async () => {
      const oldSettings = {
        enable_inline: true,
        auto_expand: false,
        max_depth: 5,
        debug_mode: true
      };
      
      mockChrome.storage.sync.get.mockResolvedValue({
        threadForgeOldSettings: oldSettings
      });
      
      const migratedSettings = await userPreferenceMigrator.migrateSettings();
      
      expect(migratedSettings).toEqual({
        enableInlineExpansion: true,
        autoExpandReplies: false,
        maxReplyDepth: 5,
        debug: true,
        useThreadsApi: false // Default for new field
      });
      
      // Should save migrated settings
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        threadForgeSettings: migratedSettings
      });
    });

    test('should handle partial migration safely', async () => {
      // Old settings with missing fields
      const partialOldSettings = {
        enable_inline: true,
        // missing other fields
      };
      
      mockChrome.storage.sync.get.mockResolvedValue({
        threadForgeOldSettings: partialOldSettings
      });
      
      const migratedSettings = await userPreferenceMigrator.migrateSettings();
      
      // Should have all required fields with defaults
      expect(migratedSettings.enableInlineExpansion).toBe(true);
      expect(migratedSettings.autoExpandReplies).toBe(false); // Default
      expect(migratedSettings.maxReplyDepth).toBe(3); // Default
      expect(migratedSettings.debug).toBe(false); // Default
    });

    test('should backup old settings before migration', async () => {
      const oldSettings = { enable_inline: true };
      mockChrome.storage.sync.get.mockResolvedValue({
        threadForgeOldSettings: oldSettings
      });
      
      await userPreferenceMigrator.migrateSettings();
      
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'threadForgeOldSettingsBackup': expect.objectContaining({
            settings: oldSettings,
            migratedAt: expect.any(Number)
          })
        })
      );
    });

    test('should not migrate if new format already exists', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({
        threadForgeSettings: { enableInlineExpansion: true },
        threadForgeOldSettings: { enable_inline: false }
      });
      
      const needsMigration = await userPreferenceMigrator.needsMigration();
      expect(needsMigration).toBe(false);
    });

    test('should create migration summary report', async () => {
      const oldSettings = {
        enable_inline: true,
        auto_expand: false,
        max_depth: 10
      };
      
      mockChrome.storage.sync.get.mockResolvedValue({
        threadForgeOldSettings: oldSettings
      });
      
      await userPreferenceMigrator.migrateSettings();
      const report = userPreferenceMigrator.getMigrationReport();
      
      expect(report).toBeTruthy();
      expect(report.migratedFields).toBe(3);
      expect(report.defaultedFields).toBeGreaterThan(0);
      expect(report.success).toBe(true);
      expect(report.timestamp).toBeDefined();
    });
  });

  describe('Hybrid Mode Operation', () => {
    test('should seamlessly switch between API and DOM based on availability', async () => {
      await compatibilityLayer.setMode('hybrid');
      
      // First request - API success
      (global as any).fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'api-result' })
      });
      
      const result1 = await compatibilityLayer.fetchThreadData('thread1');
      expect(result1.source).toBe('api');
      
      // Second request - API failure, should fallback
      (global as any).fetch = jest.fn().mockRejectedValueOnce(new Error('API error'));
      
      const result2 = await compatibilityLayer.fetchThreadData('thread2');
      expect(result2.source).toBe('dom');
    });

    test('should maintain consistent data format across sources', async () => {
      await compatibilityLayer.setMode('hybrid');
      
      // API response
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'thread123',
          author: 'api-user',
          text: 'API content',
          replies: []
        })
      });
      
      const apiResult = await compatibilityLayer.fetchThreadData('thread1');
      
      // DOM response (mocked)
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('API down'));
      
      const domResult = await compatibilityLayer.fetchThreadData('thread2');
      
      // Both should have same structure
      expect(apiResult.data).toHaveProperty('id');
      expect(apiResult.data).toHaveProperty('author');
      expect(apiResult.data).toHaveProperty('text');
      expect(apiResult.data).toHaveProperty('replies');
      
      expect(domResult.data).toHaveProperty('id');
      expect(domResult.data).toHaveProperty('author');
      expect(domResult.data).toHaveProperty('text');
      expect(domResult.data).toHaveProperty('replies');
    });

    test('should provide performance metrics for hybrid mode', async () => {
      await compatibilityLayer.setMode('hybrid');
      
      // Perform mixed requests
      (global as any).fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
      
      await compatibilityLayer.fetchThreadData('thread1');
      await compatibilityLayer.fetchThreadData('thread2');  
      await compatibilityLayer.fetchThreadData('thread3');
      
      const metrics = compatibilityLayer.getPerformanceMetrics();
      
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.apiRequests).toBe(2);
      expect(metrics.domRequests).toBe(1);
      expect(metrics.averageResponseTime).toBeDefined();
      expect(metrics.successRate).toBeDefined();
    });

    test('should handle concurrent requests efficiently', async () => {
      await compatibilityLayer.setMode('hybrid');
      
      // Mock mixed responses
      (global as any).fetch = jest.fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve({ concurrent: true }) });
      
      // Fire concurrent requests
      const promises = [
        compatibilityLayer.fetchThreadData('thread1'),
        compatibilityLayer.fetchThreadData('thread2'),
        compatibilityLayer.fetchThreadData('thread3'),
        compatibilityLayer.fetchThreadData('thread4')
      ];
      
      const results = await Promise.all(promises);
      
      expect(results.length).toBe(4);
      results.forEach(result => {
        expect(result.data).toBeTruthy();
        expect(['api', 'dom']).toContain(result.source);
      });
    });

    test('should respect user preferences in hybrid mode', async () => {
      // Set user preference for API-first
      mockChrome.storage.sync.get.mockResolvedValue({
        threadForgeSettings: {
          useThreadsApi: true,
          preferApiInHybrid: true
        }
      });
      
      await compatibilityLayer.setMode('hybrid');
      
      // Should prefer API even when both are available
      const preferenceMode = await compatibilityLayer.getPreferredMode();
      expect(preferenceMode).toBe('api');
    });

    test('should provide fallback chain configuration', () => {
      const defaultChain = compatibilityLayer.getFallbackChain();
      expect(defaultChain).toEqual(['api', 'dom']);
      
      // Configure custom fallback chain
      compatibilityLayer.setFallbackChain(['dom', 'api']);
      const customChain = compatibilityLayer.getFallbackChain();
      expect(customChain).toEqual(['dom', 'api']);
    });
  });
});