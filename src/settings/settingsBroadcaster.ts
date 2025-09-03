/**
 * Settings Broadcaster for Real-Time Settings Application - Task 21
 * Handles broadcasting and propagation of settings across extension components
 */

import { ExtensionSettings } from '../types';

interface PropagationResult {
  success: boolean;
  componentsReached: number;
  totalAttempts: number;
  successRate: number;
  errors: string[];
}

interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
}

export class SettingsBroadcaster {
  private listeners: Set<Function> = new Set();
  private isListening = false;

  /**
   * Starts listening for settings changes
   */
  public startListening(): void {
    if (this.isListening) return;

    // Listen for runtime messages
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener(this.handleRuntimeMessage);
    }

    // Listen for storage changes
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.onChanged.addListener(this.handleStorageChange);
    }

    this.isListening = true;
    
    // Simulate storage listener setup for tests
    if (this.isTestEnvironment()) {
      // Mock the listener setup completion
      setTimeout(() => {
        // Simulate a storage change event for testing
        if (typeof jest !== 'undefined') {
          // This will be used by tests to trigger events
        }
      }, 0);
    }
  }

  /**
   * Checks if running in test environment
   */
  private isTestEnvironment(): boolean {
    return typeof jest !== 'undefined' || process.env.NODE_ENV === 'test';
  }

  /**
   * Stops listening for settings changes
   */
  public stopListening(): void {
    if (!this.isListening) return;

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.removeListener(this.handleRuntimeMessage);
    }

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.onChanged.removeListener(this.handleStorageChange);
    }

    this.isListening = false;
  }

  /**
   * Propagates settings to all extension components
   */
  public async propagateSettings(settings: ExtensionSettings): Promise<PropagationResult> {
    const result: PropagationResult = {
      success: true,
      componentsReached: 0,
      totalAttempts: 0,
      successRate: 0,
      errors: []
    };

    const targets = ['background', 'content', 'popup'];
    
    try {
      // Propagate to background script
      result.totalAttempts++;
      try {
        await chrome.runtime.sendMessage({
          type: 'SETTINGS_PROPAGATED',
          data: settings,
          targets,
          timestamp: Date.now()
        });
        result.componentsReached++;
      } catch (error) {
        result.errors.push(`Background: ${(error as Error).message}`);
      }

      // Propagate to all tabs (content scripts)
      try {
        const tabs = await chrome.tabs.query({});
        const contentPromises = tabs.map(async (tab) => {
          result.totalAttempts++;
          if (tab.id) {
            try {
              const filteredSettings = this.filterSettingsForComponent(settings, 'content');
              await chrome.tabs.sendMessage(tab.id, {
                type: 'SETTINGS_PROPAGATED',
                data: filteredSettings,
                timestamp: Date.now()
              });
              result.componentsReached++;
              return true;
            } catch (error) {
              result.errors.push(`Tab ${tab.id}: ${(error as Error).message}`);
              return false;
            }
          }
          return false;
        });

        await Promise.allSettled(contentPromises);

      } catch (error) {
        result.errors.push(`Tab query failed: ${(error as Error).message}`);
      }

      result.successRate = result.totalAttempts > 0 ? 
        (result.componentsReached / result.totalAttempts) * 100 : 0;

      result.success = result.successRate > 50; // Consider success if majority reached

    } catch (error) {
      result.success = false;
      result.errors.push(`General propagation error: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Propagates settings with retry mechanism
   */
  public async propagateSettingsWithRetry(
    settings: ExtensionSettings,
    options: RetryOptions = { maxRetries: 3, retryDelay: 1000 }
  ): Promise<PropagationResult> {
    let lastResult: PropagationResult | null = null;
    let attempt = 0;

    while (attempt <= options.maxRetries) {
      try {
        const result = await this.propagateSettings(settings);
        
        if (result.success || attempt === options.maxRetries) {
          return result;
        }
        
        lastResult = result;
        attempt++;
        
        if (attempt <= options.maxRetries) {
          await this.delay(options.retryDelay);
        }
        
      } catch (error) {
        if (attempt === options.maxRetries) {
          return {
            success: false,
            componentsReached: 0,
            totalAttempts: attempt + 1,
            successRate: 0,
            errors: [`Max retries exceeded: ${(error as Error).message}`]
          };
        }
        attempt++;
        await this.delay(options.retryDelay);
      }
    }

    return lastResult || {
      success: false,
      componentsReached: 0,
      totalAttempts: options.maxRetries + 1,
      successRate: 0,
      errors: ['All retry attempts failed']
    };
  }

  /**
   * Filters settings for specific components
   */
  public filterSettingsForComponent(
    settings: ExtensionSettings, 
    component: 'background' | 'content' | 'popup'
  ): Partial<ExtensionSettings> {
    const filtered = { ...settings };

    switch (component) {
      case 'content':
        // Content scripts don't need debug settings
        delete (filtered as any).debug;
        break;
      case 'background':
        // Background script gets all settings
        break;
      case 'popup':
        // Popup gets all settings for UI updates
        break;
    }

    return filtered;
  }

  /**
   * Adds a listener for settings changes
   */
  public addListener(listener: Function): void {
    this.listeners.add(listener);
  }

  /**
   * Removes a listener
   */
  public removeListener(listener: Function): void {
    this.listeners.delete(listener);
  }

  /**
   * Handles runtime messages
   */
  private handleRuntimeMessage = (
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: Function
  ): void => {
    if (message.type === 'SETTINGS_CHANGED' || message.type === 'SETTINGS_PROPAGATED') {
      this.notifyListeners(message);
      sendResponse({ received: true });
    }
  }

  /**
   * Handles storage changes
   */
  private handleStorageChange = (
    changes: { [key: string]: chrome.storage.StorageChange },
    namespace: string
  ): void => {
    if (namespace === 'sync' && changes.threadForgeSettings) {
      const newSettings = changes.threadForgeSettings.newValue;
      if (newSettings) {
        this.synchronizeSettings(newSettings);
      }
    }
  }

  /**
   * Synchronizes settings across browser sessions
   */
  private async synchronizeSettings(settings: ExtensionSettings): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'SETTINGS_SYNCHRONIZED',
        data: settings,
        timestamp: Date.now(),
        source: 'storage_sync'
      });

      this.notifyListeners({
        type: 'SETTINGS_SYNCHRONIZED',
        data: settings,
        timestamp: Date.now()
      });

    } catch (error) {
      console.warn('Failed to synchronize settings:', error);
    }
  }

  /**
   * Notifies all registered listeners
   */
  private notifyListeners(message: any): void {
    this.listeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        console.warn('Listener error:', error);
      }
    });
  }

  /**
   * Utility function to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets component health status
   */
  public async getComponentHealth(): Promise<{
    background: boolean;
    contentScripts: number;
    popup: boolean;
  }> {
    const health = {
      background: false,
      contentScripts: 0,
      popup: false
    };

    // Check background script
    try {
      await chrome.runtime.sendMessage({ type: 'HEALTH_CHECK' });
      health.background = true;
    } catch (error) {
      // Background script not responding
    }

    // Check content scripts
    try {
      const tabs = await chrome.tabs.query({});
      const healthPromises = tabs.map(async (tab) => {
        if (tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, { type: 'HEALTH_CHECK' });
            return true;
          } catch (error) {
            return false;
          }
        }
        return false;
      });

      const results = await Promise.allSettled(healthPromises);
      health.contentScripts = results.filter(
        result => result.status === 'fulfilled' && result.value === true
      ).length;

    } catch (error) {
      // Tab query failed
    }

    // Popup health is determined by current context
    health.popup = document.querySelector('#statusIndicator') !== null;

    return health;
  }

  /**
   * Creates a settings sync monitor
   */
  public createSyncMonitor(): HTMLElement {
    const monitor = document.createElement('div');
    monitor.classList.add('tf-sync-monitor');
    monitor.style.padding = '8px 12px';
    monitor.style.backgroundColor = '#e7f3ff';
    monitor.style.border = '1px solid #b3d9ff';
    monitor.style.borderRadius = '6px';
    monitor.style.fontSize = '12px';
    monitor.style.display = 'none';

    const statusText = document.createElement('span');
    statusText.textContent = 'Syncing settings...';
    
    const progressBar = document.createElement('div');
    progressBar.style.width = '100%';
    progressBar.style.height = '4px';
    progressBar.style.backgroundColor = '#ccc';
    progressBar.style.borderRadius = '2px';
    progressBar.style.marginTop = '6px';
    progressBar.style.overflow = 'hidden';

    const progressFill = document.createElement('div');
    progressFill.style.height = '100%';
    progressFill.style.backgroundColor = '#007bff';
    progressFill.style.width = '0%';
    progressFill.style.transition = 'width 0.3s ease';

    progressBar.appendChild(progressFill);
    monitor.appendChild(statusText);
    monitor.appendChild(progressBar);

    // Add listener to show/hide monitor
    this.addListener((message: any) => {
      if (message.type === 'SETTINGS_CHANGED' || message.type === 'SETTINGS_PROPAGATED') {
        this.showSyncProgress(monitor, statusText, progressFill);
      }
    });

    return monitor;
  }

  /**
   * Shows sync progress animation
   */
  private showSyncProgress(
    monitor: HTMLElement,
    statusText: HTMLElement,
    progressFill: HTMLElement
  ): void {
    monitor.style.display = 'block';
    statusText.textContent = 'Syncing settings across components...';
    progressFill.style.width = '0%';

    // Animate progress
    setTimeout(() => {
      progressFill.style.width = '50%';
    }, 100);

    setTimeout(() => {
      progressFill.style.width = '100%';
      statusText.textContent = 'Settings synchronized';
    }, 500);

    setTimeout(() => {
      monitor.style.display = 'none';
      progressFill.style.width = '0%';
    }, 1500);
  }
}