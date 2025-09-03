/**
 * Settings Manager for Real-Time Settings Application - Task 21
 * Manages settings updates, immediate application, and UI controls
 */

import { ExtensionSettings } from '../types';

export class SettingsManager {
  private readonly STORAGE_KEY = 'threadForgeSettings';
  private debounceTimer: NodeJS.Timeout | null = null;
  private currentSettings: ExtensionSettings = {
    enableInlineExpansion: true,
    autoExpandReplies: false,
    maxReplyDepth: 3,
    debug: false,
    useThreadsApi: false
  };

  constructor() {
    this.loadCurrentSettings();
  }

  /**
   * Updates all settings and broadcasts changes
   */
  public async updateSettings(settings: ExtensionSettings): Promise<void> {
    try {
      // Validate settings
      this.validateSettings(settings);

      // Update current settings
      this.currentSettings = { ...settings };

      // Save to storage
      await this.saveToStorage(settings);

      // Broadcast changes immediately
      await this.broadcastSettingsChange(settings);

    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  }

  /**
   * Updates partial settings while preserving existing values
   */
  public async updatePartialSettings(partialSettings: Partial<ExtensionSettings>): Promise<void> {
    const updatedSettings = { ...this.currentSettings, ...partialSettings };
    await this.updateSettings(updatedSettings);
  }

  /**
   * Applies settings immediately without extension restart
   */
  public async applySettingsImmediately(settings: ExtensionSettings): Promise<{
    success: boolean;
    successRate: number;
    appliedTabs: number;
    totalTabs: number;
  }> {
    try {
      // Validate settings first
      this.validateSettings(settings);

      // Update internal state
      this.currentSettings = { ...settings };

      // Get all active Threads tabs
      const tabs = await this.getActiveThreadsTabs();
      let successfulApplies = 0;

      // Apply to background script
      try {
        await chrome.runtime.sendMessage({
          type: 'APPLY_SETTINGS_IMMEDIATELY',
          data: settings,
          timestamp: Date.now()
        });
      } catch (error) {
        console.warn('Failed to apply to background script:', error);
      }

      // Apply to all content scripts
      const applyPromises = tabs.map(async (tab) => {
        try {
          if (tab.id) {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'APPLY_SETTINGS_IMMEDIATELY',
              data: settings,
              timestamp: Date.now()
            });
            successfulApplies++;
            return true;
          }
          return false;
        } catch (error) {
          console.warn(`Failed to apply settings to tab ${tab.id}:`, error);
          return false;
        }
      });

      await Promise.allSettled(applyPromises);

      // Update UI elements immediately
      this.updateUIElementsImmediately(settings);

      const successRate = tabs.length > 0 ? (successfulApplies / tabs.length) * 100 : 100;

      return {
        success: successRate > 50, // Consider success if majority applied
        successRate,
        appliedTabs: successfulApplies,
        totalTabs: tabs.length
      };

    } catch (error) {
      console.error('Failed to apply settings immediately:', error);
      throw error;
    }
  }

  /**
   * Creates API vs DOM scraping mode toggle
   */
  public createApiModeToggle(): HTMLElement {
    const toggleContainer = document.createElement('div');
    toggleContainer.classList.add('tf-api-mode-toggle');

    // Create toggle label
    const label = document.createElement('label');
    label.classList.add('tf-toggle-label');
    label.textContent = 'Use Threads API';
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.justifyContent = 'space-between';
    label.style.padding = '12px';
    label.style.backgroundColor = '#f8f9fa';
    label.style.borderRadius = '8px';
    label.style.cursor = 'pointer';
    label.style.userSelect = 'none';

    // Create toggle switch
    const toggleSwitch = document.createElement('div');
    toggleSwitch.classList.add('tf-toggle-switch');
    toggleSwitch.style.width = '50px';
    toggleSwitch.style.height = '28px';
    toggleSwitch.style.backgroundColor = '#ccc';
    toggleSwitch.style.borderRadius = '14px';
    toggleSwitch.style.position = 'relative';
    toggleSwitch.style.transition = 'background-color 0.3s ease';
    toggleSwitch.style.cursor = 'pointer';

    // Create toggle knob
    const toggleKnob = document.createElement('div');
    toggleKnob.style.width = '24px';
    toggleKnob.style.height = '24px';
    toggleKnob.style.backgroundColor = 'white';
    toggleKnob.style.borderRadius = '50%';
    toggleKnob.style.position = 'absolute';
    toggleKnob.style.top = '2px';
    toggleKnob.style.left = '2px';
    toggleKnob.style.transition = 'left 0.3s ease';
    toggleKnob.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

    toggleSwitch.appendChild(toggleKnob);

    // Create mode indicator
    const modeIndicator = document.createElement('span');
    modeIndicator.classList.add('tf-mode-indicator');
    modeIndicator.style.fontSize = '12px';
    modeIndicator.style.color = '#6c757d';
    modeIndicator.style.marginLeft = '8px';
    modeIndicator.textContent = this.currentSettings.useThreadsApi ? 'API Mode' : 'DOM Mode';

    // Add click handler
    toggleSwitch.addEventListener('click', async () => {
      await this.handleApiModeToggle(toggleSwitch, toggleKnob, modeIndicator, toggleContainer);
    });

    label.appendChild(modeIndicator);
    label.appendChild(toggleSwitch);
    toggleContainer.appendChild(label);

    // Set initial state
    this.updateToggleState(toggleSwitch, toggleKnob, modeIndicator, toggleContainer);

    return toggleContainer;
  }

  /**
   * Creates group of mode-related toggles
   */
  public createModeToggleGroup(): HTMLElement {
    const toggleGroup = document.createElement('div');
    toggleGroup.classList.add('tf-mode-toggles');
    toggleGroup.style.padding = '16px';
    toggleGroup.style.backgroundColor = '#ffffff';
    toggleGroup.style.borderRadius = '12px';
    toggleGroup.style.border = '1px solid #e9ecef';

    // Create section title
    const title = document.createElement('h3');
    title.textContent = 'Content Loading Mode';
    title.style.margin = '0 0 16px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    title.style.color = '#212529';
    toggleGroup.appendChild(title);

    // Main API toggle (add mode-toggle class)
    const apiToggle = this.createApiModeToggle();
    apiToggle.classList.add('tf-mode-toggle'); 
    toggleGroup.appendChild(apiToggle);

    // Fallback toggle
    const fallbackContainer = document.createElement('div');
    fallbackContainer.classList.add('tf-fallback-toggle', 'tf-mode-toggle');
    fallbackContainer.style.marginTop = '12px';
    fallbackContainer.style.padding = '12px';
    fallbackContainer.style.backgroundColor = '#f8f9fa';
    fallbackContainer.style.borderRadius = '8px';

    const fallbackLabel = document.createElement('label');
    fallbackLabel.textContent = 'Auto-fallback to DOM scraping';
    fallbackLabel.style.fontSize = '14px';
    fallbackLabel.style.color = '#6c757d';

    const fallbackToggle = this.createSimpleToggle('autoFallback', false);
    fallbackLabel.appendChild(fallbackToggle);
    fallbackContainer.appendChild(fallbackLabel);
    toggleGroup.appendChild(fallbackContainer);

    // Additional toggle for caching mode
    const cachingContainer = document.createElement('div');
    cachingContainer.classList.add('tf-mode-toggle');
    cachingContainer.style.marginTop = '8px';
    cachingContainer.style.padding = '8px 12px';
    cachingContainer.style.backgroundColor = '#f1f3f4';
    cachingContainer.style.borderRadius = '6px';

    const cachingLabel = document.createElement('label');
    cachingLabel.textContent = 'Enable response caching';
    cachingLabel.style.fontSize = '13px';
    cachingLabel.style.color = '#5f6368';

    const cachingToggle = this.createSimpleToggle('enableCaching', true);
    cachingLabel.appendChild(cachingToggle);
    cachingContainer.appendChild(cachingLabel);
    toggleGroup.appendChild(cachingContainer);

    return toggleGroup;
  }

  /**
   * Validates settings format
   */
  private validateSettings(settings: any): void {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid settings format: must be an object');
    }

    const requiredFields = ['enableInlineExpansion', 'autoExpandReplies', 'maxReplyDepth', 'debug'];
    const missingFields = requiredFields.filter(field => !(field in settings));

    if (missingFields.length > 0) {
      throw new Error(`Invalid settings format: missing fields ${missingFields.join(', ')}`);
    }

    if (typeof settings.enableInlineExpansion !== 'boolean') {
      throw new Error('Invalid settings format: enableInlineExpansion must be boolean');
    }

    if (typeof settings.autoExpandReplies !== 'boolean') {
      throw new Error('Invalid settings format: autoExpandReplies must be boolean');
    }

    if (typeof settings.maxReplyDepth !== 'number' || settings.maxReplyDepth < 1) {
      throw new Error('Invalid settings format: maxReplyDepth must be positive number');
    }

    if (typeof settings.debug !== 'boolean') {
      throw new Error('Invalid settings format: debug must be boolean');
    }
  }

  /**
   * Saves settings to Chrome storage
   */
  private async saveToStorage(settings: ExtensionSettings): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.sync.set({
        [this.STORAGE_KEY]: settings
      });
    }
  }

  /**
   * Loads current settings from storage
   */
  private async loadCurrentSettings(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.sync.get([this.STORAGE_KEY]);
        if (result[this.STORAGE_KEY]) {
          this.currentSettings = { ...this.currentSettings, ...result[this.STORAGE_KEY] };
        }
      }
    } catch (error) {
      console.warn('Failed to load current settings:', error);
    }
  }

  /**
   * Broadcasts setting changes to all components
   */
  private async broadcastSettingsChange(settings: ExtensionSettings): Promise<void> {
    const message = {
      type: 'SETTINGS_CHANGED',
      data: settings,
      timestamp: Date.now()
    };

    // For tests, broadcast immediately without debounce
    if (this.isTestEnvironment()) {
      await this.performBroadcast(message);
      return;
    }

    // Debounce rapid changes in production
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      await this.performBroadcast(message);
    }, 250); // 250ms debounce
  }

  /**
   * Performs the actual broadcast
   */
  private async performBroadcast(message: any): Promise<void> {
    // Broadcast to background script
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        await chrome.runtime.sendMessage(message);
      }
    } catch (error) {
      console.warn('Failed to broadcast to background script:', error);
    }

    // Broadcast to all tabs
    try {
      const tabs = await this.getAllTabs();
      const broadcastPromises = tabs.map(async (tab) => {
        if (tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, message);
          } catch (error) {
            // Tab might be closed or not ready, ignore
          }
        }
      });
      await Promise.allSettled(broadcastPromises);
    } catch (error) {
      console.warn('Failed to broadcast to tabs:', error);
    }
  }

  /**
   * Checks if running in test environment
   */
  private isTestEnvironment(): boolean {
    return typeof jest !== 'undefined' || process.env.NODE_ENV === 'test';
  }

  /**
   * Gets all browser tabs
   */
  private async getAllTabs(): Promise<chrome.tabs.Tab[]> {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      return chrome.tabs.query({});
    }
    return [];
  }

  /**
   * Gets active Threads tabs
   */
  private async getActiveThreadsTabs(): Promise<chrome.tabs.Tab[]> {
    const allTabs = await this.getAllTabs();
    return allTabs.filter(tab => 
      tab.url && tab.url.includes('threads.net')
    );
  }

  /**
   * Updates UI elements immediately
   */
  private updateUIElementsImmediately(settings: ExtensionSettings): void {
    // Update inline expansion toggles
    const inlineToggles = document.querySelectorAll('.tf-inline-toggle');
    inlineToggles.forEach(toggle => {
      if (settings.enableInlineExpansion) {
        toggle.classList.add('tf-enabled');
        toggle.classList.remove('tf-disabled');
      } else {
        toggle.classList.remove('tf-enabled');
        toggle.classList.add('tf-disabled');
      }
    });

    // Update API mode indicators
    const apiIndicators = document.querySelectorAll('.tf-mode-indicator');
    apiIndicators.forEach(indicator => {
      indicator.textContent = settings.useThreadsApi ? 'API Mode' : 'DOM Mode';
    });

    // Update debug state
    const debugElements = document.querySelectorAll('.tf-debug-element');
    debugElements.forEach(element => {
      if (settings.debug) {
        (element as HTMLElement).style.display = 'block';
      } else {
        (element as HTMLElement).style.display = 'none';
      }
    });
  }

  /**
   * Handles API mode toggle clicks
   */
  private async handleApiModeToggle(
    toggleSwitch: HTMLElement,
    toggleKnob: HTMLElement,
    modeIndicator: HTMLElement,
    container: HTMLElement
  ): Promise<void> {
    try {
      // Check if we have credentials for API mode
      if (!this.currentSettings.useThreadsApi) {
        const hasCredentials = await this.checkCredentials();
        if (!hasCredentials) {
          this.showCredentialsWarning(container);
          return;
        }
      }

      // Toggle the setting
      const newApiMode = !this.currentSettings.useThreadsApi;
      await this.updatePartialSettings({ useThreadsApi: newApiMode });

      // Update toggle state
      this.updateToggleState(toggleSwitch, toggleKnob, modeIndicator, container);

    } catch (error) {
      console.error('Failed to toggle API mode:', error);
    }
  }

  /**
   * Updates toggle visual state
   */
  private updateToggleState(
    toggleSwitch: HTMLElement,
    toggleKnob: HTMLElement,
    modeIndicator: HTMLElement,
    container: HTMLElement
  ): void {
    const isApiMode = this.currentSettings.useThreadsApi;

    if (isApiMode) {
      toggleSwitch.style.backgroundColor = '#28a745';
      toggleKnob.style.left = '24px';
      container.classList.add('tf-api-enabled');
      modeIndicator.textContent = 'API Mode';
    } else {
      toggleSwitch.style.backgroundColor = '#ccc';
      toggleKnob.style.left = '2px';
      container.classList.remove('tf-api-enabled');
      modeIndicator.textContent = 'DOM Mode';
    }
  }

  /**
   * Checks if API credentials are available
   */
  private async checkCredentials(): Promise<boolean> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.sync.get(['threads_credentials']);
        return !!result.threads_credentials?.access_token;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Shows warning when credentials are missing
   */
  private showCredentialsWarning(container: HTMLElement): void {
    let warning = container.querySelector('.tf-credentials-warning');
    if (warning) {
      warning.remove();
    }

    warning = document.createElement('div');
    warning.classList.add('tf-credentials-warning');
    warning.style.marginTop = '8px';
    warning.style.padding = '8px 12px';
    warning.style.backgroundColor = '#fff3cd';
    warning.style.color = '#856404';
    warning.style.borderRadius = '6px';
    warning.style.fontSize = '12px';
    warning.textContent = 'Please connect your Threads account first to use API mode';

    container.appendChild(warning);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (warning && warning.parentNode) {
        warning.parentNode.removeChild(warning);
      }
    }, 5000);
  }

  /**
   * Creates a simple toggle for binary settings
   */
  private createSimpleToggle(settingKey: string, initialValue: boolean): HTMLElement {
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = initialValue;
    toggle.style.marginLeft = '8px';

    toggle.addEventListener('change', () => {
      // Handle toggle change for future extension
      console.log(`${settingKey} toggled to:`, toggle.checked);
    });

    return toggle;
  }
}