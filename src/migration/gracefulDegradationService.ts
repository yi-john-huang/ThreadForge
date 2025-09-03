/**
 * Graceful Degradation Service - Task 23
 * Handles feature degradation and fallback messaging
 */

interface BrowserCapabilities {
  supportsNotifications: boolean;
  supportsServiceWorkers: boolean;
  supportsModernJS: boolean;
  supportsWebGL: boolean;
  supportsIntersectionObserver: boolean;
}

interface FeatureAlternative {
  fallback: string;
  message: string;
  limitations: string[];
  recoveryInstructions?: string;
}

interface PerformanceStats {
  [operation: string]: {
    averageTime: number;
    totalCalls: number;
    lastCallTime: number;
  };
}

interface DegradationStatus {
  activeNotices: string[];
  performanceIssues: string[];
  fallbacksActive: string[];
  lastCheck: number;
}

interface AutoRecoveryConfig {
  enabled: boolean;
  checkInterval: number;
  maxAttempts: number;
  backoffMultiplier: number;
}

export class GracefulDegradationService {
  private performanceStats: PerformanceStats = {};
  private dismissedNotices: Set<string> = new Set();
  private recoveryAttempts: Map<string, number> = new Map();
  private autoRecoveryConfig: AutoRecoveryConfig = {
    enabled: true,
    checkInterval: 5 * 60 * 1000, // 5 minutes
    maxAttempts: 3,
    backoffMultiplier: 2
  };
  private recoveryTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeDismissedNotices();
  }

  /**
   * Initializes dismissed notices from storage
   */
  private async initializeDismissedNotices(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.sync.get(['dismissedNotices']);
        if (result.dismissedNotices) {
          this.dismissedNotices = new Set(result.dismissedNotices);
        }
      } catch (error) {
        console.warn('Failed to load dismissed notices:', error);
      }
    }
  }

  /**
   * Checks if API is available
   */
  public async isApiAvailable(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return false;
    }

    try {
      // Check if credentials exist
      const result = await chrome.storage.sync.get(['threads_credentials']);
      if (!result.threads_credentials?.access_token) {
        return false;
      }

      // Quick API health check
      const fetchImpl = (global as any).fetch || fetch;
      if (!fetchImpl) {
        return false;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetchImpl('https://graph.threads.net/health', {
          method: 'HEAD',
          headers: {
            'Authorization': `Bearer ${result.threads_credentials.access_token}`
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return response.ok;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        return false;
      }

    } catch (error) {
      console.warn('API availability check failed:', error);
      return false;
    }
  }

  /**
   * Detects browser capabilities
   */
  public detectBrowserCapabilities(): BrowserCapabilities {
    let supportsWebGL = false;
    try {
      const canvas = document.createElement('canvas');
      supportsWebGL = !!canvas.getContext('webgl');
    } catch (error) {
      // Canvas/WebGL not supported or available
      supportsWebGL = false;
    }

    return {
      supportsNotifications: typeof Notification !== 'undefined',
      supportsServiceWorkers: 'serviceWorker' in navigator,
      supportsModernJS: typeof Promise !== 'undefined' && typeof fetch !== 'undefined',
      supportsWebGL,
      supportsIntersectionObserver: typeof IntersectionObserver !== 'undefined'
    };
  }

  /**
   * Gets feature alternatives for degraded functionality
   */
  public getFeatureAlternatives(feature: string): FeatureAlternative {
    const alternatives: { [key: string]: FeatureAlternative } = {
      'threadsApi': {
        fallback: 'domScraping',
        message: 'Using page content analysis instead of API for thread data',
        limitations: [
          'Slower loading times',
          'No real-time engagement metrics',
          'Limited user profile information',
          'May break with Threads website updates'
        ],
        recoveryInstructions: 'Connect your Threads account in settings to enable API features'
      },
      'notifications': {
        fallback: 'inPageNotifications',
        message: 'Showing notifications within the page instead of system notifications',
        limitations: [
          'Notifications only visible when page is open',
          'Less prominent visual indication'
        ],
        recoveryInstructions: 'Allow notifications in browser settings'
      },
      'virtualScrolling': {
        fallback: 'standardScrolling',
        message: 'Using standard scrolling for thread display',
        limitations: [
          'Slower performance with large threads',
          'Higher memory usage'
        ]
      },
      'backgroundSync': {
        fallback: 'manualRefresh',
        message: 'Data updates require manual page refresh',
        limitations: [
          'No automatic updates',
          'May miss new replies between visits'
        ]
      },
      'modernFeatures': {
        fallback: 'basicFunctionality',
        message: 'Running in compatibility mode with basic features',
        limitations: [
          'Reduced functionality',
          'Simplified user interface',
          'No advanced customization options'
        ],
        recoveryInstructions: 'Update to a modern browser for full functionality'
      }
    };

    return alternatives[feature] || {
      fallback: 'basicMode',
      message: 'Feature unavailable, using basic alternative',
      limitations: ['Limited functionality'],
      recoveryInstructions: 'Check settings or browser compatibility'
    };
  }

  /**
   * Creates degradation notice element
   */
  public createDegradationNotice(reason: string, fallbackMode: string): HTMLElement {
    const noticeId = `degradation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    if (this.dismissedNotices.has(reason)) {
      // Return hidden element if user dismissed this notice
      const hiddenNotice = document.createElement('div');
      hiddenNotice.style.display = 'none';
      return hiddenNotice;
    }

    const notice = document.createElement('div');
    notice.className = `tf-degradation-notice ${this.getNoticeType(reason)}`;
    notice.setAttribute('data-notice-id', noticeId);
    
    const isInfo = reason.includes('fallback mode') || reason.includes('hybrid');
    const bgColor = isInfo ? '#f0f9ff' : '#fef3c7';
    const borderColor = isInfo ? '#3b82f6' : '#f59e0b';
    const iconColor = isInfo ? '#3b82f6' : '#f59e0b';
    
    notice.style.cssText = `
      background: ${bgColor};
      border: 1px solid ${borderColor};
      border-radius: 8px;
      padding: 16px;
      margin: 12px 0;
      position: relative;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    `;

    if (isInfo) {
      notice.classList.add('info');
    }

    const icon = isInfo ? 'ℹ️' : '⚠️';
    const title = isInfo ? 'Information' : 'Notice';

    notice.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="font-size: 18px; margin-top: 2px;">${icon}</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; color: #374151; margin-bottom: 8px;">${title}</div>
          <div style="color: #4b5563; margin-bottom: 12px;">${reason}</div>
          
          ${fallbackMode !== 'none' ? `
            <div style="color: #6b7280; font-size: 13px; margin-bottom: 12px;">
              Using <strong>${this.formatFallbackMode(fallbackMode)}</strong> as alternative
            </div>
          ` : ''}
          
          <div style="display: flex; align-items: center; gap: 12px; margin-top: 12px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #6b7280; cursor: pointer;">
              <input type="checkbox" style="margin: 0;">
              Don't show this again
            </label>
            <button class="dismiss-btn" style="
              background: ${iconColor};
              color: white;
              border: none;
              padding: 6px 12px;
              border-radius: 6px;
              font-size: 12px;
              cursor: pointer;
              font-weight: 500;
            ">Dismiss</button>
          </div>
        </div>
        <button class="close-btn" style="
          background: none;
          border: none;
          font-size: 16px;
          color: #9ca3af;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        ">&times;</button>
      </div>
    `;

    // Add event listeners
    const dismissBtn = notice.querySelector('.dismiss-btn') as HTMLElement;
    const closeBtn = notice.querySelector('.close-btn') as HTMLElement;
    const rememberCheckbox = notice.querySelector('input[type="checkbox"]') as HTMLInputElement;

    const handleDismiss = async () => {
      if (rememberCheckbox.checked) {
        await this.rememberDismissal(reason);
      }
      notice.remove();
    };

    dismissBtn.addEventListener('click', handleDismiss);
    closeBtn.addEventListener('click', handleDismiss);

    // Auto-dismiss after 10 seconds for info notices
    if (isInfo) {
      setTimeout(() => {
        if (notice.parentNode) {
          notice.remove();
        }
      }, 10000);
    }

    return notice;
  }

  /**
   * Creates feature limitation warning
   */
  public createFeatureLimitationWarning(limitedFeatures: string[]): HTMLElement {
    const warning = document.createElement('div');
    warning.className = 'tf-limitation-warning';
    warning.style.cssText = `
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 16px;
      margin: 12px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    `;

    warning.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="font-size: 18px; margin-top: 2px;">🚫</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; color: #dc2626; margin-bottom: 8px;">Limited Functionality</div>
          <div style="color: #7f1d1d; margin-bottom: 12px;">
            The following features are not available in your current configuration:
          </div>
          <ul style="margin: 0 0 12px 0; padding-left: 20px; color: #991b1b;">
            ${limitedFeatures.map(feature => `<li style="margin-bottom: 4px;">${feature}</li>`).join('')}
          </ul>
          <div style="font-size: 13px; color: #7f1d1d;">
            Enable API integration in settings to access these features.
          </div>
        </div>
      </div>
    `;

    return warning;
  }

  /**
   * Remembers user dismissal preference
   */
  private async rememberDismissal(reason: string): Promise<void> {
    this.dismissedNotices.add(reason);
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        await chrome.storage.sync.set({
          dismissedNotices: Array.from(this.dismissedNotices)
        });
      } catch (error) {
        console.warn('Failed to save dismissal preference:', error);
      }
    }
  }

  /**
   * Gets notice type based on reason
   */
  private getNoticeType(reason: string): string {
    if (reason.includes('API') || reason.includes('connection')) {
      return 'api-related';
    } else if (reason.includes('performance') || reason.includes('slow')) {
      return 'performance-related';
    } else if (reason.includes('browser') || reason.includes('support')) {
      return 'browser-related';
    } else {
      return 'general';
    }
  }

  /**
   * Formats fallback mode for display
   */
  private formatFallbackMode(mode: string): string {
    const formatMap: { [key: string]: string } = {
      'domScraping': 'DOM Content Analysis',
      'inPageNotifications': 'In-Page Notifications',
      'standardScrolling': 'Standard Scrolling',
      'manualRefresh': 'Manual Refresh',
      'basicMode': 'Basic Mode',
      'hybrid': 'Hybrid Mode'
    };

    return formatMap[mode] || mode;
  }

  /**
   * Starts performance monitoring
   */
  public startPerformanceMonitoring(): void {
    // Initialize stats if not already done
    if (Object.keys(this.performanceStats).length === 0) {
      this.performanceStats = {};
    }

    // Set up periodic performance checks
    setInterval(() => {
      this.checkPerformanceThresholds();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Records operation time for monitoring
   */
  public recordOperationTime(operation: string, timeMs: number): void {
    if (!this.performanceStats[operation]) {
      this.performanceStats[operation] = {
        averageTime: 0,
        totalCalls: 0,
        lastCallTime: 0
      };
    }

    const stats = this.performanceStats[operation];
    stats.totalCalls++;
    stats.lastCallTime = timeMs;
    
    // Calculate rolling average
    stats.averageTime = ((stats.averageTime * (stats.totalCalls - 1)) + timeMs) / stats.totalCalls;
  }

  /**
   * Gets performance statistics
   */
  public getPerformanceStats(): PerformanceStats {
    return { ...this.performanceStats };
  }

  /**
   * Checks performance thresholds and provides warnings
   */
  private checkPerformanceThresholds(): void {
    const slowThreshold = 1000; // 1 second
    const verySlowThreshold = 3000; // 3 seconds

    Object.entries(this.performanceStats).forEach(([operation, stats]) => {
      if (stats.averageTime > verySlowThreshold) {
        this.showPerformanceWarning(operation, 'very-slow', stats.averageTime);
      } else if (stats.averageTime > slowThreshold) {
        this.showPerformanceWarning(operation, 'slow', stats.averageTime);
      }
    });
  }

  /**
   * Shows performance warning
   */
  private showPerformanceWarning(operation: string, severity: 'slow' | 'very-slow', time: number): void {
    const warningKey = `perf-${operation}-${severity}`;
    
    if (this.dismissedNotices.has(warningKey)) {
      return;
    }

    const message = `${operation} operations are running ${severity === 'very-slow' ? 'very ' : ''}slow (${Math.round(time)}ms average)`;
    const notice = this.createDegradationNotice(message, 'performance-optimization');
    
    // Add to page if possible
    const container = document.querySelector('.tf-container') || document.body;
    if (container) {
      container.appendChild(notice);
    }
  }

  /**
   * Gets performance recommendations
   */
  public getPerformanceRecommendations(): string[] {
    const recommendations: string[] = [];
    
    Object.entries(this.performanceStats).forEach(([operation, stats]) => {
      if (operation === 'domScraping' && stats.averageTime > 500) {
        recommendations.push('Consider enabling API mode for better performance');
      }
      
      if (operation === 'apiCall' && stats.averageTime > 2000) {
        recommendations.push('Check your internet connection - API calls are slow');
      }
      
      if (stats.totalCalls > 100 && stats.averageTime > 1000) {
        recommendations.push(`Optimize ${operation} operations - they\'re consuming significant resources`);
      }
    });

    // General recommendations
    if (Object.keys(this.performanceStats).length > 5) {
      recommendations.push('Consider reducing the number of active features to improve performance');
    }

    return recommendations;
  }

  /**
   * Attempts auto-recovery when API becomes available
   */
  public async attemptAutoRecovery(): Promise<void> {
    if (!this.autoRecoveryConfig.enabled) {
      return;
    }

    const isAvailable = await this.isApiAvailable();
    
    if (isAvailable) {
      // Clear recovery attempts counter
      this.recoveryAttempts.clear();
      
      // Notify about recovery
      if (typeof chrome !== 'undefined' && chrome.notifications) {
        try {
          await chrome.notifications.create('recovery-success', {
            type: 'basic',
            iconUrl: chrome.runtime?.getURL?.('icons/icon48.png') || 'icons/icon48.png',
            title: 'Feature Restored',
            message: 'Threads API is now available. Enhanced features have been restored.'
          });
        } catch (error) {
          console.warn('Failed to show recovery notification:', error);
        }
      }

      // Reload settings to activate API mode if preferred
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        try {
          await chrome.runtime.sendMessage({
            type: 'API_RECOVERED',
            timestamp: Date.now()
          });
        } catch (error) {
          console.warn('Failed to broadcast API recovery:', error);
        }
      }
    }
  }

  /**
   * Schedules automatic recovery attempts
   */
  public scheduleAutoRecovery(): { cancel: () => void } {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
    }

    this.recoveryTimer = setInterval(() => {
      this.attemptAutoRecovery();
    }, this.autoRecoveryConfig.checkInterval);

    return {
      cancel: () => {
        if (this.recoveryTimer) {
          clearInterval(this.recoveryTimer);
          this.recoveryTimer = null;
        }
      }
    };
  }

  /**
   * Gets current degradation status
   */
  public async getCurrentStatus(): Promise<DegradationStatus> {
    const isApiAvailable = await this.isApiAvailable();
    const capabilities = this.detectBrowserCapabilities();
    
    const activeNotices: string[] = [];
    const performanceIssues: string[] = [];
    const fallbacksActive: string[] = [];

    // Check API status
    if (!isApiAvailable) {
      activeNotices.push('API unavailable');
      fallbacksActive.push('domScraping');
    }

    // Check browser capabilities
    if (!capabilities.supportsNotifications) {
      activeNotices.push('Notifications not supported');
      fallbacksActive.push('inPageNotifications');
    }

    if (!capabilities.supportsIntersectionObserver) {
      fallbacksActive.push('standardScrolling');
    }

    // Check performance issues
    Object.entries(this.performanceStats).forEach(([operation, stats]) => {
      if (stats.averageTime > 1000) {
        performanceIssues.push(`Slow ${operation} (${Math.round(stats.averageTime)}ms)`);
      }
    });

    return {
      activeNotices,
      performanceIssues,
      fallbacksActive,
      lastCheck: Date.now()
    };
  }

  /**
   * Updates auto-recovery configuration
   */
  public updateRecoveryConfig(config: Partial<AutoRecoveryConfig>): void {
    this.autoRecoveryConfig = { ...this.autoRecoveryConfig, ...config };
    
    // Restart scheduler with new config
    if (config.checkInterval || config.enabled !== undefined) {
      const currentScheduler = this.scheduleAutoRecovery();
      if (!this.autoRecoveryConfig.enabled) {
        currentScheduler.cancel();
      }
    }
  }

  /**
   * Clears all dismissed notices (useful for testing or reset)
   */
  public async clearDismissedNotices(): Promise<void> {
    this.dismissedNotices.clear();
    
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        await chrome.storage.sync.remove(['dismissedNotices']);
      } catch (error) {
        console.warn('Failed to clear dismissed notices:', error);
      }
    }
  }
}