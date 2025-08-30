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

// Setup global mocks
(global as any).chrome = {
  identity: mockChromeIdentity,
  storage: mockChromeStorage,
};

describe('OAuth2AuthenticationService', () => {
  let authService: OAuth2AuthenticationService;
  let mockConfig: OAuth2Config;

  beforeEach(() => {
    jest.clearAllMocks();
    
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
});