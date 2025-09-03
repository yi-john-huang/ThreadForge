/**
 * Upgrade Notification Service - Task 23
 * Handles upgrade notifications and version management
 */

interface VersionChangelog {
  version: string;
  features: string[];
  improvements: string[];
  breaking?: string[];
  date?: string;
}

interface NotificationSettings {
  upgradeNotifications: boolean;
  featureHighlights: boolean;
  cooldownHours: number;
}

interface NotificationInteraction {
  notificationId: string;
  action: 'clicked' | 'dismissed' | 'shown';
  timestamp: number;
}

export class UpgradeNotificationService {
  private readonly CHANGELOG: { [version: string]: VersionChangelog } = {
    '2.0.0': {
      version: '2.0.0',
      features: [
        'Threads API Integration',
        'Real-time Performance Monitoring',
        'Enhanced Authentication',
        'Hybrid Architecture Support'
      ],
      improvements: [
        'Faster comment loading',
        'Better error handling',
        'Improved UI responsiveness',
        'Reduced memory usage'
      ],
      breaking: [
        'Settings format updated (automatic migration)'
      ],
      date: '2024-01-15'
    },
    '1.9.0': {
      version: '1.9.0',
      features: [
        'Virtual Scrolling',
        'Advanced Caching',
        'Settings Import/Export'
      ],
      improvements: [
        'Better thread rendering',
        'Improved settings UI'
      ],
      date: '2023-12-01'
    }
  };

