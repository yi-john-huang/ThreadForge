import { ExtensionSettings } from './types';

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
}

class PopupController {
  private elements!: PopupElements;
  private settings: ExtensionSettings = {
    enableInlineExpansion: true,
    autoExpandReplies: false,
    maxReplyDepth: 3,
    debug: false,
  };

  constructor() {
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
}

// Initialize popup when DOM is ready
new PopupController();
