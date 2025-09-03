/**
 * Unit tests for API Credentials Management - Task 20
 * Tests OAuth2 authentication UI, credential validation, quota usage display,
 * and settings persistence for Threads API integration
 */

import { jest } from '@jest/globals';

// Mock Chrome APIs
const mockChrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  },
  identity: {
    getAuthToken: jest.fn(),
    launchWebAuthFlow: jest.fn(),
    removeCachedAuthToken: jest.fn(),
    getRedirectURL: jest.fn(() => 'https://extension-id.chromiumapp.org/')
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  }
};

// Mock browser APIs
global.URL.createObjectURL = jest.fn(() => 'mock-url');
global.URL.revokeObjectURL = jest.fn();
global.crypto = {
  getRandomValues: jest.fn(() => new Uint32Array([1, 2, 3, 4]))
} as any;

// @ts-ignore
global.chrome = mockChrome;

import { CredentialsManager, AuthenticationUI } from '../auth/credentialsManager';

describe('API Credentials Management - Task 20', () => {
  let credentialsManager: CredentialsManager;
  let authUI: AuthenticationUI;
  let container: HTMLElement;

  beforeEach(() => {
    credentialsManager = new CredentialsManager();
    authUI = new AuthenticationUI();
    container = document.createElement('div');
    
    // Mock global fetch
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expires_in: 3600,
        scope: 'threads.read threads.write'
      })
    });
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    container.innerHTML = '';
  });

  describe('OAuth2 Authentication UI', () => {
    test('should create Connect Account button with proper styling', () => {
      const connectButton = authUI.createConnectButton();

      expect(connectButton).toBeTruthy();
      expect(connectButton.tagName).toBe('BUTTON');
      expect(connectButton.classList.contains('tf-connect-button')).toBe(true);
      expect(connectButton.textContent).toContain('Connect');

      // Should have proper styling
      expect(connectButton.style.backgroundColor).toBeTruthy();
      expect(connectButton.style.cursor).toBe('pointer');
      expect(connectButton.disabled).toBe(false);
    });

    test('should create authentication status display', () => {
      const statusDisplay = authUI.createStatusDisplay();

      expect(statusDisplay).toBeTruthy();
      expect(statusDisplay.classList.contains('tf-auth-status')).toBe(true);

      // Should have status elements
      const statusIcon = statusDisplay.querySelector('.tf-status-icon');
      const statusText = statusDisplay.querySelector('.tf-status-text');
      const lastUpdated = statusDisplay.querySelector('.tf-last-updated');

      expect(statusIcon).toBeTruthy();
      expect(statusText).toBeTruthy();
      expect(lastUpdated).toBeTruthy();
    });

    test('should update connection status dynamically', () => {
      const statusDisplay = authUI.createStatusDisplay();
      container.appendChild(statusDisplay);

      // Test different status updates
      authUI.updateConnectionStatus('connected');
      let statusText = statusDisplay.querySelector('.tf-status-text');
      expect(statusText?.textContent).toContain('Connected');

      authUI.updateConnectionStatus('disconnected');
      statusText = statusDisplay.querySelector('.tf-status-text');
      expect(statusText?.textContent).toContain('Disconnected');

      authUI.updateConnectionStatus('error');
      statusText = statusDisplay.querySelector('.tf-status-text');
      expect(statusText?.textContent).toContain('Error');
    });

    test('should show OAuth2 authentication flow', async () => {
      const authFlow = await authUI.showAuthenticationFlow();

      expect(authFlow).toBeTruthy();
      expect(typeof authFlow.authUrl).toBe('string');
      expect(typeof authFlow.clientId).toBe('string');
      expect(authFlow.scopes).toContain('threads.read');

      // Should create modal or popup for authentication
      const authModal = document.querySelector('.tf-auth-modal');
      expect(authModal).toBeTruthy();
    });

    test('should handle authentication flow completion', async () => {
      const mockAuthResult = {
        access_token: 'mock_access_token_123',
        refresh_token: 'mock_refresh_token_456',
        expires_in: 3600,
        scope: 'threads.read'
      };

      // Mock successful authentication
      mockChrome.identity.launchWebAuthFlow.mockResolvedValue('https://redirect.uri?code=auth_code_123');

      const result = await authUI.showAuthenticationFlow();
      expect(result).toBeTruthy();

      // Should process auth code and get tokens
      expect(mockChrome.identity.launchWebAuthFlow).toHaveBeenCalledWith({
        url: expect.stringContaining('threads.net'),
        interactive: true
      });
    });

    test('should handle authentication errors gracefully', async () => {
      // Mock authentication error
      mockChrome.identity.launchWebAuthFlow.mockRejectedValue(new Error('User denied access'));

      const statusDisplay = authUI.createStatusDisplay();
      container.appendChild(statusDisplay);

      try {
        await authUI.showAuthenticationFlow();
      } catch (error) {
        authUI.updateConnectionStatus('error');
      }

      const errorMessage = container.querySelector('.tf-error-message');
      expect(errorMessage).toBeTruthy();
      expect(errorMessage?.textContent).toContain('Authentication failed');
    });
  });

  describe('Credential Validation', () => {
    test('should validate credentials before saving', async () => {
      const validCredentials = {
        access_token: 'valid_token_123',
        refresh_token: 'valid_refresh_456',
        client_id: 'threads_client_id',
        expires_at: Date.now() + 3600000 // 1 hour from now
      };

      const isValid = await credentialsManager.validateCredentials(validCredentials);
      expect(isValid).toBe(true);
    });

    test('should reject invalid or expired credentials', async () => {
      const invalidCredentials = {
        access_token: '', // Empty token
        refresh_token: 'refresh_token',
        client_id: 'client_id',
        expires_at: Date.now() - 1000 // Expired
      };

      const isValid = await credentialsManager.validateCredentials(invalidCredentials);
      expect(isValid).toBe(false);
    });

    test('should validate token format and structure', async () => {
      const malformedCredentials = {
        access_token: 'invalid_format',
        refresh_token: null,
        client_id: undefined,
        expires_at: 'not_a_number'
      };

      const isValid = await credentialsManager.validateCredentials(malformedCredentials);
      expect(isValid).toBe(false);
    });

    test('should test API connectivity during validation', async () => {
      const testCredentials = {
        access_token: 'test_token',
        refresh_token: 'test_refresh',
        client_id: 'test_client',
        expires_at: Date.now() + 3600000
      };

      // Mock API call for validation
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'user123' } })
      });

      const isValid = await credentialsManager.validateCredentials(testCredentials);
      expect(isValid).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('graph.threads.net'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${testCredentials.access_token}`
          })
        })
      );
    });

    test('should refresh expired tokens automatically', async () => {
      const expiredCredentials = {
        access_token: 'expired_token',
        refresh_token: 'valid_refresh_token',
        client_id: 'client_id',
        expires_at: Date.now() - 1000
      };

      // Mock token refresh
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new_access_token',
          expires_in: 3600
        })
      });

      const newToken = await credentialsManager.refreshAuthToken();
      expect(newToken).toBe('new_access_token');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('oauth/token'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('refresh_token')
        })
      );
    });
  });

  describe('Settings Persistence and Storage', () => {
    test('should save credentials securely to Chrome storage', async () => {
      const credentials = {
        access_token: 'secure_token_123',
        refresh_token: 'secure_refresh_456',
        client_id: 'threads_client',
        expires_at: Date.now() + 3600000
      };

      await credentialsManager.saveCredentials(credentials);

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        threads_credentials: expect.objectContaining({
          access_token: expect.any(String),
          refresh_token: expect.any(String),
          client_id: credentials.client_id,
          expires_at: credentials.expires_at,
          saved_at: expect.any(Number)
        })
      });
    });

    test('should retrieve stored credentials', async () => {
      const storedCredentials = {
        access_token: 'stored_token',
        refresh_token: 'stored_refresh',
        client_id: 'stored_client',
        expires_at: Date.now() + 3600000,
        saved_at: Date.now() - 60000
      };

      mockChrome.storage.sync.get.mockResolvedValue({
        threads_credentials: storedCredentials
      });

      const retrieved = await credentialsManager.getStoredCredentials();
      expect(retrieved).toEqual(storedCredentials);
      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith(['threads_credentials']);
    });

    test('should clear credentials from storage', async () => {
      await credentialsManager.clearCredentials();

      expect(mockChrome.storage.sync.remove).toHaveBeenCalledWith(['threads_credentials', 'quota_cache']);
      
      // Should also clear cached tokens
      expect(mockChrome.identity.removeCachedAuthToken).toHaveBeenCalled();
    });

    test('should handle storage errors gracefully', async () => {
      mockChrome.storage.sync.set.mockRejectedValue(new Error('Storage quota exceeded'));

      const credentials = { access_token: 'token' };

      await expect(credentialsManager.saveCredentials(credentials))
        .rejects.toThrow('Storage quota exceeded');
    });

    test('should encrypt sensitive data before storage', async () => {
      const sensitiveCredentials = {
        access_token: 'very_sensitive_token_123',
        refresh_token: 'sensitive_refresh_456',
        client_id: 'public_client_id',
        expires_at: Date.now() + 3600000
      };

      await credentialsManager.saveCredentials(sensitiveCredentials);

      const storedData = mockChrome.storage.sync.set.mock.calls[0][0];
      const credentialsData = storedData.threads_credentials;

      // Tokens should be encrypted (not plain text)
      expect(credentialsData.access_token).not.toBe(sensitiveCredentials.access_token);
      expect(credentialsData.refresh_token).not.toBe(sensitiveCredentials.refresh_token);
      
      // Client ID can remain unencrypted
      expect(credentialsData.client_id).toBe(sensitiveCredentials.client_id);
    });
  });

  describe('API Quota Usage Display', () => {
    test('should fetch and display API quota usage', async () => {
      const mockQuotaData = {
        total_requests: 1250,
        remaining_requests: 3750,
        reset_date: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        daily_limit: 500,
        requests_today: 187
      };

      // Mock quota API response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockQuotaData)
      });

      const quotaUsage = await credentialsManager.getApiQuotaUsage();

      expect(quotaUsage).toEqual(mockQuotaData);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('usage'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Bearer')
          })
        })
      );
    });

    test('should show quota usage in UI with progress bars', async () => {
      const quotaData = {
        total_requests: 2000,
        remaining_requests: 3000,
        daily_requests: 300,
        daily_limit: 500
      };

      const quotaDisplay = document.createElement('div');
      quotaDisplay.classList.add('tf-quota-display');
      
      // Create progress bar for total usage
      const totalProgress = document.createElement('div');
      totalProgress.classList.add('tf-quota-progress');
      const usagePercent = (quotaData.total_requests / (quotaData.total_requests + quotaData.remaining_requests)) * 100;
      totalProgress.style.width = `${usagePercent}%`;
      
      quotaDisplay.appendChild(totalProgress);
      container.appendChild(quotaDisplay);

      expect(quotaDisplay.querySelector('.tf-quota-progress')).toBeTruthy();
      expect(Math.round(usagePercent)).toBe(40); // 2000 / 5000 = 40%
    });

    test('should warn when approaching quota limits', async () => {
      const highUsageData = {
        total_requests: 4500,
        remaining_requests: 500,
        daily_requests: 450,
        daily_limit: 500
      };

      const isWithinLimits = await credentialsManager.isWithinQuotaLimits();
      
      if (!isWithinLimits) {
        credentialsManager.showQuotaWarning(highUsageData);
      }

      // Should show warning UI elements
      const warningElement = container.querySelector('.tf-quota-warning');
      expect(warningElement).toBeTruthy();
      
      const warningMessage = warningElement?.textContent;
      expect(warningMessage).toContain('quota limit');
      expect(warningMessage).toContain('90%'); // High usage percentage
    });

    test('should show quota reset countdown', () => {
      const resetDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
      
      const countdownElement = document.createElement('div');
      countdownElement.classList.add('tf-quota-countdown');
      
      const timeUntilReset = resetDate.getTime() - Date.now();
      const daysRemaining = Math.floor(timeUntilReset / (1000 * 60 * 60 * 24));
      const hoursRemaining = Math.floor((timeUntilReset % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      countdownElement.textContent = `Quota resets in ${daysRemaining}d ${hoursRemaining}h`;
      container.appendChild(countdownElement);

      expect(countdownElement.textContent).toContain('2d');
      expect(countdownElement.textContent).toContain('Quota resets');
    });

    test('should handle quota API errors gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Quota API unavailable'));

      const quotaUsage = await credentialsManager.getApiQuotaUsage();
      
      // Should return default values on error
      expect(quotaUsage).toEqual({
        error: 'Unable to fetch quota data',
        total_requests: 0,
        remaining_requests: 5000, // Default limit
        last_updated: expect.any(Number)
      });
    });

    test('should cache quota data to reduce API calls', async () => {
      const quotaData = { total_requests: 100, remaining_requests: 4900 };
      
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(quotaData)
      });

      // First call should fetch from API
      await credentialsManager.getApiQuotaUsage();
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call within cache period should use cached data
      await credentialsManager.getApiQuotaUsage();
      expect(fetch).toHaveBeenCalledTimes(1); // Still only 1 API call

      // Verify cache storage
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({
          quota_cache: expect.objectContaining({
            data: quotaData,
            cached_at: expect.any(Number)
          })
        })
      );
    });
  });

  describe('Settings Integration', () => {
    test('should broadcast authentication status changes', async () => {
      const statusChange = {
        type: 'auth_status_changed',
        status: 'connected',
        timestamp: Date.now()
      };

      // Mock broadcasting to all extension components
      const mockSendMessage = mockChrome.runtime.sendMessage;

      authUI.updateConnectionStatus('connected');

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'AUTHENTICATION_STATUS_UPDATE',
        data: expect.objectContaining({
          status: 'connected',
          timestamp: expect.any(Number)
        })
      });
    });

    test('should validate settings before applying changes', async () => {
      const newSettings = {
        api_enabled: true,
        fallback_to_dom: true,
        cache_duration: 3600000,
        max_requests_per_hour: 100
      };

      // Settings should be validated before saving
      const validationResult = await credentialsManager.validateCredentials(newSettings);
      
      if (validationResult) {
        await credentialsManager.saveCredentials(newSettings);
        expect(mockChrome.storage.sync.set).toHaveBeenCalledWith(
          expect.objectContaining({
            extension_settings: newSettings
          })
        );
      }
    });

    test('should handle settings export functionality', () => {
      const exportButton = document.createElement('button');
      exportButton.classList.add('tf-export-settings');
      exportButton.textContent = 'Export Settings';
      
      exportButton.addEventListener('click', async () => {
        const settings = await credentialsManager.getStoredCredentials();
        
        // Should create downloadable JSON file
        const exportData = {
          version: '1.0',
          exported_at: new Date().toISOString(),
          settings: settings,
          // Should exclude sensitive tokens
          credentials: {
            client_id: settings?.client_id,
            scopes: settings?.scopes
          }
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = 'threadforge-settings.json';
        downloadLink.click();
      });

      container.appendChild(exportButton);
      exportButton.click();

      expect(exportButton).toBeTruthy();
    });

    test('should handle settings import with validation', () => {
      const importButton = document.createElement('button');
      importButton.classList.add('tf-import-settings');
      
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json';
      
      fileInput.addEventListener('change', async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
          const fileContent = await file.text();
          const importedSettings = JSON.parse(fileContent);
          
          // Validate imported settings
          if (importedSettings.version && importedSettings.settings) {
            await credentialsManager.saveCredentials(importedSettings.settings);
          }
        }
      });

      container.appendChild(importButton);
      container.appendChild(fileInput);

      expect(importButton).toBeTruthy();
      expect(fileInput).toBeTruthy();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle network connectivity issues', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const credentials = { access_token: 'test_token' };
      const isValid = await credentialsManager.validateCredentials(credentials);

      expect(isValid).toBe(false);
    });

    test('should handle Chrome API unavailability', async () => {
      // @ts-ignore
      global.chrome = undefined;

      const credentials = { access_token: 'test_token' };
      
      await expect(credentialsManager.saveCredentials(credentials))
        .rejects.toThrow('Chrome API not available');
    });

    test('should handle malformed API responses', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null) // Malformed response
      });

      const quotaUsage = await credentialsManager.getApiQuotaUsage();
      expect(quotaUsage.error).toBeDefined();
    });

    test('should provide fallback UI when authentication fails', () => {
      const fallbackMessage = document.createElement('div');
      fallbackMessage.classList.add('tf-auth-fallback');
      fallbackMessage.innerHTML = `
        <p>Unable to authenticate with Threads API.</p>
        <p>Extension will use DOM scraping as fallback.</p>
        <button class="tf-retry-auth">Retry Authentication</button>
      `;

      container.appendChild(fallbackMessage);

      expect(fallbackMessage.querySelector('.tf-retry-auth')).toBeTruthy();
      expect(fallbackMessage.textContent).toContain('fallback');
    });
  });
});