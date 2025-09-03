/**
 * Unit tests for Real-Time Settings Application - Task 21
 * Tests settings change broadcasting, API vs DOM mode toggles, immediate application,
 * import/export functionality, and settings propagation across components
 */

import { SettingsManager } from '../settings/settingsManager';
import { ExtensionSettings } from '../types';
import { SettingsBroadcaster } from '../settings/settingsBroadcaster';
import { SettingsImportExport } from '../settings/settingsImportExport';

// Mock Chrome APIs
const mockChrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn()
      }
    },
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getURL: jest.fn().mockReturnValue('chrome-extension://test')
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn()
  }
};

(global as any).chrome = mockChrome;

describe('Real-Time Settings Application - Task 21', () => {
  let settingsManager: SettingsManager;
  let settingsBroadcaster: SettingsBroadcaster;
  let settingsImportExport: SettingsImportExport;
  let container: HTMLElement;

  beforeEach(() => {
    settingsManager = new SettingsManager();
    settingsBroadcaster = new SettingsBroadcaster();
    settingsImportExport = new SettingsImportExport();
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // Mock URL.createObjectURL
    (global as any).URL = {
      createObjectURL: jest.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: jest.fn()
    };
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default Chrome API responses
    mockChrome.storage.sync.get.mockResolvedValue({
      threads_credentials: { access_token: 'mock_token' } // Mock credentials
    });
    mockChrome.storage.sync.set.mockResolvedValue(undefined);
    mockChrome.tabs.query.mockResolvedValue([{
      id: 1,
      url: 'https://threads.net/test'
    }]);
  });

  afterEach(() => {
    container.remove();
  });

  describe('Settings Change Broadcasting', () => {
    test('should broadcast setting changes to all extension components', async () => {
      const newSettings: ExtensionSettings = {
        enableInlineExpansion: false,
        autoExpandReplies: true,
        maxReplyDepth: 5,
        debug: true,
        useThreadsApi: true
      };

      await settingsManager.updateSettings(newSettings);

      // Should broadcast to runtime (background script)
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SETTINGS_CHANGED',
        data: newSettings,
        timestamp: expect.any(Number)
      });

      // Should broadcast to all active tabs
      expect(mockChrome.tabs.query).toHaveBeenCalledWith({});
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        {
          type: 'SETTINGS_CHANGED',
          data: newSettings,
          timestamp: expect.any(Number)
        }
      );
    });

    test('should handle partial setting updates', async () => {
      const partialSettings = {
        enableInlineExpansion: false,
        debug: true
      };

      await settingsManager.updatePartialSettings(partialSettings);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SETTINGS_CHANGED',
        data: expect.objectContaining(partialSettings),
        timestamp: expect.any(Number)
      });
    });

    test('should register message listeners for setting changes', () => {
      settingsBroadcaster.startListening();

      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(mockChrome.storage.sync.onChanged.addListener).toHaveBeenCalled();
    });

    test('should handle broadcast failures gracefully', async () => {
      mockChrome.runtime.sendMessage.mockRejectedValue(new Error('Broadcast failed'));

      const settings: ExtensionSettings = {
        enableInlineExpansion: true,
        autoExpandReplies: false,
        maxReplyDepth: 3,
        debug: false
      };

      // Should not throw error
      await expect(settingsManager.updateSettings(settings)).resolves.not.toThrow();

      // Should still save to storage despite broadcast failure
      expect(mockChrome.storage.sync.set).toHaveBeenCalled();
    });

    test('should debounce rapid setting changes', async () => {
      // Create a spy to intercept the isTestEnvironment method
      const originalIsTest = (settingsManager as any).isTestEnvironment;
      (settingsManager as any).isTestEnvironment = () => false; // Force production mode for this test

      const rapidChanges = [
        { enableInlineExpansion: true },
        { enableInlineExpansion: false },
        { autoExpandReplies: true },
        { debug: true }
      ];

      // Fire multiple changes in quick succession
      const promises = rapidChanges.map(change => 
        settingsManager.updatePartialSettings(change)
      );
      await Promise.all(promises);

      // Wait for debounce timer
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should debounce broadcasts (less than 4 calls due to debouncing)
      expect(mockChrome.runtime.sendMessage.mock.calls.length).toBeLessThan(4);

      // Restore original method
      (settingsManager as any).isTestEnvironment = originalIsTest;
    });
  });

  describe('API vs DOM Scraping Mode Toggles', () => {
    test('should create toggle for API vs DOM scraping mode', () => {
      const toggle = settingsManager.createApiModeToggle();

      expect(toggle).toBeTruthy();
      expect(toggle.classList.contains('tf-api-mode-toggle')).toBe(true);
      expect(toggle.querySelector('.tf-toggle-label')?.textContent).toContain('Use Threads API');
      expect(toggle.querySelector('.tf-toggle-switch')).toBeTruthy();
    });

    test('should handle API mode toggle interactions', async () => {
      const toggle = settingsManager.createApiModeToggle();
      const switchElement = toggle.querySelector('.tf-toggle-switch') as HTMLElement;

      // Simulate toggle click
      switchElement.click();

      // Should update settings
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({
          threadForgeSettings: expect.objectContaining({
            useThreadsApi: true
          })
        })
      );

      // Should broadcast the change
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SETTINGS_CHANGED',
        data: expect.objectContaining({
          useThreadsApi: true
        }),
        timestamp: expect.any(Number)
      });
    });

    test('should show different modes based on setting', async () => {
      const toggle = settingsManager.createApiModeToggle();
      container.appendChild(toggle);

      // Test API mode enabled
      await settingsManager.updatePartialSettings({ useThreadsApi: true });
      expect(toggle.classList.contains('tf-api-enabled')).toBe(true);
      expect(toggle.querySelector('.tf-mode-indicator')?.textContent).toContain('API Mode');

      // Test API mode disabled
      await settingsManager.updatePartialSettings({ useThreadsApi: false });
      expect(toggle.classList.contains('tf-api-enabled')).toBe(false);
      expect(toggle.querySelector('.tf-mode-indicator')?.textContent).toContain('DOM Mode');
    });

    test('should disable API mode if credentials are missing', async () => {
      // Mock missing credentials for this specific call
      mockChrome.storage.sync.get.mockResolvedValueOnce({});

      const toggle = settingsManager.createApiModeToggle();
      container.appendChild(toggle);
      const switchElement = toggle.querySelector('.tf-toggle-switch') as HTMLElement;

      switchElement.click();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should show warning and not enable API mode
      const warning = toggle.querySelector('.tf-credentials-warning');
      expect(warning).toBeTruthy();
      expect(warning?.textContent).toContain('Please connect your Threads account first');

      expect(mockChrome.storage.sync.set).not.toHaveBeenCalledWith(
        expect.objectContaining({
          threadForgeSettings: expect.objectContaining({
            useThreadsApi: true
          })
        })
      );
    });

    test('should create additional mode-specific toggles', () => {
      const toggleGroup = settingsManager.createModeToggleGroup();

      expect(toggleGroup.classList.contains('tf-mode-toggles')).toBe(true);

      // Should have multiple toggles
      const toggles = toggleGroup.querySelectorAll('.tf-mode-toggle');
      expect(toggles.length).toBeGreaterThan(1);

      // Should include fallback options
      const fallbackToggle = toggleGroup.querySelector('.tf-fallback-toggle');
      expect(fallbackToggle).toBeTruthy();
    });
  });

  describe('Immediate Settings Application', () => {
    test('should apply settings immediately without extension restart', async () => {
      const newSettings: ExtensionSettings = {
        enableInlineExpansion: false,
        autoExpandReplies: true,
        maxReplyDepth: 8,
        debug: true
      };

      const applicationStart = Date.now();
      await settingsManager.applySettingsImmediately(newSettings);
      const applicationTime = Date.now() - applicationStart;

      // Should apply quickly (under 500ms)
      expect(applicationTime).toBeLessThan(500);

      // Should update all active components
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        expect.any(Number),
        {
          type: 'APPLY_SETTINGS_IMMEDIATELY',
          data: newSettings,
          timestamp: expect.any(Number)
        }
      );
    });

    test('should validate settings before immediate application', async () => {
      const invalidSettings = {
        enableInlineExpansion: 'invalid', // Should be boolean
        maxReplyDepth: -1 // Should be positive
      } as any;

      await expect(
        settingsManager.applySettingsImmediately(invalidSettings)
      ).rejects.toThrow('Invalid settings format');

      // Should not apply invalid settings
      expect(mockChrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'APPLY_SETTINGS_IMMEDIATELY'
        })
      );
    });

    test('should update UI elements immediately', async () => {
      const settings: ExtensionSettings = {
        enableInlineExpansion: true,
        autoExpandReplies: false,
        maxReplyDepth: 5,
        debug: true
      };

      // Create UI elements that should update
      const mockToggle = document.createElement('div');
      mockToggle.classList.add('tf-inline-toggle');
      container.appendChild(mockToggle);

      await settingsManager.applySettingsImmediately(settings);

      // Should update UI state immediately
      expect(mockToggle.classList.contains('tf-enabled')).toBe(true);
    });

    test('should handle content script communication for immediate updates', async () => {
      mockChrome.tabs.query.mockResolvedValue([
        { id: 1, url: 'https://threads.net/post/1' },
        { id: 2, url: 'https://threads.net/post/2' },
        { id: 3, url: 'https://google.com' } // Non-threads tab
      ]);

      const settings: ExtensionSettings = {
        enableInlineExpansion: true,
        autoExpandReplies: true,
        maxReplyDepth: 3,
        debug: false
      };

      await settingsManager.applySettingsImmediately(settings);

      // Should only send to Threads tabs
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(1, expect.any(Object));
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(2, expect.any(Object));
    });

    test('should track setting application success rate', async () => {
      // Setup multiple tabs with mixed success/failure
      mockChrome.tabs.query.mockResolvedValue([
        { id: 1, url: 'https://threads.net/test1' },
        { id: 2, url: 'https://threads.net/test2' }
      ]);
      
      mockChrome.tabs.sendMessage
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Tab not ready'));

      const settings: ExtensionSettings = {
        enableInlineExpansion: true,
        autoExpandReplies: false,
        maxReplyDepth: 3,
        debug: false
      };

      const result = await settingsManager.applySettingsImmediately(settings);

      expect(result.successRate).toBe(50); // 1 of 2 succeeded
      expect(result.appliedTabs).toBe(1); // One succeeded
      expect(result.totalTabs).toBe(2); // Two total tabs
    });
  });

  describe('Settings Import/Export Functionality', () => {
    test('should export current settings to JSON', async () => {
      const currentSettings: ExtensionSettings = {
        enableInlineExpansion: true,
        autoExpandReplies: false,
        maxReplyDepth: 5,
        debug: true,
        useThreadsApi: false
      };

      mockChrome.storage.sync.get.mockResolvedValue({
        threadForgeSettings: currentSettings
      });

      const exportedData = await settingsImportExport.exportSettings();

      expect(exportedData).toBeTruthy();
      expect(exportedData.settings).toEqual(currentSettings);
      expect(exportedData.metadata).toEqual({
        exportedAt: expect.any(Number),
        version: expect.any(String),
        extension: 'ThreadForge'
      });
    });

    test('should create downloadable export file', async () => {
      const exportData = await settingsImportExport.exportSettings();
      const downloadLink = await settingsImportExport.createDownloadLink(exportData);

      expect(downloadLink).toBeTruthy();
      expect(downloadLink.tagName).toBe('A');
      expect(downloadLink.download).toMatch(/threadforge-settings-\d+\.json/);
      expect(downloadLink.href).toMatch(/^blob:/);
    });

    test('should import and validate settings from JSON', async () => {
      const importData = {
        settings: {
          enableInlineExpansion: false,
          autoExpandReplies: true,
          maxReplyDepth: 10,
          debug: false,
          useThreadsApi: true
        },
        metadata: {
          exportedAt: Date.now(),
          version: '1.0.0',
          extension: 'ThreadForge'
        }
      };

      const importedSettings = await settingsImportExport.importSettings(JSON.stringify(importData));

      expect(importedSettings).toEqual(importData.settings);

      // Should save imported settings
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        threadForgeSettings: importData.settings
      });

      // Should broadcast the change
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SETTINGS_IMPORTED',
        data: importData.settings,
        timestamp: expect.any(Number)
      });
    });

    test('should validate imported settings format', async () => {
      const invalidImportData = {
        settings: {
          invalidField: 'invalid',
          maxReplyDepth: 'not_a_number'
        }
      };

      await expect(
        settingsImportExport.importSettings(JSON.stringify(invalidImportData))
      ).rejects.toThrow('Invalid settings format');
    });

    test('should handle version compatibility', async () => {
      const olderVersionData = {
        settings: {
          enableInlineExpansion: true,
          autoExpandReplies: false
          // Missing newer fields
        },
        metadata: {
          exportedAt: Date.now(),
          version: '0.5.0',
          extension: 'ThreadForge'
        }
      };

      const importedSettings = await settingsImportExport.importSettings(
        JSON.stringify(olderVersionData)
      );

      // Should merge with defaults for missing fields
      expect(importedSettings).toEqual({
        enableInlineExpansion: true,
        autoExpandReplies: false,
        maxReplyDepth: 3, // Default value
        debug: false, // Default value
        useThreadsApi: false // Default value
      });
    });

    test('should create import file selector', () => {
      const fileSelector = settingsImportExport.createImportFileSelector();

      expect(fileSelector).toBeTruthy();
      expect(fileSelector.tagName).toBe('INPUT');
      expect(fileSelector.type).toBe('file');
      expect(fileSelector.accept).toBe('.json');
      expect(fileSelector.classList.contains('tf-settings-import')).toBe(true);
    });

    test('should handle file selection and reading', async () => {
      const fileContent = JSON.stringify({
        settings: {
          enableInlineExpansion: true,
          autoExpandReplies: true,
          maxReplyDepth: 7,
          debug: true
        },
        metadata: {
          exportedAt: Date.now(),
          version: '1.0.0',
          extension: 'ThreadForge'
        }
      });

      const mockFile = new File([fileContent], 'settings.json', {
        type: 'application/json'
      });

      const importedSettings = await settingsImportExport.handleFileImport(mockFile);

      expect(importedSettings).toBeTruthy();
      expect(importedSettings.enableInlineExpansion).toBe(true);
      expect(importedSettings.maxReplyDepth).toBe(7);
    });
  });

  describe('Settings Propagation Integration', () => {
    test('should propagate settings to all extension components', async () => {
      const settings: ExtensionSettings = {
        enableInlineExpansion: true,
        autoExpandReplies: false,
        maxReplyDepth: 4,
        debug: true,
        useThreadsApi: false
      };

      await settingsBroadcaster.propagateSettings(settings);

      // Should notify background script
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SETTINGS_PROPAGATED',
        data: settings,
        targets: ['background', 'content', 'popup'],
        timestamp: expect.any(Number)
      });

      // Should notify content scripts
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalled();
    });

    test('should handle component-specific setting filters', async () => {
      const allSettings: ExtensionSettings = {
        enableInlineExpansion: true,
        autoExpandReplies: false,
        maxReplyDepth: 4,
        debug: true,
        useThreadsApi: false
      };

      // Filter settings for content scripts (exclude debug)
      const contentSettings = settingsBroadcaster.filterSettingsForComponent(
        allSettings,
        'content'
      );

      expect(contentSettings).toEqual({
        enableInlineExpansion: true,
        autoExpandReplies: false,
        maxReplyDepth: 4,
        useThreadsApi: false
        // debug field excluded
      });
    });

    test('should track propagation success across components', async () => {
      mockChrome.runtime.sendMessage.mockResolvedValue({ received: true });
      mockChrome.tabs.sendMessage.mockResolvedValue({ applied: true });

      const settings: ExtensionSettings = {
        enableInlineExpansion: false,
        autoExpandReplies: true,
        maxReplyDepth: 2,
        debug: false
      };

      const result = await settingsBroadcaster.propagateSettings(settings);

      expect(result.success).toBe(true);
      expect(result.componentsReached).toBeGreaterThan(0);
      expect(result.totalAttempts).toBeGreaterThan(0);
      expect(result.successRate).toBeGreaterThan(0);
    });

    test('should handle offline or disconnected components', async () => {
      mockChrome.runtime.sendMessage.mockRejectedValue(new Error('Context invalidated'));
      mockChrome.tabs.sendMessage.mockRejectedValue(new Error('No tab'));

      const settings: ExtensionSettings = {
        enableInlineExpansion: true,
        autoExpandReplies: true,
        maxReplyDepth: 3,
        debug: false
      };

      const result = await settingsBroadcaster.propagateSettings(settings);

      // Should handle failures gracefully
      expect(result.success).toBe(false);
      expect(result.errors).toBeTruthy();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should implement retry mechanism for failed propagation', async () => {
      let callCount = 0;
      mockChrome.tabs.sendMessage.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({ applied: true });
      });

      const settings: ExtensionSettings = {
        enableInlineExpansion: true,
        autoExpandReplies: false,
        maxReplyDepth: 5,
        debug: true
      };

      const result = await settingsBroadcaster.propagateSettingsWithRetry(settings, {
        maxRetries: 2,
        retryDelay: 10
      });

      expect(result.success).toBe(true);
      expect(callCount).toBe(2); // Initial attempt + 1 retry
    });

    test('should maintain settings synchronization across browser sessions', async () => {
      // Simulate storage change from external source
      const externalSettings: ExtensionSettings = {
        enableInlineExpansion: false,
        autoExpandReplies: true,
        maxReplyDepth: 6,
        debug: false,
        useThreadsApi: true
      };

      // Simulate chrome.storage.onChanged event
      const onChangedCallback = mockChrome.storage.sync.onChanged.addListener.mock.calls[0]?.[0];
      if (onChangedCallback) {
        onChangedCallback({
          threadForgeSettings: {
            newValue: externalSettings,
            oldValue: {}
          }
        }, 'sync');
      }

      // Should propagate external changes to components
      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SETTINGS_SYNCHRONIZED',
          data: externalSettings
        })
      );
    });
  });
});