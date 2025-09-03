import { ExtensionSettings } from './types';
import { CredentialsManager, AuthenticationUI } from './auth/credentialsManager';

interface PopupElements {
  statusIndicator: HTMLElement;
  statusText: HTMLElement;
  statusDescription: HTMLElement;
  enableInlineToggle: HTMLElement;
  autoExpandToggle: HTMLElement;
  debugToggle: HTMLElement;
  refreshButton: HTMLButtonElement;
  expandedCount: HTMLElement;
  interceptedCount: HTMLElement;
  lastReplySource: HTMLElement;
  debugInfo: HTMLElement;
  // New credentials management elements
  authSection: HTMLElement;
  connectButton: HTMLElement;
  authStatus: HTMLElement;
  quotaDisplay: HTMLElement;
  apiModeToggle: HTMLElement;
}

class PopupController {
  private elements!: PopupElements;
  private settings: ExtensionSettings = {
    enableInlineExpansion: true,
    autoExpandReplies: false,
    maxReplyDepth: 3,
    debug: false,
  };
  private credentialsManager: CredentialsManager;
  private authUI: AuthenticationUI;

  constructor() {
    this.credentialsManager = new CredentialsManager();
    this.authUI = new AuthenticationUI();
    this.init();
  }

  private async init(): Promise<void> {
    console.log('🧵 ThreadForge Popup initializing...');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupPopup());
    } else {
      this.setupPopup();
    }
  }

  private async setupPopup(): Promise<void> {
    this.getElements();
    this.setupEventListeners();
    await this.loadSettings();
    await this.checkTabStatus();
    await this.loadStats();
    await this.setupCredentialsUI();
    await this.updateQuotaDisplay();
    this.updateUI();
  }

  private getElements(): void {
    this.elements = {
      statusIndicator: document.getElementById('statusIndicator')!,
      statusText: document.getElementById('statusText')!,
      statusDescription: document.getElementById('statusDescription')!,
      enableInlineToggle: document.getElementById('enableInlineToggle')!,
      autoExpandToggle: document.getElementById('autoExpandToggle')!,
      debugToggle: document.getElementById('debugToggle')!,
      refreshButton: document.getElementById('refreshButton') as HTMLButtonElement,
      expandedCount: document.getElementById('expandedCount')!,
      interceptedCount: document.getElementById('interceptedCount')!,
      lastReplySource: document.getElementById('lastReplySource')!,
      debugInfo: document.getElementById('debugInfo')!,
      // Get credentials management elements (create if they don't exist)
      authSection: this.getOrCreateElement('authSection', 'div'),
      connectButton: this.getOrCreateElement('connectButton', 'div'),
      authStatus: this.getOrCreateElement('authStatus', 'div'),
      quotaDisplay: this.getOrCreateElement('quotaDisplay', 'div'),
      apiModeToggle: this.getOrCreateElement('apiModeToggle', 'div'),
    };
  }

  private setupEventListeners(): void {
    // Toggle switches
    this.elements.enableInlineToggle.addEventListener('click', () => {
      this.settings.enableInlineExpansion = !this.settings.enableInlineExpansion;
      this.saveSettings();
      this.updateUI();
    });

    this.elements.autoExpandToggle.addEventListener('click', () => {
      this.settings.autoExpandReplies = !this.settings.autoExpandReplies;
      this.saveSettings();
      this.updateUI();
    });

    this.elements.debugToggle.addEventListener('click', () => {
      this.settings.debug = !this.settings.debug;
      this.saveSettings();
      this.updateUI();
    });

    // Refresh button
    this.elements.refreshButton.addEventListener('click', async () => {
      await this.refreshCurrentTab();
    });

    // API mode toggle
    this.elements.apiModeToggle.addEventListener('click', () => {
      this.toggleApiMode();
    });
  }

  private async loadSettings(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get('threadForgeSettings');
      if (result.threadForgeSettings) {
        this.settings = { ...this.settings, ...result.threadForgeSettings };
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await chrome.storage.sync.set({
        threadForgeSettings: this.settings
      });
      console.log('Settings saved:', this.settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  private async checkTabStatus(): Promise<void> {
    try {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!currentTab || !currentTab.url) {
        this.setStatus('inactive', 'No active tab', 'Cannot detect current tab');
        return;
      }

      const isThreadsPage = currentTab.url.includes('threads.com');
      
      if (isThreadsPage) {
        this.setStatus('active', 'Active on Threads', 'Extension is running and ready to intercept clicks');
      } else {
        this.setStatus('inactive', 'Not on Threads', 'Visit threads.com to use this extension');
      }
    } catch (error) {
      console.error('Failed to check tab status:', error);
      this.setStatus('inactive', 'Error', 'Failed to check current tab status');
    }
  }

  private setStatus(type: 'active' | 'inactive', text: string, description: string): void {
    this.elements.statusIndicator.className = `status-indicator ${type === 'active' ? '' : 'inactive'}`;
    this.elements.statusText.textContent = text;
    this.elements.statusDescription.textContent = description;
  }

  private async loadStats(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['expandedCount', 'interceptedCount', 'lastReplySource']);
      
      this.elements.expandedCount.textContent = (result.expandedCount || 0).toString();
      this.elements.interceptedCount.textContent = (result.interceptedCount || 0).toString();
      this.elements.lastReplySource.textContent = result.lastReplySource || 'n/a';
    } catch (error) {
      console.warn('Failed to load stats:', error);
      this.elements.expandedCount.textContent = '0';
      this.elements.interceptedCount.textContent = '0';
      this.elements.lastReplySource.textContent = 'n/a';
    }
  }

  private updateUI(): void {
    // Update toggle states
    this.elements.enableInlineToggle.classList.toggle('active', this.settings.enableInlineExpansion);
    this.elements.autoExpandToggle.classList.toggle('active', this.settings.autoExpandReplies);
    this.elements.debugToggle.classList.toggle('active', !!this.settings.debug);
    
    // Disable auto-expand toggle if inline expansion is disabled
    this.elements.autoExpandToggle.style.opacity = this.settings.enableInlineExpansion ? '1' : '0.5';
    this.elements.autoExpandToggle.style.pointerEvents = this.settings.enableInlineExpansion ? 'auto' : 'none';

    // Show debug info footer when enabled
    this.elements.debugInfo.style.display = this.settings.debug ? 'block' : 'none';
  }

  private async refreshCurrentTab(): Promise<void> {
    try {
      this.elements.refreshButton.disabled = true;
      this.elements.refreshButton.textContent = '🔄 Refreshing...';
      
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (currentTab?.id) {
        await chrome.tabs.reload(currentTab.id);
        
        // Update button text temporarily
        this.elements.refreshButton.textContent = '✅ Refreshed!';
        
        setTimeout(() => {
          this.elements.refreshButton.textContent = '🔄 Refresh Current Tab';
          this.elements.refreshButton.disabled = false;
        }, 1500);
      }
    } catch (error) {
      console.error('Failed to refresh tab:', error);
      this.elements.refreshButton.textContent = '❌ Refresh Failed';
      this.elements.refreshButton.disabled = false;
      
      setTimeout(() => {
        this.elements.refreshButton.textContent = '🔄 Refresh Current Tab';
      }, 2000);
    }
  }

  /**
   * Gets existing element or creates it if it doesn't exist
   */
  private getOrCreateElement(id: string, tagName: string): HTMLElement {
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement(tagName);
      element.id = id;
      // Append to a suitable parent (find or create credentials section)
      const parent = document.querySelector('.credentials-section') || this.createCredentialsSection();
      parent.appendChild(element);
    }
    return element;
  }

  /**
   * Creates credentials section in the popup
   */
  private createCredentialsSection(): HTMLElement {
    const section = document.createElement('div');
    section.classList.add('credentials-section');
    section.style.padding = '16px';
    section.style.borderTop = '1px solid #e9ecef';
    section.style.marginTop = '16px';

    const title = document.createElement('h3');
    title.textContent = 'Threads API Integration';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '14px';
    title.style.fontWeight = '600';
    section.appendChild(title);

    // Find a good place to insert this section
    const existingContainer = document.querySelector('.container') || document.body;
    existingContainer.appendChild(section);

    return section;
  }

  /**
   * Sets up credentials management UI
   */
  private async setupCredentialsUI(): Promise<void> {
    // Create connect button
    const connectBtn = this.authUI.createConnectButton();
    this.elements.connectButton.innerHTML = '';
    this.elements.connectButton.appendChild(connectBtn);

    // Create status display
    const statusDisplay = this.authUI.createStatusDisplay();
    this.elements.authStatus.innerHTML = '';
    this.elements.authStatus.appendChild(statusDisplay);

    // Check current auth status
    const credentials = await this.credentialsManager.getStoredCredentials();
    if (credentials) {
      const isValid = await this.credentialsManager.validateCredentials(credentials);
      this.authUI.updateConnectionStatus(isValid ? 'connected' : 'error');
    } else {
      this.authUI.updateConnectionStatus('disconnected');
    }

    // Create API mode toggle
    this.setupApiModeToggle();
  }

  /**
   * Sets up API mode toggle
   */
  private setupApiModeToggle(): void {
    this.elements.apiModeToggle.innerHTML = '';
    
    const toggleContainer = document.createElement('div');
    toggleContainer.style.display = 'flex';
    toggleContainer.style.alignItems = 'center';
    toggleContainer.style.justifyContent = 'space-between';
    toggleContainer.style.marginTop = '12px';
    
    const label = document.createElement('label');
    label.textContent = 'Use Threads API';
    label.style.fontSize = '14px';
    label.style.fontWeight = '500';
    
    const toggle = document.createElement('div');
    toggle.classList.add('toggle-switch', 'tf-api-toggle');
    toggle.style.width = '44px';
    toggle.style.height = '24px';
    toggle.style.backgroundColor = '#ccc';
    toggle.style.borderRadius = '12px';
    toggle.style.position = 'relative';
    toggle.style.cursor = 'pointer';
    toggle.style.transition = 'background-color 0.3s ease';
    
    const toggleKnob = document.createElement('div');
    toggleKnob.style.width = '20px';
    toggleKnob.style.height = '20px';
    toggleKnob.style.backgroundColor = 'white';
    toggleKnob.style.borderRadius = '50%';
    toggleKnob.style.position = 'absolute';
    toggleKnob.style.top = '2px';
    toggleKnob.style.left = '2px';
    toggleKnob.style.transition = 'left 0.3s ease';
    
    toggle.appendChild(toggleKnob);
    toggleContainer.appendChild(label);
    toggleContainer.appendChild(toggle);
    this.elements.apiModeToggle.appendChild(toggleContainer);
  }

  /**
   * Toggles API mode on/off
   */
  private async toggleApiMode(): Promise<void> {
    const toggle = this.elements.apiModeToggle.querySelector('.tf-api-toggle') as HTMLElement;
    const knob = toggle.querySelector('div') as HTMLElement;
    
    const currentlyEnabled = toggle.style.backgroundColor === 'rgb(29, 161, 242)';
    const newState = !currentlyEnabled;
    
    if (newState) {
      // Enabling API mode - check credentials first
      const credentials = await this.credentialsManager.getStoredCredentials();
      if (!credentials) {
        // Show authentication flow
        this.authUI.showAuthenticationFlow().catch(() => {
          // If auth fails, keep toggle off
          this.updateApiToggleState(false);
        });
        return;
      }
      
      const isValid = await this.credentialsManager.validateCredentials(credentials);
      if (!isValid) {
        this.authUI.updateConnectionStatus('error');
        this.updateApiToggleState(false);
        return;
      }
    }
    
    this.updateApiToggleState(newState);
    
    // Save preference
    this.settings = { ...this.settings, useThreadsApi: newState };
    await this.saveSettings();
  }

  /**
   * Updates API toggle visual state
   */
  private updateApiToggleState(enabled: boolean): void {
    const toggle = this.elements.apiModeToggle.querySelector('.tf-api-toggle') as HTMLElement;
    const knob = toggle.querySelector('div') as HTMLElement;
    
    if (enabled) {
      toggle.style.backgroundColor = '#1da1f2';
      knob.style.left = '22px';
    } else {
      toggle.style.backgroundColor = '#ccc';
      knob.style.left = '2px';
    }
  }

  /**
   * Updates quota usage display
   */
  private async updateQuotaDisplay(): Promise<void> {
    try {
      const quotaUsage = await this.credentialsManager.getApiQuotaUsage();
      
      this.elements.quotaDisplay.innerHTML = '';
      
      const quotaContainer = document.createElement('div');
      quotaContainer.style.marginTop = '12px';
      quotaContainer.style.padding = '12px';
      quotaContainer.style.backgroundColor = '#f8f9fa';
      quotaContainer.style.borderRadius = '6px';
      quotaContainer.style.border = '1px solid #e9ecef';
      
      if (quotaUsage.error) {
        quotaContainer.innerHTML = `
          <div style="color: #dc3545; font-size: 12px;">
            ${quotaUsage.error}
          </div>
        `;
      } else {
        const totalUsed = quotaUsage.total_requests;
        const totalLimit = quotaUsage.total_requests + quotaUsage.remaining_requests;
        const usagePercent = Math.round((totalUsed / totalLimit) * 100);
        
        quotaContainer.innerHTML = `
          <div style="font-size: 12px; font-weight: 600; margin-bottom: 8px;">
            API Quota Usage
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px;">
            <span>Used: ${totalUsed.toLocaleString()}</span>
            <span>Remaining: ${quotaUsage.remaining_requests.toLocaleString()}</span>
          </div>
          <div style="width: 100%; height: 6px; background-color: #e9ecef; border-radius: 3px; overflow: hidden;">
            <div style="width: ${usagePercent}%; height: 100%; background-color: ${usagePercent > 80 ? '#dc3545' : '#28a745'}; transition: width 0.3s ease;"></div>
          </div>
          <div style="font-size: 11px; margin-top: 4px; color: #6c757d;">
            Daily: ${quotaUsage.daily_requests}/${quotaUsage.daily_limit}
          </div>
        `;
        
        // Show warning if usage is high
        if (usagePercent > 80) {
          this.credentialsManager.showQuotaWarning(quotaUsage);
        }
      }
      
      this.elements.quotaDisplay.appendChild(quotaContainer);
    } catch (error) {
      console.error('Failed to update quota display:', error);
    }
  }
}

// Initialize popup when DOM is ready
new PopupController();
