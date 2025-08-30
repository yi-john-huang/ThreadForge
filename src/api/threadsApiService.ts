/**
 * Threads API Service for HTTP client and request handling
 * Handles authentication, rate limiting, error handling, and request/response interceptors
 * Requirements: 1.1 (API connection), 1.4 (error handling), 1.5 (rate limiting)
 */

import {
  APIServiceConfig,
  RequestConfig,
  APIRequestInterceptor,
  APIResponseInterceptor,
  RateLimitInfo,
  APIError,
  ThreadsAPIResponse
} from './types';

export class ThreadsAPIService {
  private config: APIServiceConfig;
  private requestInterceptors: APIRequestInterceptor[] = [];
  private responseInterceptors: APIResponseInterceptor[] = [];
  private readonly RATE_LIMIT_STORAGE_KEY = 'threadforge_ratelimit';

  constructor(config?: Partial<APIServiceConfig>) {
    this.config = {
      baseURL: 'https://graph.threads.net/v1.0',
      timeout: 10000,
      maxRetries: 3,
      rateLimitWindow: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      rateLimitQueries: 500,
      ...config
    };
  }

  /**
   * Add request interceptor for authentication, logging, etc.
   * Requirements: 1.1 (authentication integration)
   */
  addRequestInterceptor(interceptor: APIRequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor for logging, data transformation, etc.
   */
  addResponseInterceptor(interceptor: APIResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Main request method with rate limiting, retries, and interceptors
   * Requirements: 1.1 (API connection), 1.4 (error handling), 1.5 (rate limiting)
   */
  async request<T = any>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    // Check rate limiting before making request
    await this.checkRateLimit();

    // Apply request interceptors
    let requestConfig = await this.applyRequestInterceptors(config);

    // Build final request configuration
    const finalConfig = this.buildRequestConfig(endpoint, requestConfig);

    // Execute request with retries
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(finalConfig);
        
        // Update rate limit from response headers
        await this.updateRateLimitFromResponse(response);

        // Parse response
        let data: T;
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text() as any;
        }

        // Handle API errors
        if (!response.ok) {
          throw await this.handleAPIError(response, data);
        }

        // Apply response interceptors
        const processedData = await this.applyResponseInterceptors(response, data);

        // Increment local rate limit counter
        await this.incrementRateLimit();

        return processedData;

      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on rate limit or client errors
        if (error instanceof Error && 
            (error.message.includes('Rate limit') || 
             error.message.includes('400') ||
             error.message.includes('401') ||
             error.message.includes('403'))) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.config.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Maximum retry attempts exceeded');
  }

  /**
   * Check rate limiting before making request
   * Requirements: 1.5 (rate limiting compliance)
   */
  private async checkRateLimit(): Promise<void> {
    try {
      const rateLimitData = await chrome.storage.local.get([this.RATE_LIMIT_STORAGE_KEY]);
      const storedData = rateLimitData?.[this.RATE_LIMIT_STORAGE_KEY];

      if (!storedData) {
        return; // No rate limit data, proceed
      }

      const now = Date.now();
      const windowStart = storedData.windowStart || 0;
      const windowAge = now - windowStart;

      // Reset if window has expired
      if (windowAge > this.config.rateLimitWindow) {
        await this.resetRateLimit();
        return;
      }

      // Check if we've exceeded the rate limit
      if (storedData.count >= this.config.rateLimitQueries) {
        const resetTime = new Date(windowStart + this.config.rateLimitWindow);
        throw new Error(`Rate limit exceeded. ${storedData.count}/${this.config.rateLimitQueries} requests used. Resets at ${resetTime.toISOString()}`);
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('Rate limit')) {
        throw error;
      }
      console.warn('Error checking rate limit:', error);
      // Continue with request if rate limit check fails
    }
  }

