/**
 * Tests for OAuth2 Authentication Service
 * Requirements: 2.1 (authentication), 2.2 (credential management), 2.5 (security)
 */

import { OAuth2AuthenticationService } from '../auth/oauth2Service';
import { AuthenticationContext, OAuth2Config, AuthenticationResult, AuthenticationStatus } from '../auth/types';

// Mock Chrome APIs
const mockChromeIdentity = {
  launchWebAuthFlow: jest.fn(),
};

const mockChromeStorage = {
  sync: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
};

const mockChromeRuntime = {
  sendMessage: jest.fn(),
};

// Setup global mocks
(global as any).chrome = {
  identity: mockChromeIdentity,
  storage: mockChromeStorage,
  runtime: mockChromeRuntime,
};

describe('OAuth2AuthenticationService', () => {
  let authService: OAuth2AuthenticationService;
  let mockConfig: OAuth2Config;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChromeRuntime.sendMessage.mockClear();
    
    mockConfig = {
      clientId: 'test_client_id',
      scopes: ['threads_basic', 'threads_content_publish', 'threads_read_replies'],
      redirectUri: 'https://test.example.com/callback',
      authUrl: 'https://graph.threads.net/oauth/authorize',
      tokenUrl: 'https://graph.threads.net/oauth/access_token'
    };
    
    authService = new OAuth2AuthenticationService(mockConfig);
  });

  describe('Constructor', () => {
    test('should initialize with provided OAuth2 config', () => {
      expect(authService).toBeDefined();
      expect(authService['config']).toEqual(mockConfig);
    });

    test('should throw error for invalid config', () => {
      const invalidConfig = { ...mockConfig, clientId: '' };
      expect(() => new OAuth2AuthenticationService(invalidConfig)).toThrow('Client ID is required');
    });

    test('should throw error for empty scopes', () => {
      const invalidConfig = { ...mockConfig, scopes: [] };
      expect(() => new OAuth2AuthenticationService(invalidConfig)).toThrow('At least one scope is required');
    });
  });

  describe('authenticate()', () => {
    test('should successfully authenticate and return access token', async () => {
      const mockAuthUrl = 'https://graph.threads.net/oauth/authorize?client_id=test_client_id&redirect_uri=https%3A%2F%2Ftest.example.com%2Fcallback&scope=threads_basic%2Cthreads_content_publish%2Cthreads_read_replies&response_type=code';
      const mockRedirectUrl = 'https://test.example.com/callback?code=auth_code_123';
      
      mockChromeIdentity.launchWebAuthFlow.mockResolvedValue(mockRedirectUrl);
      
      // Mock token exchange
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'access_token_123',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'refresh_token_123',
          scope: 'threads_basic threads_content_publish threads_read_replies'
        })
      });

      mockChromeStorage.sync.set.mockResolvedValue(undefined);

      const result: AuthenticationResult = await authService.authenticate();

      expect(result.success).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context!.accessToken).toBe('access_token_123');
      expect(result.context!.refreshToken).toBe('refresh_token_123');
      expect(result.context!.scopes).toEqual(['threads_basic', 'threads_content_publish', 'threads_read_replies']);
      expect(mockChromeIdentity.launchWebAuthFlow).toHaveBeenCalledWith({
        url: mockAuthUrl,
        interactive: true
      });
    });

    test('should handle user cancellation during OAuth flow', async () => {
      mockChromeIdentity.launchWebAuthFlow.mockRejectedValue(new Error('User cancelled'));

      const result: AuthenticationResult = await authService.authenticate();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('USER_CANCELLED');
      expect(result.error!.message).toBe('Authentication was cancelled by the user');
    });

    test('should handle network errors during token exchange', async () => {
      const mockRedirectUrl = 'https://test.example.com/callback?code=auth_code_123';
      mockChromeIdentity.launchWebAuthFlow.mockResolvedValue(mockRedirectUrl);

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result: AuthenticationResult = await authService.authenticate();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('NETWORK_ERROR');
      expect(result.error!.message).toBe('Failed to exchange authorization code for tokens');
    });

    test('should handle API errors during token exchange', async () => {
      const mockRedirectUrl = 'https://test.example.com/callback?code=auth_code_123';
      mockChromeIdentity.launchWebAuthFlow.mockResolvedValue(mockRedirectUrl);

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'invalid_grant',
          error_description: 'Authorization code is invalid or expired'
        })
      });

      const result: AuthenticationResult = await authService.authenticate();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('INVALID_GRANT');
      expect(result.error!.message).toBe('Authorization code is invalid or expired');
    });
  });

  describe('Token Storage Methods', () => {
    const mockContext: AuthenticationContext = {
      accessToken: 'access_token_123',
      refreshToken: 'refresh_token_123',
      expiresAt: new Date(Date.now() + 3600000),
      scopes: ['threads_basic', 'threads_content_publish'],
      userId: 'user_123'
    };

    test('should store authentication context successfully', async () => {
      mockChromeStorage.sync.set.mockResolvedValue(undefined);

      await authService.storeAuthContext(mockContext);

      expect(mockChromeStorage.sync.set).toHaveBeenCalledWith({
        'threadforge_auth_context': {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_123',
          expiresAt: mockContext.expiresAt.toISOString(),
          scopes: ['threads_basic', 'threads_content_publish'],
          userId: 'user_123'
        }
      });
    });

    test('should retrieve stored authentication context', async () => {
      const storedData = {
        threadforge_auth_context: {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_123',
          expiresAt: mockContext.expiresAt.toISOString(),
          scopes: ['threads_basic', 'threads_content_publish'],
          userId: 'user_123'
        }
      };

      mockChromeStorage.sync.get.mockResolvedValue(storedData);

      const retrievedContext = await authService.getStoredAuthContext();

      expect(retrievedContext).toBeDefined();
      expect(retrievedContext!.accessToken).toBe('access_token_123');
      expect(retrievedContext!.userId).toBe('user_123');
      expect(retrievedContext!.expiresAt).toEqual(mockContext.expiresAt);
    });

    test('should return null when no stored context exists', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({});

      const retrievedContext = await authService.getStoredAuthContext();

      expect(retrievedContext).toBeNull();
    });

    test('should clear stored authentication context', async () => {
      mockChromeStorage.sync.remove.mockResolvedValue(undefined);

      await authService.clearStoredAuthContext();

      expect(mockChromeStorage.sync.remove).toHaveBeenCalledWith(['threadforge_auth_context']);
    });

    test('should handle storage errors gracefully', async () => {
      mockChromeStorage.sync.set.mockRejectedValue(new Error('Storage quota exceeded'));

      await expect(authService.storeAuthContext(mockContext)).rejects.toThrow('Failed to store authentication context');
    });
  });

  describe('validateCredentials()', () => {
    test('should validate valid access token successfully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'user_123',
          username: 'testuser',
          scopes: ['threads_basic', 'threads_content_publish']
        })
      });

      const isValid = await authService.validateCredentials('valid_access_token');

      expect(isValid).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://graph.threads.net/v1.0/me', {
        headers: {
          'Authorization': 'Bearer valid_access_token'
        }
      });
    });

    test('should return false for invalid access token', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'invalid_token',
          error_description: 'The access token provided is invalid'
        })
      });

      const isValid = await authService.validateCredentials('invalid_token');

      expect(isValid).toBe(false);
    });

    test('should handle network errors during validation', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const isValid = await authService.validateCredentials('some_token');

      expect(isValid).toBe(false);
    });

    test('should throw error for empty token', async () => {
      await expect(authService.validateCredentials('')).rejects.toThrow('Access token is required');
    });
  });

  describe('Authentication Status', () => {
    test('should return correct authentication status when user is authenticated', async () => {
      const mockContext: AuthenticationContext = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        scopes: ['threads_basic'],
        userId: 'user_123'
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        threadforge_auth_context: {
          ...mockContext,
          expiresAt: mockContext.expiresAt.toISOString()
        }
      });

      const status: AuthenticationStatus = await authService.getAuthStatus();

      expect(status.isAuthenticated).toBe(true);
      expect(status.userId).toBe('user_123');
      expect(status.scopes).toEqual(['threads_basic']);
      expect(status.needsRefresh).toBe(false);
    });

    test('should return needs refresh when token is near expiration', async () => {
      const mockContext: AuthenticationContext = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        expiresAt: new Date(Date.now() + 300000), // 5 minutes from now (needs refresh)
        scopes: ['threads_basic'],
        userId: 'user_123'
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        threadforge_auth_context: {
          ...mockContext,
          expiresAt: mockContext.expiresAt.toISOString()
        }
      });

      const status: AuthenticationStatus = await authService.getAuthStatus();

      expect(status.isAuthenticated).toBe(true);
      expect(status.needsRefresh).toBe(true);
    });

    test('should return not authenticated when no stored context', async () => {
      mockChromeStorage.sync.get.mockResolvedValue({});

      const status: AuthenticationStatus = await authService.getAuthStatus();

      expect(status.isAuthenticated).toBe(false);
      expect(status.needsRefresh).toBe(false);
    });

    test('should return not authenticated when token is expired', async () => {
      const mockContext: AuthenticationContext = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago (expired)
        scopes: ['threads_basic'],
        userId: 'user_123'
      };

      mockChromeStorage.sync.get.mockResolvedValue({
        threadforge_auth_context: {
          ...mockContext,
          expiresAt: mockContext.expiresAt.toISOString()
        }
      });

      const status: AuthenticationStatus = await authService.getAuthStatus();

      expect(status.isAuthenticated).toBe(false);
      expect(status.needsRefresh).toBe(false);
    });
  });

  describe('Token Refresh and Lifecycle Management', () => {
    describe('refreshTokens()', () => {
      test('should successfully refresh tokens with valid refresh token', async () => {
        const mockRefreshToken = 'refresh_token_123';
        
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'new_access_token_456',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'new_refresh_token_456',
            scope: 'threads_basic threads_content_publish'
          })
        });

        mockChromeStorage.sync.set.mockResolvedValue(undefined);

        const result = await authService.refreshTokens(mockRefreshToken);

        expect(result.success).toBe(true);
        expect(result.context).toBeDefined();
        expect(result.context!.accessToken).toBe('new_access_token_456');
        expect(result.context!.refreshToken).toBe('new_refresh_token_456');
        
        expect(global.fetch).toHaveBeenCalledWith('https://graph.threads.net/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: 'client_id=test_client_id&grant_type=refresh_token&refresh_token=refresh_token_123'
        });
      });

      test('should handle invalid refresh token error', async () => {
        const mockRefreshToken = 'invalid_refresh_token';
        
        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: () => Promise.resolve({
            error: 'invalid_grant',
            error_description: 'Refresh token is invalid or expired'
          })
        });

        const result = await authService.refreshTokens(mockRefreshToken);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe('INVALID_GRANT');
        expect(result.error!.message).toBe('Refresh token is invalid or expired');
      });

      test('should handle network errors during token refresh', async () => {
        const mockRefreshToken = 'refresh_token_123';
        
        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        const result = await authService.refreshTokens(mockRefreshToken);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe('NETWORK_ERROR');
        expect(result.error!.message).toBe('Failed to refresh access token');
      });

      test('should throw error for empty refresh token', async () => {
        await expect(authService.refreshTokens('')).rejects.toThrow('Refresh token is required');
      });
    });

    describe('automaticTokenRefresh()', () => {
      test('should automatically refresh token when near expiration', async () => {
        const nearExpirationContext: AuthenticationContext = {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_123',
          expiresAt: new Date(Date.now() + 300000), // 5 minutes from now (needs refresh)
          scopes: ['threads_basic'],
          userId: 'user_123'
        };

        mockChromeStorage.sync.get.mockResolvedValue({
          threadforge_auth_context: {
            ...nearExpirationContext,
            expiresAt: nearExpirationContext.expiresAt.toISOString()
          }
        });

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'new_access_token_456',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'new_refresh_token_456',
            scope: 'threads_basic'
          })
        });

        mockChromeStorage.sync.set.mockResolvedValue(undefined);

        const result = await authService.automaticTokenRefresh();

        expect(result.success).toBe(true);
        expect(result.context).toBeDefined();
        expect(result.context!.accessToken).toBe('new_access_token_456');
      });

      test('should not refresh token when not near expiration', async () => {
        const validContext: AuthenticationContext = {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_123',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now (no refresh needed)
          scopes: ['threads_basic'],
          userId: 'user_123'
        };

        mockChromeStorage.sync.get.mockResolvedValue({
          threadforge_auth_context: {
            ...validContext,
            expiresAt: validContext.expiresAt.toISOString()
          }
        });

        const result = await authService.automaticTokenRefresh();

        expect(result.success).toBe(true);
        expect(result.context).toBeDefined();
        expect(result.context!.accessToken).toBe('access_token_123'); // No change
        expect(global.fetch).not.toHaveBeenCalled(); // No refresh call made
      });

      test('should handle case when no stored context exists', async () => {
        mockChromeStorage.sync.get.mockResolvedValue({});

        const result = await authService.automaticTokenRefresh();

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe('NO_STORED_CONTEXT');
        expect(result.error!.message).toBe('No authentication context found');
      });
    });

    describe('revokeAccess()', () => {
      test('should successfully revoke access token', async () => {
        const mockAccessToken = 'access_token_123';

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            success: true
          })
        });

        mockChromeStorage.sync.remove.mockResolvedValue(undefined);

        const result = await authService.revokeAccess(mockAccessToken);

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith('https://graph.threads.net/oauth/access_token', {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer access_token_123',
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        expect(mockChromeStorage.sync.remove).toHaveBeenCalledWith(['threadforge_auth_context']);
      });

      test('should handle revocation API errors gracefully', async () => {
        const mockAccessToken = 'access_token_123';

        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: () => Promise.resolve({
            error: 'invalid_token',
            error_description: 'Token is invalid'
          })
        });

        mockChromeStorage.sync.remove.mockResolvedValue(undefined);

        const result = await authService.revokeAccess(mockAccessToken);

        expect(result.success).toBe(true); // Should still clear local storage
        expect(mockChromeStorage.sync.remove).toHaveBeenCalledWith(['threadforge_auth_context']);
      });

      test('should handle network errors during revocation', async () => {
        const mockAccessToken = 'access_token_123';

        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
        mockChromeStorage.sync.remove.mockResolvedValue(undefined);

        const result = await authService.revokeAccess(mockAccessToken);

        expect(result.success).toBe(true); // Should still clear local storage
        expect(mockChromeStorage.sync.remove).toHaveBeenCalledWith(['threadforge_auth_context']);
      });

      test('should revoke with stored context when no token provided', async () => {
        const storedContext: AuthenticationContext = {
          accessToken: 'stored_access_token',
          refreshToken: 'refresh_token_123',
          expiresAt: new Date(Date.now() + 3600000),
          scopes: ['threads_basic'],
          userId: 'user_123'
        };

        mockChromeStorage.sync.get.mockResolvedValue({
          threadforge_auth_context: {
            ...storedContext,
            expiresAt: storedContext.expiresAt.toISOString()
          }
        });

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });

        mockChromeStorage.sync.remove.mockResolvedValue(undefined);

        const result = await authService.revokeAccess();

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith('https://graph.threads.net/oauth/access_token', {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer stored_access_token',
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
      });
    });

    describe('Token Expiration Management', () => {
      test('should check if token needs refresh with custom buffer time', () => {
        const customBufferMs = 20 * 60 * 1000; // 20 minutes
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
        
        const needsRefresh = authService.doesTokenNeedRefresh(expiresAt, customBufferMs);
        
        expect(needsRefresh).toBe(true);
      });

      test('should return false when token does not need refresh', () => {
        const customBufferMs = 10 * 60 * 1000; // 10 minutes
        const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes from now
        
        const needsRefresh = authService.doesTokenNeedRefresh(expiresAt, customBufferMs);
        
        expect(needsRefresh).toBe(false);
      });

      test('should return true for already expired token', () => {
        const expiresAt = new Date(Date.now() - 60000); // 1 minute ago (expired)
        
        const needsRefresh = authService.doesTokenNeedRefresh(expiresAt);
        
        expect(needsRefresh).toBe(true);
      });
    });

    describe('Background Token Refresh Scheduling', () => {
      test('should schedule background refresh when token needs it', async () => {
        const nearExpirationContext: AuthenticationContext = {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_123',
          expiresAt: new Date(Date.now() + 300000), // 5 minutes from now
          scopes: ['threads_basic'],
          userId: 'user_123'
        };

        mockChromeStorage.sync.get.mockResolvedValue({
          threadforge_auth_context: {
            ...nearExpirationContext,
            expiresAt: nearExpirationContext.expiresAt.toISOString()
          }
        });

        // Mock the alarm API
        const mockAlarms = {
          create: jest.fn(),
          clear: jest.fn()
        };
        (global as any).chrome.alarms = mockAlarms;

        await authService.scheduleBackgroundRefresh();

        expect(mockAlarms.create).toHaveBeenCalledWith('tokenRefresh', {
          delayInMinutes: expect.any(Number)
        });
      });

      test('should not schedule refresh when token is valid', async () => {
        const validContext: AuthenticationContext = {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_123',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
          scopes: ['threads_basic'],
          userId: 'user_123'
        };

        mockChromeStorage.sync.get.mockResolvedValue({
          threadforge_auth_context: {
            ...validContext,
            expiresAt: validContext.expiresAt.toISOString()
          }
        });

        const mockAlarms = {
          create: jest.fn(),
          clear: jest.fn()
        };
        (global as any).chrome.alarms = mockAlarms;

        await authService.scheduleBackgroundRefresh();

        expect(mockAlarms.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('Enhanced Authentication Status Management', () => {
    describe('isAuthenticated() convenience method', () => {
      test('should return true when user is authenticated', async () => {
        const mockContext: AuthenticationContext = {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_123',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
          scopes: ['threads_basic'],
          userId: 'user_123'
        };

        mockChromeStorage.sync.get.mockResolvedValue({
          threadforge_auth_context: {
            ...mockContext,
            expiresAt: mockContext.expiresAt.toISOString()
          }
        });

        const isAuthenticated = await authService.isAuthenticated();

        expect(isAuthenticated).toBe(true);
      });

      test('should return false when user is not authenticated', async () => {
        mockChromeStorage.sync.get.mockResolvedValue({});

        const isAuthenticated = await authService.isAuthenticated();

        expect(isAuthenticated).toBe(false);
      });

      test('should return false when token is expired', async () => {
        const expiredContext: AuthenticationContext = {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_123',
          expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
          scopes: ['threads_basic'],
          userId: 'user_123'
        };

        mockChromeStorage.sync.get.mockResolvedValue({
          threadforge_auth_context: {
            ...expiredContext,
            expiresAt: expiredContext.expiresAt.toISOString()
          }
        });

        const isAuthenticated = await authService.isAuthenticated();

        expect(isAuthenticated).toBe(false);
      });
    });

    describe('Authentication Event Broadcasting', () => {
      test('should broadcast authentication success event', async () => {
        const mockEventListener = jest.fn();
        
        authService.onAuthenticationChange(mockEventListener);

        const mockRedirectUrl = 'https://test.example.com/callback?code=auth_code_123';
        mockChromeIdentity.launchWebAuthFlow.mockResolvedValue(mockRedirectUrl);

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'access_token_123',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'refresh_token_123',
            scope: 'threads_basic'
          })
        });

        mockChromeStorage.sync.set.mockResolvedValue(undefined);

        await authService.authenticate();

        expect(mockEventListener).toHaveBeenCalledWith({
          type: 'AUTHENTICATION_SUCCESS',
          isAuthenticated: true,
          userId: expect.any(String),
          scopes: ['threads_basic']
        });
      });

      test('should broadcast authentication failure event', async () => {
        const mockEventListener = jest.fn();
        
        authService.onAuthenticationChange(mockEventListener);

        mockChromeIdentity.launchWebAuthFlow.mockRejectedValue(new Error('User cancelled'));

        await authService.authenticate();

        expect(mockEventListener).toHaveBeenCalledWith({
          type: 'AUTHENTICATION_FAILED',
          isAuthenticated: false,
          error: {
            code: 'USER_CANCELLED',
            message: 'Authentication was cancelled by the user'
          }
        });
      });

      test('should broadcast token refresh event', async () => {
        const mockEventListener = jest.fn();
        
        authService.onAuthenticationChange(mockEventListener);

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'new_access_token_456',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'new_refresh_token_456',
            scope: 'threads_basic'
          })
        });

        mockChromeStorage.sync.set.mockResolvedValue(undefined);

        await authService.refreshTokens('refresh_token_123');

        expect(mockEventListener).toHaveBeenCalledWith({
          type: 'TOKEN_REFRESHED',
          isAuthenticated: true,
          userId: expect.any(String),
          scopes: ['threads_basic']
        });
      });

      test('should broadcast sign out event', async () => {
        const mockEventListener = jest.fn();
        
        authService.onAuthenticationChange(mockEventListener);

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ success: true })
        });

        mockChromeStorage.sync.remove.mockResolvedValue(undefined);

        await authService.revokeAccess('access_token_123');

        expect(mockEventListener).toHaveBeenCalledWith({
          type: 'SIGNED_OUT',
          isAuthenticated: false
        });
      });
    });

    describe('Authentication Retry Logic', () => {
      test('should retry authentication on network failure with exponential backoff', async () => {
        const mockRedirectUrl = 'https://test.example.com/callback?code=auth_code_123';
        mockChromeIdentity.launchWebAuthFlow.mockResolvedValue(mockRedirectUrl);

        // First call fails with network error, second succeeds
        global.fetch = jest.fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              access_token: 'access_token_123',
              token_type: 'Bearer',
              expires_in: 3600,
              refresh_token: 'refresh_token_123',
              scope: 'threads_basic'
            })
          });

        mockChromeStorage.sync.set.mockResolvedValue(undefined);

        const result = await authService.authenticateWithRetry({
          maxRetries: 2,
          initialDelayMs: 100
        });

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(result.context).toBeDefined();
        expect(result.context!.accessToken).toBe('access_token_123');
      });

      test('should fail after maximum retry attempts', async () => {
        const mockRedirectUrl = 'https://test.example.com/callback?code=auth_code_123';
        mockChromeIdentity.launchWebAuthFlow.mockResolvedValue(mockRedirectUrl);

        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        const result = await authService.authenticateWithRetry({
          maxRetries: 2,
          initialDelayMs: 100
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe('MAX_RETRIES_EXCEEDED');
        expect(result.error!.message).toBe('Authentication failed after 2 retry attempts');
      });

      test('should not retry on user cancellation', async () => {
        mockChromeIdentity.launchWebAuthFlow.mockRejectedValue(new Error('User cancelled'));

        const result = await authService.authenticateWithRetry({
          maxRetries: 3,
          initialDelayMs: 100
        });

        expect(result.success).toBe(false);
        expect(result.error!.code).toBe('USER_CANCELLED');
        expect(mockChromeIdentity.launchWebAuthFlow).toHaveBeenCalledTimes(1); // No retries
      });

      test('should use exponential backoff with jitter', async () => {
        const mockRedirectUrl = 'https://test.example.com/callback?code=auth_code_123';
        mockChromeIdentity.launchWebAuthFlow.mockResolvedValue(mockRedirectUrl);

        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        const startTime = Date.now();
        await authService.authenticateWithRetry({
          maxRetries: 2,
          initialDelayMs: 100
        });
        const endTime = Date.now();

        // Should take at least 100ms + 200ms for two retries
        expect(endTime - startTime).toBeGreaterThan(250);
      });
    });

    describe('Enhanced Error Handling', () => {
      test('should provide user-friendly error messages for common scenarios', () => {
        expect(authService.getErrorMessage('USER_CANCELLED')).toBe(
          'Authentication was cancelled. Please try again when ready to connect your account.'
        );

        expect(authService.getErrorMessage('NETWORK_ERROR')).toBe(
          'Unable to connect to Threads. Please check your internet connection and try again.'
        );

        expect(authService.getErrorMessage('INVALID_GRANT')).toBe(
          'Your authentication session has expired. Please sign in again.'
        );

        expect(authService.getErrorMessage('INVALID_CLIENT')).toBe(
          'There\'s an issue with the app configuration. Please contact support.'
        );

        expect(authService.getErrorMessage('UNKNOWN_ERROR')).toBe(
          'An unexpected error occurred. Please try again or contact support if the problem persists.'
        );
      });

      test('should categorize errors by severity', () => {
        expect(authService.getErrorSeverity('USER_CANCELLED')).toBe('info');
        expect(authService.getErrorSeverity('NETWORK_ERROR')).toBe('warning');
        expect(authService.getErrorSeverity('INVALID_GRANT')).toBe('error');
        expect(authService.getErrorSeverity('INVALID_CLIENT')).toBe('error');
        expect(authService.getErrorSeverity('UNKNOWN_ERROR')).toBe('error');
      });

      test('should provide recovery suggestions for different error types', () => {
        expect(authService.getRecoverySuggestion('USER_CANCELLED')).toBe(
          'Click the "Connect Account" button when you\'re ready to authenticate.'
        );

        expect(authService.getRecoverySuggestion('NETWORK_ERROR')).toBe(
          'Check your internet connection and try again in a moment.'
        );

        expect(authService.getRecoverySuggestion('INVALID_GRANT')).toBe(
          'Please sign out and sign in again to refresh your authentication.'
        );

        expect(authService.getRecoverySuggestion('INVALID_CLIENT')).toBe(
          'Please update the extension or contact support for assistance.'
        );
      });
    });

    describe('Authentication State Monitoring', () => {
      test('should start monitoring authentication status changes', async () => {
        const mockMonitorCallback = jest.fn();
        
        await authService.startAuthenticationMonitoring(mockMonitorCallback);
        
        // Verify that monitoring is active
        expect(authService.isMonitoring()).toBe(true);
      });

      test('should stop monitoring authentication status changes', async () => {
        const mockMonitorCallback = jest.fn();
        
        await authService.startAuthenticationMonitoring(mockMonitorCallback);
        expect(authService.isMonitoring()).toBe(true);
        
        authService.stopAuthenticationMonitoring();
        expect(authService.isMonitoring()).toBe(false);
      });

      test('should detect token expiration and trigger refresh', async () => {
        const mockMonitorCallback = jest.fn();
        const nearExpirationContext: AuthenticationContext = {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_123',
          expiresAt: new Date(Date.now() + 300000), // 5 minutes from now
          scopes: ['threads_basic'],
          userId: 'user_123'
        };

        mockChromeStorage.sync.get.mockResolvedValue({
          threadforge_auth_context: {
            ...nearExpirationContext,
            expiresAt: nearExpirationContext.expiresAt.toISOString()
          }
        });

        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'new_access_token_456',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'new_refresh_token_456',
            scope: 'threads_basic'
          })
        });

        mockChromeStorage.sync.set.mockResolvedValue(undefined);

        await authService.startAuthenticationMonitoring(mockMonitorCallback);

        // Trigger monitoring check
        await authService.checkAuthenticationStatus();

        expect(mockMonitorCallback).toHaveBeenCalledWith({
          type: 'TOKEN_REFRESH_NEEDED',
          isAuthenticated: true,
          userId: 'user_123',
          scopes: ['threads_basic'],
          needsRefresh: true
        });
      });
    });
  });
});