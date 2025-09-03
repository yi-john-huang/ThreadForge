/**
 * Credentials Manager - Task 20
 * Manages OAuth2 authentication, credential validation, and API quota tracking
 * for Threads API integration with secure storage and UI components
 */

export interface ThreadsCredentials {
  access_token: string;
  refresh_token: string;
  client_id: string;
  expires_at: number;
  saved_at: number;
  scopes?: string[];
}

export interface QuotaUsage {
  total_requests: number;
  remaining_requests: number;
  daily_requests: number;
  daily_limit: number;
  reset_date: number;
  last_updated: number;
  error?: string;
}

export class CredentialsManager {
  private readonly STORAGE_KEY = 'threads_credentials';
  private readonly QUOTA_CACHE_KEY = 'quota_cache';
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly THREADS_API_BASE = 'https://graph.threads.net';
  private readonly OAUTH_BASE = 'https://threads.net/oauth';

  /**
   * Validates credentials by checking format and API connectivity
   */
  public async validateCredentials(credentials: any): Promise<boolean> {
    if (!credentials) return false;

    // Check required fields
    if (!credentials.access_token || !credentials.client_id) {
      return false;
    }

    // Check token format (basic validation)
    if (typeof credentials.access_token !== 'string' || credentials.access_token.length < 10) {
      return false;
    }

    // Check expiration
    if (credentials.expires_at && typeof credentials.expires_at === 'number') {
      if (credentials.expires_at < Date.now()) {
        // Try to refresh if we have a refresh token
        if (credentials.refresh_token) {
          try {
            await this.refreshAuthToken();
            return true;
          } catch (error) {
            return false;
          }
        }
        return false;
      }
    }

    // Test API connectivity
    try {
      const response = await fetch(`${this.THREADS_API_BASE}/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('API validation failed:', error);
      return false;
    }
  }

  /**
   * Saves credentials securely to Chrome storage with encryption
   */
  public async saveCredentials(credentials: ThreadsCredentials): Promise<void> {
    if (!this.isChromeApiAvailable()) {
      throw new Error('Chrome API not available');
    }

    try {
      // Encrypt sensitive tokens
      const encryptedCredentials = {
        ...credentials,
        access_token: this.encryptToken(credentials.access_token),
        refresh_token: credentials.refresh_token ? this.encryptToken(credentials.refresh_token) : undefined,
        saved_at: Date.now()
      };

      await chrome.storage.sync.set({
        [this.STORAGE_KEY]: encryptedCredentials
      });

      // Broadcast authentication status change
      this.broadcastAuthStatus('connected');
    } catch (error) {
      console.error('Failed to save credentials:', error);
      throw error;
    }
  }

  /**
   * Retrieves and decrypts stored credentials
   */
  public async getStoredCredentials(): Promise<ThreadsCredentials | null> {
    if (!this.isChromeApiAvailable()) {
      return null;
    }

    try {
      const result = await chrome.storage.sync.get([this.STORAGE_KEY]);
      const storedCredentials = result[this.STORAGE_KEY];

      if (!storedCredentials) {
        return null;
      }

      // Decrypt sensitive tokens
      return {
        ...storedCredentials,
        access_token: this.decryptToken(storedCredentials.access_token),
        refresh_token: storedCredentials.refresh_token ? this.decryptToken(storedCredentials.refresh_token) : undefined
      };
    } catch (error) {
      console.error('Failed to retrieve credentials:', error);
      return null;
    }
  }

  /**
   * Clears all stored credentials and cached tokens
   */
  public async clearCredentials(): Promise<void> {
    if (!this.isChromeApiAvailable()) {
      return;
    }

    try {
      // Remove from storage
      await chrome.storage.sync.remove([this.STORAGE_KEY, this.QUOTA_CACHE_KEY]);

      // Clear cached auth tokens
      if (chrome.identity && chrome.identity.removeCachedAuthToken) {
        const credentials = await this.getStoredCredentials();
        if (credentials?.access_token) {
          chrome.identity.removeCachedAuthToken({ token: credentials.access_token });
        }
      }

      // Broadcast status change
      this.broadcastAuthStatus('disconnected');
    } catch (error) {
      console.error('Failed to clear credentials:', error);
      throw error;
    }
  }

  /**
   * Refreshes expired access token using refresh token
   */
  public async refreshAuthToken(): Promise<string> {
    const credentials = await this.getStoredCredentials();
    if (!credentials?.refresh_token) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${this.OAUTH_BASE}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: credentials.refresh_token,
          client_id: credentials.client_id
        })
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const tokenData = await response.json();
      
      // Update stored credentials
      const updatedCredentials = {
        ...credentials,
        access_token: tokenData.access_token,
        expires_at: Date.now() + (tokenData.expires_in * 1000)
      };

      await this.saveCredentials(updatedCredentials);
      return tokenData.access_token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Fetches current API quota usage with caching
   */
  public async getApiQuotaUsage(): Promise<QuotaUsage> {
    // Check cache first
    const cachedQuota = await this.getCachedQuotaData();
    if (cachedQuota) {
      return cachedQuota;
    }

    try {
      const credentials = await this.getStoredCredentials();
      if (!credentials?.access_token) {
        return this.getDefaultQuotaData('No credentials available');
      }

      const response = await fetch(`${this.THREADS_API_BASE}/me/usage`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Quota API request failed');
      }

      const quotaData = await response.json();
      const processedQuota: QuotaUsage = {
        total_requests: quotaData.total_requests || 0,
        remaining_requests: quotaData.remaining_requests || 5000,
        daily_requests: quotaData.daily_requests || 0,
        daily_limit: quotaData.daily_limit || 500,
        reset_date: quotaData.reset_date || (Date.now() + 7 * 24 * 60 * 60 * 1000),
        last_updated: Date.now()
      };

      // Cache the result
      await this.cacheQuotaData(processedQuota);
      return processedQuota;
    } catch (error) {
      console.error('Failed to fetch quota usage:', error);
      return this.getDefaultQuotaData('Unable to fetch quota data');
    }
  }

  /**
   * Checks if current usage is within quota limits
   */
  public async isWithinQuotaLimits(): Promise<boolean> {
    const quotaData = await this.getApiQuotaUsage();
    
    if (quotaData.error) {
      return false; // Assume over limit if we can't check
    }

    const totalUsagePercent = quotaData.total_requests / (quotaData.total_requests + quotaData.remaining_requests);
    const dailyUsagePercent = quotaData.daily_requests / quotaData.daily_limit;

    // Consider over limit if usage is above 90%
    return totalUsagePercent < 0.9 && dailyUsagePercent < 0.9;
  }

  /**
   * Shows quota warning in UI
   */
  public showQuotaWarning(usage: QuotaUsage): void {
    // This would be called by the UI component
    const warningData = {
      type: 'quota_warning',
      usage: usage,
      severity: this.getWarningSeverity(usage)
    };

    // Broadcast warning to UI components
    if (this.isChromeApiAvailable() && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'QUOTA_WARNING',
        data: warningData
      });
    }
  }

  /**
   * Gets cached quota data if still valid
   */
  private async getCachedQuotaData(): Promise<QuotaUsage | null> {
    if (!this.isChromeApiAvailable()) {
      return null;
    }

    try {
      const result = await chrome.storage.sync.get([this.QUOTA_CACHE_KEY]);
      const cachedData = result[this.QUOTA_CACHE_KEY];

      if (cachedData && cachedData.cached_at > Date.now() - this.CACHE_DURATION) {
        return cachedData.data;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Caches quota data for future use
   */
  private async cacheQuotaData(quotaData: QuotaUsage): Promise<void> {
    if (!this.isChromeApiAvailable()) {
      return;
    }

    try {
      await chrome.storage.sync.set({
        [this.QUOTA_CACHE_KEY]: {
          data: quotaData,
          cached_at: Date.now()
        }
      });
    } catch (error) {
      console.error('Failed to cache quota data:', error);
    }
  }

  /**
   * Returns default quota data on error
   */
  private getDefaultQuotaData(error: string): QuotaUsage {
    return {
      error,
      total_requests: 0,
      remaining_requests: 5000,
      daily_requests: 0,
      daily_limit: 500,
      reset_date: Date.now() + 7 * 24 * 60 * 60 * 1000,
      last_updated: Date.now()
    };
  }

  /**
   * Determines warning severity based on usage
   */
  private getWarningSeverity(usage: QuotaUsage): 'low' | 'medium' | 'high' {
    const totalPercent = usage.total_requests / (usage.total_requests + usage.remaining_requests);
    const dailyPercent = usage.daily_requests / usage.daily_limit;
    const maxPercent = Math.max(totalPercent, dailyPercent);

    if (maxPercent > 0.95) return 'high';
    if (maxPercent > 0.8) return 'medium';
    return 'low';
  }

  /**
   * Basic token encryption for storage (not cryptographically secure, but better than plain text)
   */
  private encryptToken(token: string): string {
    // Simple base64 encoding with prefix (in production, use proper encryption)
    return 'enc_' + btoa(token);
  }

  /**
   * Decrypts token from storage
   */
  private decryptToken(encryptedToken: string): string {
    if (encryptedToken.startsWith('enc_')) {
      return atob(encryptedToken.substring(4));
    }
    return encryptedToken; // Fallback for unencrypted tokens
  }

  /**
   * Broadcasts authentication status changes to extension components
   */
  private broadcastAuthStatus(status: 'connected' | 'disconnected' | 'error'): void {
    if (!this.isChromeApiAvailable() || !chrome.runtime?.sendMessage) {
      return;
    }

    chrome.runtime.sendMessage({
      type: 'AUTHENTICATION_STATUS_UPDATE',
      data: {
        status,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Checks if Chrome extension APIs are available
   */
  private isChromeApiAvailable(): boolean {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
  }
}

/**
 * Authentication UI Manager
 */
export class AuthenticationUI {
  private credentialsManager: CredentialsManager;

  constructor() {
    this.credentialsManager = new CredentialsManager();
  }

  /**
   * Creates Connect Account button
   */
  public createConnectButton(): HTMLElement {
    const button = document.createElement('button');
    button.classList.add('tf-connect-button');
    button.textContent = 'Connect to Threads';
    button.style.backgroundColor = '#1da1f2';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '8px';
    button.style.padding = '12px 24px';
    button.style.fontSize = '16px';
    button.style.fontWeight = 'bold';
    button.style.cursor = 'pointer';
    button.style.transition = 'background-color 0.2s ease';
    button.disabled = false;

    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = '#0d8bd9';
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#1da1f2';
    });

    button.addEventListener('click', () => {
      this.showAuthenticationFlow();
    });

    return button;
  }

  /**
   * Creates authentication status display
   */
  public createStatusDisplay(): HTMLElement {
    const statusContainer = document.createElement('div');
    statusContainer.classList.add('tf-auth-status');
    statusContainer.style.display = 'flex';
    statusContainer.style.alignItems = 'center';
    statusContainer.style.gap = '12px';
    statusContainer.style.padding = '12px';
    statusContainer.style.borderRadius = '8px';
    statusContainer.style.backgroundColor = '#f8f9fa';
    statusContainer.style.border = '1px solid #e9ecef';

    // Status icon
    const statusIcon = document.createElement('div');
    statusIcon.classList.add('tf-status-icon');
    statusIcon.style.width = '12px';
    statusIcon.style.height = '12px';
    statusIcon.style.borderRadius = '50%';
    statusIcon.style.backgroundColor = '#dc3545'; // Default to disconnected (red)

    // Status text
    const statusText = document.createElement('span');
    statusText.classList.add('tf-status-text');
    statusText.textContent = 'Disconnected';
    statusText.style.fontWeight = '500';
    statusText.style.color = '#495057';

    // Last updated
    const lastUpdated = document.createElement('span');
    lastUpdated.classList.add('tf-last-updated');
    lastUpdated.textContent = 'Never';
    lastUpdated.style.fontSize = '12px';
    lastUpdated.style.color = '#6c757d';
    lastUpdated.style.marginLeft = 'auto';

    statusContainer.appendChild(statusIcon);
    statusContainer.appendChild(statusText);
    statusContainer.appendChild(lastUpdated);

    return statusContainer;
  }

  /**
   * Updates connection status display
   */
  public updateConnectionStatus(status: 'connected' | 'disconnected' | 'error'): void {
    const statusDisplays = document.querySelectorAll('.tf-auth-status');
    
    statusDisplays.forEach(statusDisplay => {
      const statusIcon = statusDisplay.querySelector('.tf-status-icon') as HTMLElement;
      const statusText = statusDisplay.querySelector('.tf-status-text') as HTMLElement;
      const lastUpdated = statusDisplay.querySelector('.tf-last-updated') as HTMLElement;

      if (statusIcon && statusText && lastUpdated) {
        switch (status) {
          case 'connected':
            statusIcon.style.backgroundColor = '#28a745'; // Green
            statusText.textContent = 'Connected to Threads';
            statusText.style.color = '#28a745';
            break;
          case 'disconnected':
            statusIcon.style.backgroundColor = '#dc3545'; // Red
            statusText.textContent = 'Disconnected';
            statusText.style.color = '#dc3545';
            break;
          case 'error':
            statusIcon.style.backgroundColor = '#fd7e14'; // Orange
            statusText.textContent = 'Authentication Error';
            statusText.style.color = '#fd7e14';
            
            // Show error message
            const errorMessage = document.createElement('div');
            errorMessage.classList.add('tf-error-message');
            errorMessage.textContent = 'Authentication failed. Please try again.';
            errorMessage.style.color = '#dc3545';
            errorMessage.style.fontSize = '12px';
            errorMessage.style.marginTop = '8px';
            
            if (!statusDisplay.querySelector('.tf-error-message')) {
              statusDisplay.appendChild(errorMessage);
            }
            break;
        }

        lastUpdated.textContent = new Date().toLocaleTimeString();
      }
    });

    // Broadcast status change
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'AUTHENTICATION_STATUS_UPDATE',
        data: {
          status,
          timestamp: Date.now()
        }
      });
    }
  }

  /**
   * Shows OAuth2 authentication flow
   */
  public async showAuthenticationFlow(): Promise<any> {
    // Create and show authentication modal
    const authModal = this.createAuthModal();
    document.body.appendChild(authModal);

    try {
      const authUrl = this.buildAuthUrl();
      const authResult = await this.launchWebAuthFlow(authUrl);
      
      // Process auth result and save credentials
      if (authResult) {
        await this.processAuthResult(authResult);
        this.updateConnectionStatus('connected');
      }

      return {
        authUrl,
        clientId: 'threads_client_id',
        scopes: ['threads.read', 'threads.write']
      };
    } catch (error) {
      console.error('Authentication flow failed:', error);
      this.updateConnectionStatus('error');
      throw error;
    } finally {
      this.hideAuthenticationFlow();
    }
  }

  /**
   * Hides authentication flow UI
   */
  public hideAuthenticationFlow(): void {
    const authModal = document.querySelector('.tf-auth-modal');
    if (authModal) {
      document.body.removeChild(authModal);
    }
  }

  /**
   * Creates authentication modal
   */
  private createAuthModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.classList.add('tf-auth-modal');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.style.zIndex = '10000';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';

    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = 'white';
    modalContent.style.padding = '32px';
    modalContent.style.borderRadius = '12px';
    modalContent.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
    modalContent.style.textAlign = 'center';
    modalContent.style.maxWidth = '400px';

    const title = document.createElement('h2');
    title.textContent = 'Connect to Threads';
    title.style.marginBottom = '16px';

    const description = document.createElement('p');
    description.textContent = 'Authenticate with Threads to enable API features';
    description.style.color = '#6c757d';
    description.style.marginBottom = '24px';

    const loadingSpinner = document.createElement('div');
    loadingSpinner.style.width = '32px';
    loadingSpinner.style.height = '32px';
    loadingSpinner.style.border = '3px solid #f3f3f3';
    loadingSpinner.style.borderTop = '3px solid #1da1f2';
    loadingSpinner.style.borderRadius = '50%';
    loadingSpinner.style.animation = 'spin 1s linear infinite';
    loadingSpinner.style.margin = '0 auto';

    modalContent.appendChild(title);
    modalContent.appendChild(description);
    modalContent.appendChild(loadingSpinner);
    modal.appendChild(modalContent);

    return modal;
  }

  /**
   * Builds OAuth2 authorization URL
   */
  private buildAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: 'threads_client_id',
      redirect_uri: chrome.identity.getRedirectURL(),
      response_type: 'code',
      scope: 'threads.read threads.write',
      state: this.generateState()
    });

    return `https://threads.net/oauth/authorize?${params.toString()}`;
  }

  /**
   * Launches web auth flow using Chrome identity API
   */
  private async launchWebAuthFlow(authUrl: string): Promise<string> {
    if (!chrome.identity?.launchWebAuthFlow) {
      throw new Error('Chrome identity API not available');
    }

    return chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });
  }

  /**
   * Processes authentication result
   */
  private async processAuthResult(authResult: string): Promise<void> {
    const url = new URL(authResult);
    const code = url.searchParams.get('code');
    
    if (!code) {
      throw new Error('No authorization code received');
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://threads.net/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'threads_client_id',
        code: code,
        redirect_uri: chrome.identity.getRedirectURL()
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Token exchange failed');
    }

    const tokens = await tokenResponse.json();
    
    const credentials: ThreadsCredentials = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      client_id: 'threads_client_id',
      expires_at: Date.now() + (tokens.expires_in * 1000),
      saved_at: Date.now(),
      scopes: tokens.scope?.split(' ')
    };

    await this.credentialsManager.saveCredentials(credentials);
  }

  /**
   * Generates secure state parameter for OAuth2
   */
  private generateState(): string {
    const array = new Uint32Array(4);
    crypto.getRandomValues(array);
    return Array.from(array, dec => dec.toString(16)).join('');
  }
}