  /**
   * Update rate limit info from API response headers
   */
  private async updateRateLimitFromResponse(response: Response): Promise<void> {
    try {
      const remaining = response.headers.get('x-ratelimit-remaining');
      const limit = response.headers.get('x-ratelimit-limit');
      const reset = response.headers.get('x-ratelimit-reset');

      if (remaining && limit && reset) {
        const rateLimitData = {
          remaining: parseInt(remaining, 10),
          limit: parseInt(limit, 10),
          resetTime: parseInt(reset, 10),
          lastUpdated: Date.now()
        };

        await chrome.storage.local.set({
          [`${this.RATE_LIMIT_STORAGE_KEY}_server`]: rateLimitData
        });
      }
    } catch (error) {
      console.warn('Error updating rate limit from response:', error);
    }
  }

  /**
   * Increment local rate limit counter
   */
  private async incrementRateLimit(): Promise<void> {
    try {
      const rateLimitData = await chrome.storage.local.get([this.RATE_LIMIT_STORAGE_KEY]);
      let storedData = rateLimitData?.[this.RATE_LIMIT_STORAGE_KEY] || {};

      const now = Date.now();
      const windowStart = storedData.windowStart || now;
      const count = (storedData.count || 0) + 1;

      const updatedData = {
        count,
        windowStart,
        resetTime: windowStart + this.config.rateLimitWindow,
        lastUpdated: now
      };

      await chrome.storage.local.set({
        [this.RATE_LIMIT_STORAGE_KEY]: updatedData
      });

    } catch (error) {
      console.warn('Error incrementing rate limit:', error);
    }
  }

  /**
   * Reset rate limit counter
   */
  private async resetRateLimit(): Promise<void> {
    try {
      const now = Date.now();
      const resetData = {
        count: 0,
        windowStart: now,
        resetTime: now + this.config.rateLimitWindow,
        lastUpdated: now
      };

      await chrome.storage.local.set({
        [this.RATE_LIMIT_STORAGE_KEY]: resetData
      });

    } catch (error) {
      console.warn('Error resetting rate limit:', error);
    }
  }

  /**
   * Apply all request interceptors in order
   */
  private async applyRequestInterceptors(config: RequestConfig): Promise<RequestConfig> {
    let processedConfig = { ...config };

    for (const interceptor of this.requestInterceptors) {
      try {
        processedConfig = await interceptor(processedConfig);
      } catch (error) {
        console.error('Error in request interceptor:', error);
        throw new Error('Request interceptor failed');
      }
    }

    return processedConfig;
  }

  /**
   * Apply all response interceptors in order
   */
  private async applyResponseInterceptors(response: Response, data: any): Promise<any> {
    let processedData = data;

    for (const interceptor of this.responseInterceptors) {
      try {
        processedData = await interceptor(response, processedData);
      } catch (error) {
        console.error('Error in response interceptor:', error);
        // Continue processing with current data
      }
    }

    return processedData;
  }

  /**
   * Build final request configuration with defaults
   */
  private buildRequestConfig(endpoint: string, config: RequestConfig): {
    url: string;
    options: RequestInit;
    abortController: AbortController;
  } {
    const url = endpoint.startsWith('http') ? endpoint : `${this.config.baseURL}${endpoint}`;
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': `ThreadForge/1.0.0 Chrome Extension`
    };

    const headers = {
      ...defaultHeaders,
      ...config.headers
    };

    const abortController = new AbortController();
    
    // Set up timeout
    if (this.config.timeout > 0) {
      setTimeout(() => abortController.abort(), this.config.timeout);
    }

    const options: RequestInit = {
      method: config.method || 'GET',
      headers,
      signal: abortController.signal,
      ...config.body && { body: config.body }
    };

