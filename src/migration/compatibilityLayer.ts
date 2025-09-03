/**
 * Compatibility Layer for Hybrid Architecture - Task 22
 * Provides fallback logic between API and DOM scraping approaches
 */

import { CommentData } from '../types';

interface FetchResult {
  source: 'api' | 'dom';
  data: CommentData;
  responseTime: number;
  success: boolean;
}

interface FallbackStatistics {
  totalRequests: number;
  apiRequests: number;
  domRequests: number;
  apiFallbacks: number;
  domFallbacks: number;
  fallbackRate: number;
}

interface PerformanceMetrics {
  totalRequests: number;
  apiRequests: number;
  domRequests: number;
  averageResponseTime: number;
  successRate: number;
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
}

interface CircuitBreakerState {
  isOpen: boolean;
  failures: number;
  lastFailure: number;
}

type FallbackMode = 'api' | 'dom' | 'hybrid';

export class CompatibilityLayer {
  private mode: FallbackMode = 'hybrid';
  private statistics: FallbackStatistics = {
    totalRequests: 0,
    apiRequests: 0,
    domRequests: 0,
    apiFallbacks: 0,
    domFallbacks: 0,
    fallbackRate: 0
  };
  private performanceMetrics: PerformanceMetrics = {
    totalRequests: 0,
    apiRequests: 0,
    domRequests: 0,
    averageResponseTime: 0,
    successRate: 0
  };
  private circuitBreaker: CircuitBreakerState = {
    isOpen: false,
    failures: 0,
    lastFailure: 0
  };
  private circuitBreakerConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    recoveryTimeout: 30000 // 30 seconds
  };
  private fallbackChain: ('api' | 'dom')[] = ['api', 'dom'];
  private fallbackCallbacks: ((event: any) => void)[] = [];
  private responseTimes: number[] = [];

  /**
   * Checks if API is supported/available
   */
  public isApiSupported(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.runtime;
  }

  /**
   * Checks if DOM scraping is supported
   */
  public isDomScrapingSupported(): boolean {
    return typeof document !== 'undefined';
  }

  /**
   * Gets current mode
   */
  public getCurrentMode(): FallbackMode {
    return this.mode;
  }

  /**
   * Sets the operation mode
   */
  public async setMode(mode: FallbackMode): Promise<void> {
    this.mode = mode;
    
    // Save mode preference to storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        await chrome.storage.sync.set({
          compatibilityMode: mode
        });
      } catch (error) {
        console.warn('Failed to save compatibility mode:', error);
      }
    }
  }

  /**
   * Fetches thread data using the current mode with fallback
   */
  public async fetchThreadData(threadId: string): Promise<FetchResult> {
    const startTime = performance.now();
    this.statistics.totalRequests++;
    this.performanceMetrics.totalRequests++;

    try {
      let result: FetchResult;

      switch (this.mode) {
        case 'api':
          result = await this.tryApiFirst(threadId, startTime);
          break;
        case 'dom':
          result = await this.tryDomFirst(threadId, startTime);
          break;
        case 'hybrid':
        default:
          result = await this.tryHybridApproach(threadId, startTime);
          break;
      }

      this.updatePerformanceMetrics(result);
      return result;

    } catch (error) {
      console.error('All fetch methods failed:', error);
      
      // Return minimal fallback data
      const endTime = performance.now();
      return {
        source: 'dom',
        data: {
          id: threadId,
          author: 'unknown',
          text: 'Content unavailable',
          timestamp: Date.now(),
          replies: []
        },
        responseTime: endTime - startTime,
        success: false
      };
    }
  }

  /**
   * Tries API first, falls back to DOM on failure
   */
  private async tryApiFirst(threadId: string, startTime: number): Promise<FetchResult> {
    try {
      if (this.isCircuitBreakerOpen()) {
        throw new Error('Circuit breaker is open');
      }

      const apiResult = await this.fetchFromApi(threadId, startTime);
      this.resetCircuitBreaker();
      return apiResult;
      
    } catch (error) {
      this.recordApiFailure();
      this.statistics.apiFallbacks++;
      this.notifyFallback('api_unavailable', 'dom');
      
      // Automatically switch to DOM mode if too many failures
      if (this.statistics.apiFallbacks > 10) {
        await this.setMode('dom');
      }
      
      return this.fetchFromDom(threadId, startTime);
    }
  }

  /**
   * Tries DOM first, can fall back to API if needed
   */
  private async tryDomFirst(threadId: string, startTime: number): Promise<FetchResult> {
    try {
      return await this.fetchFromDom(threadId, startTime);
    } catch (error) {
      this.statistics.domFallbacks++;
      this.notifyFallback('dom_unavailable', 'api');
      
      // Try API as fallback
      try {
        return await this.fetchFromApi(threadId, startTime);
      } catch (apiError) {
        throw new Error('Both DOM and API methods failed');
      }
    }
  }

  /**
   * Hybrid approach - intelligently choose between API and DOM
   */
  private async tryHybridApproach(threadId: string, startTime: number): Promise<FetchResult> {
    const preferredMode = await this.getPreferredMode();
    
    for (const method of this.fallbackChain) {
      try {
        if (method === 'api' && (preferredMode === 'api' || !this.isCircuitBreakerOpen())) {
          const result = await this.fetchFromApi(threadId, startTime);
          this.resetCircuitBreaker();
          return result;
        } else if (method === 'dom') {
          return await this.fetchFromDom(threadId, startTime);
        }
      } catch (error) {
        if (method === 'api') {
          this.recordApiFailure();
          this.statistics.apiFallbacks++;
        }
        // Continue to next method in fallback chain
        continue;
      }
    }

    throw new Error('All methods in fallback chain failed');
  }

  /**
   * Fetches data from Threads API
   */
  private async fetchFromApi(threadId: string, startTime: number): Promise<FetchResult> {
    const credentials = await this.getStoredCredentials();
    if (!credentials?.access_token) {
      throw new Error('No API credentials available');
    }

    const fetchImpl = (global as any).fetch || fetch;
    const response = await fetchImpl(`https://graph.threads.net/${threadId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const endTime = performance.now();
    
    this.statistics.apiRequests++;
    this.performanceMetrics.apiRequests++;

    return {
      source: 'api',
      data: this.normalizeApiData(data),
      responseTime: endTime - startTime,
      success: true
    };
  }

  /**
   * Fetches data from DOM scraping
   */
  private async fetchFromDom(threadId: string, startTime: number): Promise<FetchResult> {
    const threadElement = this.findThreadElement(threadId);
    if (!threadElement) {
      throw new Error('Thread element not found in DOM');
    }

    const data = this.extractDataFromDom(threadElement, threadId);
    const endTime = performance.now();
    
    this.statistics.domRequests++;
    this.performanceMetrics.domRequests++;

    return {
      source: 'dom',
      data,
      responseTime: endTime - startTime,
      success: true
    };
  }

  /**
   * Finds thread element in DOM
   */
  private findThreadElement(threadId: string): Element | null {
    // Look for various thread element patterns
    const selectors = [
      `[data-testid="thread-content"]`,
      `[data-thread-id="${threadId}"]`,
      `.thread-container`,
      `article[role="article"]`
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    return null;
  }

  /**
   * Extracts data from DOM element
   */
  private extractDataFromDom(element: Element, threadId: string): CommentData {
    const authorElement = element.querySelector('.thread-author, [data-testid="author"]');
    const textElement = element.querySelector('.thread-text, [data-testid="content"]');
    const repliesContainer = element.querySelector('.replies-container, [data-testid="replies"]');
    
    const replies: CommentData[] = [];
    if (repliesContainer) {
      const replyElements = repliesContainer.querySelectorAll('.reply, [data-testid="reply"]');
      replyElements.forEach((replyEl, index) => {
        replies.push({
          id: `${threadId}-reply-${index}`,
          author: replyEl.querySelector('.reply-author')?.textContent || 'unknown',
          text: replyEl.textContent || '',
          timestamp: Date.now(),
          replies: []
        });
      });
    }

    return {
      id: threadId,
      author: authorElement?.textContent || 'unknown',
      text: textElement?.textContent || '',
      timestamp: Date.now(),
      replies
    };
  }

  /**
   * Normalizes API data to consistent format
   */
  private normalizeApiData(apiData: any): CommentData {
    return {
      id: apiData.id || 'unknown',
      author: apiData.author || apiData.user?.username || 'unknown',
      text: apiData.text || apiData.content || '',
      timestamp: apiData.timestamp || Date.now(),
      replies: (apiData.replies || []).map((reply: any) => this.normalizeApiData(reply))
    };
  }

  /**
   * Checks API availability
   */
  public async checkApiAvailability(): Promise<boolean> {
    try {
      const credentials = await this.getStoredCredentials();
      if (!credentials?.access_token) {
        return false;
      }

      const fetchImpl = (global as any).fetch || fetch;
      const response = await fetchImpl('https://graph.threads.net/health', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`
        },
        timeout: 5000
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Attempts to recover API connection
   */
  public async attemptApiRecovery(): Promise<void> {
    const isAvailable = await this.checkApiAvailability();
    if (isAvailable) {
      this.resetCircuitBreaker();
      
      // If user prefers API and we're in DOM mode due to failures, switch back
      const userSettings = await this.getUserSettings();
      if (userSettings?.useThreadsApi && this.mode === 'dom') {
        await this.setMode('hybrid');
      }
    }
  }

  /**
   * Gets stored credentials
   */
  private async getStoredCredentials(): Promise<any> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.sync.get(['threads_credentials']);
        return result.threads_credentials;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  /**
   * Gets user settings
   */
  private async getUserSettings(): Promise<any> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.sync.get(['threadForgeSettings']);
        return result.threadForgeSettings;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  /**
   * Gets preferred mode based on user settings
   */
  public async getPreferredMode(): Promise<'api' | 'dom'> {
    const settings = await this.getUserSettings();
    if (settings?.useThreadsApi) {
      return 'api';
    }
    return 'dom';
  }

  /**
   * Configures circuit breaker
   */
  public configureCircuitBreaker(config: Partial<CircuitBreakerConfig>): void {
    this.circuitBreakerConfig = { ...this.circuitBreakerConfig, ...config };
  }

  /**
   * Gets circuit breaker state
   */
  public getCircuitBreakerState(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  /**
   * Checks if circuit breaker is open
   */
  private isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreaker.isOpen) {
      return false;
    }

    // Check if recovery timeout has passed
    const now = Date.now();
    if (now - this.circuitBreaker.lastFailure > this.circuitBreakerConfig.recoveryTimeout) {
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failures = 0;
      return false;
    }

    return true;
  }

  /**
   * Records API failure for circuit breaker
   */
  private recordApiFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failures >= this.circuitBreakerConfig.failureThreshold) {
      this.circuitBreaker.isOpen = true;
    }
  }

  /**
   * Resets circuit breaker
   */
  private resetCircuitBreaker(): void {
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastFailure = 0;
  }

  /**
   * Adds fallback notification callback
   */
  public onFallback(callback: (event: any) => void): void {
    this.fallbackCallbacks.push(callback);
  }

  /**
   * Notifies about fallback events
   */
  private notifyFallback(reason: string, fallbackMode: string): void {
    const event = {
      reason,
      fallbackMode,
      timestamp: Date.now()
    };

    this.fallbackCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.warn('Fallback callback error:', error);
      }
    });
  }

  /**
   * Gets fallback statistics
   */
  public getFallbackStatistics(): FallbackStatistics {
    this.statistics.fallbackRate = this.statistics.totalRequests > 0 
      ? (this.statistics.apiFallbacks + this.statistics.domFallbacks) / this.statistics.totalRequests 
      : 0;
    
    return { ...this.statistics };
  }

  /**
   * Gets performance metrics
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    this.performanceMetrics.averageResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length 
      : 0;
    
    this.performanceMetrics.successRate = this.performanceMetrics.totalRequests > 0 
      ? ((this.performanceMetrics.apiRequests + this.performanceMetrics.domRequests) / this.performanceMetrics.totalRequests) * 100 
      : 0;
    
    return { ...this.performanceMetrics };
  }

  /**
   * Updates performance metrics
   */
  private updatePerformanceMetrics(result: FetchResult): void {
    this.responseTimes.push(result.responseTime);
    
    // Keep only last 100 response times for rolling average
    if (this.responseTimes.length > 100) {
      this.responseTimes = this.responseTimes.slice(-100);
    }
  }

  /**
   * Sets fallback chain order
   */
  public setFallbackChain(chain: ('api' | 'dom')[]): void {
    this.fallbackChain = [...chain];
  }

  /**
   * Gets current fallback chain
   */
  public getFallbackChain(): ('api' | 'dom')[] {
    return [...this.fallbackChain];
  }

  /**
   * Resets all statistics
   */
  public resetStatistics(): void {
    this.statistics = {
      totalRequests: 0,
      apiRequests: 0,
      domRequests: 0,
      apiFallbacks: 0,
      domFallbacks: 0,
      fallbackRate: 0
    };
    
    this.performanceMetrics = {
      totalRequests: 0,
      apiRequests: 0,
      domRequests: 0,
      averageResponseTime: 0,
      successRate: 0
    };
    
    this.responseTimes = [];
  }
}