  private readonly DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
    upgradeNotifications: true,
    featureHighlights: true,
    cooldownHours: 24
  };

  private notificationCallbacks: ((notificationId: string) => void)[] = [];

  constructor() {
    this.initializeNotificationHandlers();
  }

  /**
   * Initializes notification event handlers
   */
  private initializeNotificationHandlers(): void {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.onClicked.addListener((notificationId) => {
        this.handleNotificationClick(notificationId);
      });
    }
  }

  /**
   * Checks if this is a first-time installation
   */
  public async isFirstTimeInstall(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return false;
    }

    try {
      const result = await chrome.storage.sync.get(['lastVersion', 'installDate']);
      return !result.lastVersion && !result.installDate;
    } catch (error) {
      console.warn('Failed to check first-time install status:', error);
      return false;
    }
  }

  /**
   * Checks if current version is an upgrade
   */
  public async isVersionUpgrade(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.storage) {
      return false;
    }

    try {
      const manifest = chrome.runtime.getManifest();
      const currentVersion = manifest.version;
      
      const result = await chrome.storage.sync.get(['lastVersion']);
      const lastVersion = result.lastVersion;

      if (!lastVersion) {
        // Save current version as baseline
        await chrome.storage.sync.set({
          lastVersion: currentVersion,
          installDate: Date.now()
        });
        return false;
      }

      return this.isNewerVersion(currentVersion, lastVersion);
    } catch (error) {
      console.warn('Failed to check version upgrade:', error);
      return false;
    }
  }

  /**
   * Compares version strings
   */
  private isNewerVersion(current: string, last: string): boolean {
    const currentParts = current.split('.').map(Number);
    const lastParts = last.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, lastParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const lastPart = lastParts[i] || 0;

      if (currentPart > lastPart) return true;
      if (currentPart < lastPart) return false;
    }

    return false;
  }

  /**
   * Gets changelog for specific version
   */
  public getVersionChangelog(version: string): VersionChangelog | null {
    return this.CHANGELOG[version] || null;
  }

  /**
   * Shows upgrade notification
   */
  public async showUpgradeNotification(version: string): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.notifications) {
      return;
    }

    const changelog = this.getVersionChangelog(version);
    if (!changelog) {
      console.warn('No changelog found for version:', version);
      return;
    }

    try {
      const notificationId = `upgrade-${version}-${Date.now()}`;
      
      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: this.getNotificationIcon(),
        title: `ThreadForge Updated to v${version}!`,
        message: `New features: ${changelog.features.slice(0, 2).join(', ')}${changelog.features.length > 2 ? '...' : ''}`,
        buttons: [
          { title: 'View Changes' },
          { title: 'Dismiss' }
        ]
      });

      await this.recordNotificationInteraction(notificationId, 'shown');
      await this.updateLastNotificationTime();

    } catch (error) {
      console.error('Failed to show upgrade notification:', error);
    }
  }

  /**
   * Shows feature highlight notification
   */
  public async showFeatureHighlight(features: string[]): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.notifications) {
      return;
    }

    try {
      const notificationId = `features-${Date.now()}`;
      
      await chrome.notifications.create(notificationId, {
        type: 'list',
        iconUrl: this.getNotificationIcon(),
        title: 'New Features Available!',
        message: 'ThreadForge has been enhanced with new capabilities:',
        items: features.slice(0, 4).map(feature => ({
          title: feature,
          message: this.getFeatureDescription(feature)
        }))
      });

      await this.recordNotificationInteraction(notificationId, 'shown');

    } catch (error) {
      console.error('Failed to show feature highlight:', error);
    }
  }

  /**
   * Gets feature description for notifications
   */
  private getFeatureDescription(feature: string): string {
    const descriptions: { [key: string]: string } = {
      'Threads API Integration': 'Access real-time data directly from Threads',
      'Real-time Performance Monitoring': 'Track extension performance and optimize usage',
      'Enhanced Authentication': 'Secure OAuth2 integration with Threads',
      'Hybrid Architecture Support': 'Seamless fallback between API and DOM scraping',
      'Virtual Scrolling': 'Handle large threads with improved performance',
      'Advanced Caching': 'Faster loading with intelligent data caching',
      'Settings Import/Export': 'Backup and restore your preferences'
    };
    
    return descriptions[feature] || 'Enhanced functionality for better user experience';
  }

  /**
   * Dismisses a notification
   */
  public async dismissNotification(notificationId: string): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.notifications) {
      return;
    }

    try {
      await chrome.notifications.clear(notificationId);
      await this.recordNotificationInteraction(notificationId, 'dismissed');
    } catch (error) {
      console.warn('Failed to dismiss notification:', error);
    }
  }

  /**
   * Handles notification click events
   */
  public async handleNotificationClick(notificationId: string): Promise<void> {
    await this.recordNotificationInteraction(notificationId, 'clicked');
    
    // Notify callbacks
    this.notificationCallbacks.forEach(callback => {
      try {
        callback(notificationId);
      } catch (error) {
        console.warn('Notification callback error:', error);
      }
    });

    // Handle specific notification types
    if (notificationId.startsWith('upgrade-')) {
      this.handleUpgradeNotificationClick(notificationId);
    } else if (notificationId.startsWith('features-')) {
      this.handleFeatureNotificationClick(notificationId);
    }
  }

  /**
   * Handles upgrade notification clicks
   */
  private async handleUpgradeNotificationClick(notificationId: string): Promise<void> {
    // Extract version from notification ID
    const versionMatch = notificationId.match(/upgrade-([^-]+)/);
    if (versionMatch) {
      const version = versionMatch[1];
      const changelog = this.getVersionChangelog(version);
      
      if (changelog) {
        // Show detailed changelog in popup or new tab
        this.showDetailedChangelog(changelog);
      }
    }
  }

  /**
   * Handles feature notification clicks
   */
  private async handleFeatureNotificationClick(notificationId: string): Promise<void> {
    // Open extension popup or settings page
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        await chrome.runtime.sendMessage({
          type: 'OPEN_SETTINGS',
          source: 'feature_notification'
        });
      } catch (error) {
        console.warn('Failed to open settings from notification:', error);
      }
    }
  }

  /**
   * Shows detailed changelog
   */
  private showDetailedChangelog(changelog: VersionChangelog): void {
    // Create and show changelog modal or popup
    const modal = this.createChangelogModal(changelog);
    document.body.appendChild(modal);
  }

  /**
   * Creates changelog modal element
   */
  private createChangelogModal(changelog: VersionChangelog): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'tf-changelog-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const content = document.createElement('div');
    content.className = 'tf-changelog-content';
    content.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    `;

    content.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #333; font-size: 24px;">What's New in v${changelog.version}</h2>
        <button class="close-btn" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
      </div>
      
      ${changelog.features.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h3 style="color: #2563eb; font-size: 18px; margin: 0 0 12px 0;">🚀 New Features</h3>
          <ul style="margin: 0; padding-left: 20px; color: #555;">
            ${changelog.features.map(feature => `<li style="margin-bottom: 8px;">${feature}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${changelog.improvements.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h3 style="color: #059669; font-size: 18px; margin: 0 0 12px 0;">✨ Improvements</h3>
          <ul style="margin: 0; padding-left: 20px; color: #555;">
            ${changelog.improvements.map(improvement => `<li style="margin-bottom: 8px;">${improvement}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${changelog.breaking && changelog.breaking.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h3 style="color: #dc2626; font-size: 18px; margin: 0 0 12px 0;">⚠️ Important Changes</h3>
          <ul style="margin: 0; padding-left: 20px; color: #555;">
            ${changelog.breaking.map(change => `<li style="margin-bottom: 8px;">${change}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      <div style="text-align: right; margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <button class="close-btn" style="background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px;">
          Got it!
        </button>
      </div>
    `;

    // Add event listeners
    const closeButtons = content.querySelectorAll('.close-btn');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        modal.remove();
      });
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    modal.appendChild(content);
    return modal;
  }

  /**
   * Adds notification click callback
   */
  public onNotificationClicked(callback: (notificationId: string) => void): void {
    this.notificationCallbacks.push(callback);
  }

  /**
   * Checks if upgrade notification should be shown
   */
  public async shouldShowUpgradeNotification(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return false;
    }

    try {
      const result = await chrome.storage.sync.get([
        'notificationSettings',
        'lastNotificationShown'
      ]);

      const settings = { ...this.DEFAULT_NOTIFICATION_SETTINGS, ...result.notificationSettings };
      
      if (!settings.upgradeNotifications) {
        return false;
      }

      const lastShown = result.lastNotificationShown || 0;
      const cooldownMs = settings.cooldownHours * 60 * 60 * 1000;
      
      return Date.now() - lastShown > cooldownMs;

    } catch (error) {
      console.warn('Failed to check notification settings:', error);
      return true; // Default to showing notifications
    }
  }

  /**
   * Records notification interaction
   */
  private async recordNotificationInteraction(notificationId: string, action: 'clicked' | 'dismissed' | 'shown'): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      const interaction: NotificationInteraction = {
        notificationId,
        action,
        timestamp: Date.now()
      };

      const result = await chrome.storage.local.get(['notificationHistory']);
      const history = result.notificationHistory || [];
      
      history.push(interaction);
      
      // Keep only last 100 interactions
      if (history.length > 100) {
        history.splice(0, history.length - 100);
      }

      await chrome.storage.local.set({ notificationHistory: history });

    } catch (error) {
      console.warn('Failed to record notification interaction:', error);
    }
  }

  /**
   * Gets notification history
   */
  public async getNotificationHistory(): Promise<NotificationInteraction[]> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return [];
    }

    try {
      const result = await chrome.storage.local.get(['notificationHistory']);
      return result.notificationHistory || [];
    } catch (error) {
      console.warn('Failed to get notification history:', error);
      return [];
    }
  }

  /**
   * Updates last notification time
   */
  private async updateLastNotificationTime(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      await chrome.storage.sync.set({
        lastNotificationShown: Date.now()
      });
    } catch (error) {
      console.warn('Failed to update last notification time:', error);
    }
  }

  /**
   * Gets notification icon URL
   */
  private getNotificationIcon(): string {
    return chrome.runtime?.getURL?.('icons/icon48.png') || 'icons/icon48.png';
  }

  /**
   * Creates upgrade badge element
   */
  public createUpgradeBadge(): HTMLElement {
    const badge = document.createElement('div');
    badge.className = 'tf-upgrade-badge';
    badge.style.cssText = `
      position: absolute;
      top: -8px;
      right: -8px;
      background: #ef4444;
      color: white;
      border-radius: 10px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
      z-index: 1000;
      animation: pulse 2s infinite;
    `;
    
    badge.textContent = 'NEW';
    
    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
    `;
    
    if (!document.head.querySelector('style[data-tf-badge-styles]')) {
      style.setAttribute('data-tf-badge-styles', 'true');
      document.head.appendChild(style);
    }
    
    return badge;
  }

  /**
   * Creates feature announcement banner
   */
  public createFeatureBanner(features: string[]): HTMLElement {
    const banner = document.createElement('div');
    banner.className = 'tf-feature-banner';
    banner.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      margin: 16px 0;
      position: relative;
      box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
    `;

    banner.innerHTML = `
      <button class="tf-dismiss-btn" style="
        position: absolute;
        top: 8px;
        right: 12px;
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        opacity: 0.8;
        transition: opacity 0.2s;
      ">&times;</button>
      
      <h3 style="margin: 0 0 12px 0; font-size: 18px;">🎉 New Features Available!</h3>
      <ul style="margin: 0; padding-left: 20px; list-style-type: none;">
        ${features.map(feature => `
          <li style="margin-bottom: 8px; position: relative; padding-left: 16px;">
            <span style="position: absolute; left: 0; top: 0;">✨</span>
            ${feature}
          </li>
        `).join('')}
      </ul>
      
      <div style="margin-top: 16px; text-align: right;">
        <button class="tf-learn-more-btn" style="
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.2s;
        ">Learn More</button>
      </div>
    `;

    // Add event listeners
    const dismissBtn = banner.querySelector('.tf-dismiss-btn') as HTMLElement;
    const learnMoreBtn = banner.querySelector('.tf-learn-more-btn') as HTMLElement;

    dismissBtn.addEventListener('click', () => {
      banner.remove();
    });

    dismissBtn.addEventListener('mouseover', () => {
      dismissBtn.style.opacity = '1';
    });

    dismissBtn.addEventListener('mouseout', () => {
      dismissBtn.style.opacity = '0.8';
    });

    learnMoreBtn.addEventListener('click', () => {
      // Open settings or documentation
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: 'OPEN_SETTINGS',
          source: 'feature_banner'
        });
      }
    });

    learnMoreBtn.addEventListener('mouseover', () => {
      learnMoreBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
    });

    learnMoreBtn.addEventListener('mouseout', () => {
      learnMoreBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    });

    return banner;
  }

  /**
   * Updates current version in storage
   */
  public async updateCurrentVersion(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.storage) {
      return;
    }

    try {
      const manifest = chrome.runtime.getManifest();
      await chrome.storage.sync.set({
        lastVersion: manifest.version,
        lastUpdateCheck: Date.now()
      });
    } catch (error) {
      console.warn('Failed to update current version:', error);
    }
  }

  /**
   * Gets notification settings
   */
  public async getNotificationSettings(): Promise<NotificationSettings> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return this.DEFAULT_NOTIFICATION_SETTINGS;
    }

    try {
      const result = await chrome.storage.sync.get(['notificationSettings']);
      return { ...this.DEFAULT_NOTIFICATION_SETTINGS, ...result.notificationSettings };
    } catch (error) {
      console.warn('Failed to get notification settings:', error);
      return this.DEFAULT_NOTIFICATION_SETTINGS;
    }
  }

  /**
   * Updates notification settings
   */
  public async updateNotificationSettings(settings: Partial<NotificationSettings>): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      const current = await this.getNotificationSettings();
      const updated = { ...current, ...settings };
      await chrome.storage.sync.set({ notificationSettings: updated });
    } catch (error) {
      console.warn('Failed to update notification settings:', error);
    }
  }
}