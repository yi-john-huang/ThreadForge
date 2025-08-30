/**
 * OAuth2 Authentication Service for Threads API Integration
 * Handles authentication flow, token management, and credential validation
 * Requirements: 2.1 (authentication), 2.2 (credential management), 2.5 (security)
 */

import { 
  AuthenticationContext, 
  OAuth2Config, 
  AuthenticationResult, 
  AuthenticationStatus,
  TokenRefreshResponse,
  AuthenticationEvent,
  AuthenticationEventListener,
  RetryConfig,
  ErrorSeverity
} from './types';

export class OAuth2AuthenticationService {
  private config: OAuth2Config;
  private readonly STORAGE_KEY = 'threadforge_auth_context';
  private readonly TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000; // 10 minutes
  private eventListeners: AuthenticationEventListener[] = [];
  private monitoringActive = false;
  private monitoringInterval?: number;

  constructor(config: OAuth2Config) {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validate OAuth2 configuration
   */
  private validateConfig(config: OAuth2Config): void {
    if (!config.clientId || config.clientId.trim() === '') {
      throw new Error('Client ID is required');
    }
    if (!config.scopes || config.scopes.length === 0) {
      throw new Error('At least one scope is required');
    }
    if (!config.redirectUri || config.redirectUri.trim() === '') {
      throw new Error('Redirect URI is required');
    }
  }


  /**
   * Launch Chrome Identity web auth flow
   */
  private async launchAuthFlow(): Promise<string> {
    const authUrl = this.buildAuthUrl();
    
    try {
      const redirectUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });
      
      if (!redirectUrl) {
        throw new Error('USER_CANCELLED');
      }
      
      return this.extractAuthCode(redirectUrl);
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        throw new Error('USER_CANCELLED');
      }
      throw error;
    }
  }

  /**
   * Build OAuth2 authorization URL
   */
  private buildAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(','),
      response_type: 'code'
    });

    const baseUrl = this.config.authUrl || 'https://graph.threads.net/oauth/authorize';
    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Extract authorization code from redirect URL
   */
  private extractAuthCode(redirectUrl: string): string {
    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');
    
    if (!code) {
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');
      throw new Error(`OAuth error: ${error} - ${errorDescription}`);
    }
    
    return code;
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(authCode: string): Promise<TokenRefreshResponse> {
    const tokenUrl = this.config.tokenUrl || 'https://graph.threads.net/oauth/access_token';
    
    const requestBody = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      code: authCode,
      grant_type: 'authorization_code'
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: requestBody.toString()
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`TOKEN_EXCHANGE_ERROR: ${errorData.error} - ${errorData.error_description || 'Unknown error'}`);
      }

      return await response.json();
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('TOKEN_EXCHANGE_ERROR')) {
        throw error;
      }
      throw new Error('NETWORK_ERROR');
    }
  }

  /**
   * Create authentication context from token response
   */
  private createAuthContext(tokenResponse: TokenRefreshResponse): AuthenticationContext {
    const expiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));
    const scopes = tokenResponse.scope.split(' ');
    
    // For now, we'll use a placeholder userId - this would be fetched from user info endpoint
    const userId = 'user_' + Date.now(); // TODO: Fetch actual user ID from /me endpoint
    
    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || '',
      expiresAt,
      scopes,
      userId
    };
  }

  /**
   * Store authentication context in Chrome storage
   * Requirements: 2.2 (credential management)
   */
  async storeAuthContext(context: AuthenticationContext): Promise<void> {
    try {
      const storageData = {
        [this.STORAGE_KEY]: {
          accessToken: context.accessToken,
          refreshToken: context.refreshToken,
          expiresAt: context.expiresAt.toISOString(),
          scopes: context.scopes,
          userId: context.userId
        }
      };
      
      await chrome.storage.sync.set(storageData);
      
    } catch (error) {
      throw new Error('Failed to store authentication context');
    }
  }

  /**
   * Retrieve stored authentication context
   */
  async getStoredAuthContext(): Promise<AuthenticationContext | null> {
    try {
      const result = await chrome.storage.sync.get([this.STORAGE_KEY]);
      const storedData = result[this.STORAGE_KEY];
      
      if (!storedData) {
        return null;
      }
      
      return {
        accessToken: storedData.accessToken,
        refreshToken: storedData.refreshToken,
        expiresAt: new Date(storedData.expiresAt),
        scopes: storedData.scopes,
        userId: storedData.userId
      };
      
    } catch (error) {
      console.error('Failed to retrieve stored authentication context:', error);
      return null;
    }
  }

  /**
   * Clear stored authentication context
   */
  async clearStoredAuthContext(): Promise<void> {
    try {
      await chrome.storage.sync.remove([this.STORAGE_KEY]);
    } catch (error) {
      console.error('Failed to clear stored authentication context:', error);
    }
  }

  /**
   * Validate access token by making a test API request
   * Requirements: 2.1 (authentication), 2.5 (security)
   */
  async validateCredentials(accessToken: string): Promise<boolean> {
    if (!accessToken || accessToken.trim() === '') {
      throw new Error('Access token is required');
    }
    
    try {
      const response = await fetch('https://graph.threads.net/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      return response.ok;
      
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  /**
   * Get current authentication status
   * Requirements: 2.1 (authentication status)
   */
  async getAuthStatus(): Promise<AuthenticationStatus> {
    const context = await this.getStoredAuthContext();
    
    if (!context) {
      return {
        isAuthenticated: false,
        needsRefresh: false
      };
    }
    
    const now = new Date();
    const isExpired = context.expiresAt <= now;
    const needsRefresh = (context.expiresAt.getTime() - now.getTime()) < this.TOKEN_REFRESH_BUFFER_MS;
    
    if (isExpired) {
      return {
        isAuthenticated: false,
        needsRefresh: false
      };
    }
    
    return {
      isAuthenticated: true,
      userId: context.userId,
      scopes: context.scopes,
      expiresAt: context.expiresAt,
      needsRefresh
    };
  }


  /**
   * Exchange refresh token for new access tokens
   */
  private async exchangeRefreshTokenForTokens(refreshToken: string): Promise<TokenRefreshResponse> {
    const tokenUrl = this.config.tokenUrl || 'https://graph.threads.net/oauth/access_token';
    
    const requestBody = new URLSearchParams({
      client_id: this.config.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: requestBody.toString()
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`TOKEN_REFRESH_ERROR: ${errorData.error} - ${errorData.error_description || 'Unknown error'}`);
      }

      return await response.json();
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('TOKEN_REFRESH_ERROR')) {
        throw error;
      }
      throw new Error('NETWORK_ERROR');
    }
  }

  /**
   * Automatically refresh token if it needs refresh
   * Requirements: 2.3 (automatic refresh)
   */
  async automaticTokenRefresh(): Promise<AuthenticationResult> {
    const context = await this.getStoredAuthContext();
    
    if (!context) {
      return {
        success: false,
        error: {
          code: 'NO_STORED_CONTEXT',
          message: 'No authentication context found'
        }
      };
    }

    const needsRefresh = this.doesTokenNeedRefresh(context.expiresAt);
    
    if (!needsRefresh) {
      return {
        success: true,
        context
      };
    }

    return await this.refreshTokens(context.refreshToken);
  }

  /**
   * Check if token needs refresh based on expiration time and buffer
   * Requirements: 2.4 (expiration checking)
   */
  doesTokenNeedRefresh(expiresAt: Date, bufferMs?: number): boolean {
    const buffer = bufferMs || this.TOKEN_REFRESH_BUFFER_MS;
    const now = new Date();
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    
    return timeUntilExpiry <= buffer;
  }


  /**
   * Revoke token on the server
   */
  private async revokeTokenOnServer(accessToken: string): Promise<void> {
    const revokeUrl = this.config.tokenUrl || 'https://graph.threads.net/oauth/access_token';
    
    const response = await fetch(revokeUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token revocation failed: ${errorData.error} - ${errorData.error_description || 'Unknown error'}`);
    }
  }

  /**
   * Schedule background token refresh using Chrome alarms
   * Requirements: 2.3 (background refresh scheduling)
   */
  async scheduleBackgroundRefresh(): Promise<void> {
    try {
      const context = await this.getStoredAuthContext();
      
      if (!context) {
        return;
      }

      const needsRefresh = this.doesTokenNeedRefresh(context.expiresAt);
      
      if (needsRefresh) {
        // Schedule refresh for immediately or within a few minutes
        const delayMinutes = 1;
        
        await chrome.alarms.create('tokenRefresh', {
          delayInMinutes: delayMinutes
        });
        
        console.log(`Background token refresh scheduled in ${delayMinutes} minutes`);
      }
      
    } catch (error) {
      console.error('Error scheduling background refresh:', error);
    }
  }

  /**
   * Convenience method to check if user is authenticated
   * Requirements: 2.4 (authentication status)
   */
  async isAuthenticated(): Promise<boolean> {
    const status = await this.getAuthStatus();
    return status.isAuthenticated;
  }

  /**
   * Add event listener for authentication changes
   * Requirements: 2.4 (event broadcasting)
   */
  onAuthenticationChange(listener: AuthenticationEventListener): void {
    this.eventListeners.push(listener);
  }

  /**
   * Remove event listener for authentication changes
   */
  removeAuthenticationListener(listener: AuthenticationEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Broadcast authentication event to all listeners
   */
  private broadcastAuthenticationEvent(event: AuthenticationEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in authentication event listener:', error);
      }
    });

    // Also send to other extension components via chrome.runtime
    try {
      chrome.runtime.sendMessage({
        type: 'AUTHENTICATION_EVENT',
        payload: event
      });
    } catch (error) {
      // Chrome runtime may not be available in tests
      console.debug('Could not send authentication event via chrome.runtime:', error);
    }
  }

  /**
   * Authenticate with retry logic and exponential backoff
   * Requirements: 5.1 (retry logic)
   */
  async authenticateWithRetry(config: RetryConfig): Promise<AuthenticationResult> {
    const { maxRetries, initialDelayMs, backoffMultiplier = 2, maxDelayMs = 30000 } = config;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.authenticate();
        
        if (result.success) {
          // Broadcast success event
          if (result.context) {
            this.broadcastAuthenticationEvent({
              type: 'AUTHENTICATION_SUCCESS',
              isAuthenticated: true,
              userId: result.context.userId,
              scopes: result.context.scopes
            });
          }
          return result;
        }
        
        lastError = result.error;
        
        // Don't retry on user cancellation or client errors
        if (result.error?.code === 'USER_CANCELLED' || 
            result.error?.code === 'INVALID_CLIENT') {
          this.broadcastAuthenticationEvent({
            type: 'AUTHENTICATION_FAILED',
            isAuthenticated: false,
            error: result.error
          });
          return result;
        }
        
      } catch (error) {
        lastError = error;
        
        // Don't retry on user cancellation
        if (error instanceof Error && error.message === 'USER_CANCELLED') {
          break;
        }
      }

      // Wait before retry (except on last attempt)
      if (attempt < maxRetries) {
        const delay = Math.min(
          initialDelayMs * Math.pow(backoffMultiplier, attempt),
          maxDelayMs
        );
        
        // Add jitter (±25%)
        const jitter = delay * 0.25 * (Math.random() - 0.5);
        const delayWithJitter = Math.max(0, delay + jitter);
        
        await this.sleep(delayWithJitter);
      }
    }

    // All retries failed
    const finalResult: AuthenticationResult = {
      success: false,
      error: {
        code: 'MAX_RETRIES_EXCEEDED',
        message: `Authentication failed after ${maxRetries} retry attempts`
      }
    };

    // Broadcast failure event
    this.broadcastAuthenticationEvent({
      type: 'AUTHENTICATION_FAILED',
      isAuthenticated: false,
      error: finalResult.error
    });

    return finalResult;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get user-friendly error message for error code
   * Requirements: 5.1 (user-friendly messages)
   */
  getErrorMessage(errorCode: string): string {
    const errorMessages: Record<string, string> = {
      'USER_CANCELLED': 'Authentication was cancelled. Please try again when ready to connect your account.',
      'NETWORK_ERROR': 'Unable to connect to Threads. Please check your internet connection and try again.',
      'INVALID_GRANT': 'Your authentication session has expired. Please sign in again.',
      'INVALID_CLIENT': 'There\'s an issue with the app configuration. Please contact support.',
      'INVALID_TOKEN': 'Your authentication token is invalid. Please sign in again.',
      'INSUFFICIENT_SCOPE': 'Additional permissions are required. Please re-authenticate to grant access.',
      'RATE_LIMITED': 'Too many authentication attempts. Please wait a moment and try again.',
      'SERVER_ERROR': 'Threads authentication service is temporarily unavailable. Please try again later.',
      'UNKNOWN_ERROR': 'An unexpected error occurred. Please try again or contact support if the problem persists.'
    };

    return errorMessages[errorCode] || errorMessages['UNKNOWN_ERROR'];
  }

  /**
   * Get error severity level
   * Requirements: 5.1 (error categorization)
   */
  getErrorSeverity(errorCode: string): ErrorSeverity {
    const severityMap: Record<string, ErrorSeverity> = {
      'USER_CANCELLED': 'info',
      'NETWORK_ERROR': 'warning',
      'RATE_LIMITED': 'warning',
      'INVALID_GRANT': 'error',
      'INVALID_CLIENT': 'error',
      'INVALID_TOKEN': 'error',
      'INSUFFICIENT_SCOPE': 'error',
      'SERVER_ERROR': 'error',
      'UNKNOWN_ERROR': 'error'
    };

    return severityMap[errorCode] || 'error';
  }

  /**
   * Get recovery suggestion for error code
   * Requirements: 5.1 (recovery guidance)
   */
  getRecoverySuggestion(errorCode: string): string {
    const suggestions: Record<string, string> = {
      'USER_CANCELLED': 'Click the "Connect Account" button when you\'re ready to authenticate.',
      'NETWORK_ERROR': 'Check your internet connection and try again in a moment.',
      'INVALID_GRANT': 'Please sign out and sign in again to refresh your authentication.',
      'INVALID_CLIENT': 'Please update the extension or contact support for assistance.',
      'INVALID_TOKEN': 'Sign out and sign back in to get a fresh authentication token.',
      'INSUFFICIENT_SCOPE': 'Re-authenticate to grant the required permissions for full functionality.',
      'RATE_LIMITED': 'Wait a few minutes before attempting to authenticate again.',
      'SERVER_ERROR': 'The issue is on Threads\' side. Try again in a few minutes.',
      'UNKNOWN_ERROR': 'Try refreshing the page and attempting the action again.'
    };

    return suggestions[errorCode] || suggestions['UNKNOWN_ERROR'];
  }

  /**
   * Start monitoring authentication status changes
   * Requirements: 2.4 (status monitoring)
   */
  async startAuthenticationMonitoring(callback: AuthenticationEventListener): Promise<void> {
    if (this.monitoringActive) {
      return; // Already monitoring
    }

    this.onAuthenticationChange(callback);
    this.monitoringActive = true;

    // Check status immediately
    await this.checkAuthenticationStatus();

    // Set up periodic monitoring (every 5 minutes)
    this.monitoringInterval = window.setInterval(async () => {
      await this.checkAuthenticationStatus();
    }, 5 * 60 * 1000);

    console.log('Authentication monitoring started');
  }

  /**
   * Stop monitoring authentication status changes
   */
  stopAuthenticationMonitoring(): void {
    this.monitoringActive = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    console.log('Authentication monitoring stopped');
  }

  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean {
    return this.monitoringActive;
  }

  /**
   * Check current authentication status and broadcast events if needed
   */
  async checkAuthenticationStatus(): Promise<void> {
    try {
      const status = await this.getAuthStatus();

      if (status.isAuthenticated && status.needsRefresh) {
        this.broadcastAuthenticationEvent({
          type: 'TOKEN_REFRESH_NEEDED',
          isAuthenticated: true,
          userId: status.userId,
          scopes: status.scopes,
          needsRefresh: true
        });
      }
    } catch (error) {
      console.error('Error checking authentication status:', error);
    }
  }

  /**
   * Enhanced authenticate method with event broadcasting
   */
  async authenticate(): Promise<AuthenticationResult> {
    try {
      // Step 1: Launch OAuth2 web auth flow
      const authCode = await this.launchAuthFlow();
      
      // Step 2: Exchange authorization code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(authCode);
      
      // Step 3: Create authentication context
      const context = this.createAuthContext(tokenResponse);
      
      // Step 4: Store authentication context
      await this.storeAuthContext(context);
      
      const result: AuthenticationResult = {
        success: true,
        context
      };

      // Broadcast success event
      this.broadcastAuthenticationEvent({
        type: 'AUTHENTICATION_SUCCESS',
        isAuthenticated: true,
        userId: context.userId,
        scopes: context.scopes
      });
      
      return result;
      
    } catch (error) {
      const result = this.handleAuthError(error);
      
      // Broadcast failure event
      this.broadcastAuthenticationEvent({
        type: 'AUTHENTICATION_FAILED',
        isAuthenticated: false,
        error: result.error
      });
      
      return result;
    }
  }

  /**
   * Enhanced refreshTokens method with event broadcasting
   */
  async refreshTokens(refreshToken: string): Promise<AuthenticationResult> {
    if (!refreshToken || refreshToken.trim() === '') {
      throw new Error('Refresh token is required');
    }

    try {
      const tokenResponse = await this.exchangeRefreshTokenForTokens(refreshToken);
      const context = this.createAuthContext(tokenResponse);
      await this.storeAuthContext(context);
      
      const result: AuthenticationResult = {
        success: true,
        context
      };

      // Broadcast token refresh event
      this.broadcastAuthenticationEvent({
        type: 'TOKEN_REFRESHED',
        isAuthenticated: true,
        userId: context.userId,
        scopes: context.scopes
      });
      
      return result;
      
    } catch (error) {
      return this.handleRefreshError(error);
    }
  }

  /**
   * Enhanced revokeAccess method with event broadcasting
   */
  async revokeAccess(accessToken?: string): Promise<AuthenticationResult> {
    try {
      let tokenToRevoke = accessToken;
      
      // If no token provided, get it from stored context
      if (!tokenToRevoke) {
        const context = await this.getStoredAuthContext();
        if (context) {
          tokenToRevoke = context.accessToken;
        }
      }

      // Always clear local storage first
      await this.clearStoredAuthContext();

      // Try to revoke on server (but don't fail if it doesn't work)
      if (tokenToRevoke) {
        try {
          await this.revokeTokenOnServer(tokenToRevoke);
        } catch (error) {
          console.warn('Failed to revoke token on server, but local storage cleared:', error);
        }
      }

      const result: AuthenticationResult = {
        success: true
      };

      // Broadcast sign out event
      this.broadcastAuthenticationEvent({
        type: 'SIGNED_OUT',
        isAuthenticated: false
      });

      return result;
      
    } catch (error) {
      console.error('Error during revoke access:', error);
      return {
        success: true // Still consider it successful if local storage is cleared
      };
    }
  }

  /**
   * Handle token refresh errors
   */
  private handleRefreshError(error: any): AuthenticationResult {
    console.error('Token refresh error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'NETWORK_ERROR') {
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Failed to refresh access token'
          }
        };
      }
      
      if (error.message.includes('TOKEN_REFRESH_ERROR')) {
        const parts = error.message.split(' - ');
        const errorCode = parts[0].replace('TOKEN_REFRESH_ERROR: ', '');
        const errorMessage = parts[1] || 'Token refresh failed';
        
        return {
          success: false,
          error: {
            code: errorCode.toUpperCase(),
            message: errorMessage
          }
        };
      }
    }
    
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred during token refresh'
      }
    };
  }

  /**
   * Handle authentication errors and convert to standardized format
   */
  private handleAuthError(error: any): AuthenticationResult {
    console.error('Authentication error:', error);
    
    if (error instanceof Error) {
      if (error.message === 'USER_CANCELLED') {
        return {
          success: false,
          error: {
            code: 'USER_CANCELLED',
            message: 'Authentication was cancelled by the user'
          }
        };
      }
      
      if (error.message === 'NETWORK_ERROR') {
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Failed to exchange authorization code for tokens'
          }
        };
      }
      
      if (error.message.includes('TOKEN_EXCHANGE_ERROR')) {
        const parts = error.message.split(' - ');
        const errorCode = parts[0].replace('TOKEN_EXCHANGE_ERROR: ', '');
        const errorMessage = parts[1] || 'Token exchange failed';
        
        return {
          success: false,
          error: {
            code: errorCode.toUpperCase(),
            message: errorMessage
          }
        };
      }
    }
    
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred during authentication'
      }
    };
  }
}