    return { url, options, abortController };
  }

  /**
   * Execute HTTP request with timeout handling
   */
  private async executeRequest(requestConfig: {
    url: string;
    options: RequestInit;
    abortController: AbortController;
  }): Promise<Response> {
    try {
      const response = await fetch(requestConfig.url, requestConfig.options);
      return response;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
      }
      throw error;
    }
  }

  /**
   * Handle API error responses
   * Requirements: 1.4 (error handling)
   */
  private async handleAPIError(response: Response, data: any): Promise<Error> {
    let errorMessage = `API request failed with status ${response.status}`;
    let errorCode = response.status;

    // Try to extract error details from response
    if (data && typeof data === 'object') {
      if (data.error) {
        const error = data.error;
        const hasCustomMessage = error.message && error.message.trim() !== '';
        errorMessage = error.message || errorMessage;
        errorCode = error.code || errorCode;

        // Handle specific error types - only add fallback messages if no specific message provided
        if (!hasCustomMessage) {
          switch (error.type) {
            case 'OAuthException':
              if (response.status === 401) {
                errorMessage = 'Authentication failed. Please re-authenticate.';
              }
              break;
            case 'GraphMethodException':
              if (response.status >= 500) {
                errorMessage = 'Threads API service is temporarily unavailable. Please try again later.';
              }
              break;
          }
        }
      }
    }

    // Handle specific HTTP status codes - only for status codes we didn't already handle
    if (response.status === 429 && (!data?.error || !data.error.message)) {
      const retryAfter = response.headers.get('retry-after');
      errorMessage = `Rate limit exceeded${retryAfter ? `. Retry after ${retryAfter} seconds` : ''}`;
    }

    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).code = errorCode;
    (error as any).response = data;

    return error;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit information
   * Requirements: 1.5 (rate limit monitoring)
   */
  async getRateLimitInfo(): Promise<RateLimitInfo> {
    try {
      // First check for server-provided rate limit data
      const serverRateLimitData = await chrome.storage.local.get([`${this.RATE_LIMIT_STORAGE_KEY}_server`]);
      const serverData = serverRateLimitData?.[`${this.RATE_LIMIT_STORAGE_KEY}_server`];

      if (serverData && serverData.lastUpdated && (Date.now() - serverData.lastUpdated < 60000)) {
        // Use server data if it's recent (within 1 minute)
        return {
          limit: serverData.limit,
          remaining: serverData.remaining,
          resetTime: new Date(serverData.resetTime * 1000), // Convert from Unix timestamp
          windowStart: new Date(Date.now() - (serverData.limit - serverData.remaining) * 1000)
        };
      }

      // Fall back to local rate limit data
      const rateLimitData = await chrome.storage.local.get([this.RATE_LIMIT_STORAGE_KEY]);
      const storedData = rateLimitData?.[this.RATE_LIMIT_STORAGE_KEY];

      if (!storedData) {
        return {
          limit: this.config.rateLimitQueries,
          remaining: this.config.rateLimitQueries,
          resetTime: new Date(Date.now() + this.config.rateLimitWindow),
          windowStart: new Date()
        };
      }

      return {
        limit: this.config.rateLimitQueries,
        remaining: Math.max(0, this.config.rateLimitQueries - (storedData.count || 0)),
        resetTime: new Date(storedData.resetTime || Date.now() + this.config.rateLimitWindow),
        windowStart: new Date(storedData.windowStart || Date.now())
      };

    } catch (error) {
      console.warn('Error getting rate limit info:', error);
      return {
        limit: this.config.rateLimitQueries,
        remaining: this.config.rateLimitQueries,
        resetTime: new Date(Date.now() + this.config.rateLimitWindow),
        windowStart: new Date()
      };
    }
  }

  /**
   * Check if a request is allowed under current rate limits
   */
  async isRequestAllowed(): Promise<boolean> {
    try {
      const rateLimitInfo = await this.getRateLimitInfo();
      return rateLimitInfo.remaining > 0;
    } catch (error) {
      console.warn('Error checking if request is allowed:', error);
      return true; // Allow request if we can't check rate limit
    }
  }

  /**
   * Clear rate limit data (useful for testing or manual reset)
   */
  async clearRateLimit(): Promise<void> {
    try {
      await chrome.storage.local.remove([this.RATE_LIMIT_STORAGE_KEY]);
    } catch (error) {
      console.warn('Error clearing rate limit:', error);
    }
  }

  /**
   * Get service configuration
   */
  getConfig(): APIServiceConfig {
    return { ...this.config };
  }
}