/**
 * User Preference Migrator - Task 22
 * Handles migration of user preferences from old to new format
 */

import { ExtensionSettings } from '../types';

interface OldSettings {
  enable_inline?: boolean;
  auto_expand?: boolean;
  max_depth?: number;
  debug_mode?: boolean;
  [key: string]: any;
}

interface MigrationReport {
  success: boolean;
  migratedFields: number;
  defaultedFields: number;
  timestamp: number;
  oldFormat?: OldSettings;
  newFormat?: ExtensionSettings;
  errors?: string[];
}

export class UserPreferenceMigrator {
  private readonly OLD_STORAGE_KEY = 'threadForgeOldSettings';
  private readonly NEW_STORAGE_KEY = 'threadForgeSettings';
  private readonly BACKUP_STORAGE_KEY = 'threadForgeOldSettingsBackup';
  
  private migrationReport: MigrationReport | null = null;

  /**
   * Checks if migration is needed
   */
  public async needsMigration(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return false;
    }

    try {
      const result = await chrome.storage.sync.get([this.OLD_STORAGE_KEY, this.NEW_STORAGE_KEY]);
      
      // If new format exists, no migration needed
      if (result[this.NEW_STORAGE_KEY]) {
        return false;
      }
      
      // If old format exists, migration needed
      return !!result[this.OLD_STORAGE_KEY];
      
    } catch (error) {
      console.warn('Failed to check migration status:', error);
      return false;
    }
  }

  /**
   * Migrates old settings to new format
   */
  public async migrateSettings(): Promise<ExtensionSettings> {
    const report: MigrationReport = {
      success: false,
      migratedFields: 0,
      defaultedFields: 0,
      timestamp: Date.now(),
      errors: []
    };

    try {
      // Load old settings
      const oldSettings = await this.loadOldSettings();
      if (!oldSettings) {
        throw new Error('No old settings found to migrate');
      }

      report.oldFormat = oldSettings;

      // Backup old settings before migration
      await this.backupOldSettings(oldSettings);

      // Convert to new format
      const newSettings = this.convertToNewFormat(oldSettings);
      report.newFormat = newSettings;

      // Count migrated vs defaulted fields
      this.analyzeFieldMigration(oldSettings, newSettings, report);

      // Save new settings
      await this.saveNewSettings(newSettings);

      // Clean up old settings (optional - keep for safety)
      // await this.removeOldSettings();

      report.success = true;
      this.migrationReport = report;

      console.log('Settings migration completed successfully:', report);
      return newSettings;

    } catch (error) {
      report.success = false;
      report.errors?.push((error as Error).message);
      this.migrationReport = report;
      
      console.error('Settings migration failed:', error);
      throw error;
    }
  }

  /**
   * Loads old settings from storage
   */
  private async loadOldSettings(): Promise<OldSettings | null> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return null;
    }

    try {
      const result = await chrome.storage.sync.get([this.OLD_STORAGE_KEY]);
      return result[this.OLD_STORAGE_KEY] || null;
    } catch (error) {
      console.warn('Failed to load old settings:', error);
      return null;
    }
  }

  /**
   * Converts old format to new format
   */
  private convertToNewFormat(oldSettings: OldSettings): ExtensionSettings {
    const defaults: ExtensionSettings = {
      enableInlineExpansion: true,
      autoExpandReplies: false,
      maxReplyDepth: 3,
      debug: false,
      useThreadsApi: false // New field, default to false
    };

    const newSettings: ExtensionSettings = { ...defaults };

    // Map old fields to new fields
    if (typeof oldSettings.enable_inline === 'boolean') {
      newSettings.enableInlineExpansion = oldSettings.enable_inline;
    }

    if (typeof oldSettings.auto_expand === 'boolean') {
      newSettings.autoExpandReplies = oldSettings.auto_expand;
    }

    if (typeof oldSettings.max_depth === 'number' && oldSettings.max_depth > 0) {
      newSettings.maxReplyDepth = oldSettings.max_depth;
    }

    if (typeof oldSettings.debug_mode === 'boolean') {
      newSettings.debug = oldSettings.debug_mode;
    }

    // Handle legacy field names that might exist
    if (typeof oldSettings.inline_expansion === 'boolean') {
      newSettings.enableInlineExpansion = oldSettings.inline_expansion;
    }

    if (typeof oldSettings.expand_replies === 'boolean') {
      newSettings.autoExpandReplies = oldSettings.expand_replies;
    }

    if (typeof oldSettings.reply_depth === 'number' && oldSettings.reply_depth > 0) {
      newSettings.maxReplyDepth = oldSettings.reply_depth;
    }

    // Handle API preference from old settings if it existed
    if (typeof oldSettings.use_api === 'boolean') {
      newSettings.useThreadsApi = oldSettings.use_api;
    }

    return newSettings;
  }

  /**
   * Analyzes which fields were migrated vs defaulted
   */
  private analyzeFieldMigration(
    oldSettings: OldSettings,
    newSettings: ExtensionSettings,
    report: MigrationReport
  ): void {
    const fieldMappings = [
      { old: 'enable_inline', new: 'enableInlineExpansion' },
      { old: 'auto_expand', new: 'autoExpandReplies' },
      { old: 'max_depth', new: 'maxReplyDepth' },
      { old: 'debug_mode', new: 'debug' },
      { old: 'use_api', new: 'useThreadsApi' }
    ];

    fieldMappings.forEach(mapping => {
      if (oldSettings.hasOwnProperty(mapping.old)) {
        report.migratedFields++;
      } else {
        report.defaultedFields++;
      }
    });
  }

  /**
   * Backs up old settings before migration
   */
  private async backupOldSettings(oldSettings: OldSettings): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      const backup = {
        settings: oldSettings,
        migratedAt: Date.now(),
        version: '1.0.0'
      };

      await chrome.storage.sync.set({
        [this.BACKUP_STORAGE_KEY]: backup
      });

    } catch (error) {
      console.warn('Failed to backup old settings:', error);
      // Don't throw - backup failure shouldn't stop migration
    }
  }

  /**
   * Saves new settings to storage
   */
  private async saveNewSettings(newSettings: ExtensionSettings): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      await chrome.storage.sync.set({
        [this.NEW_STORAGE_KEY]: newSettings
      });
    } catch (error) {
      throw new Error(`Failed to save migrated settings: ${(error as Error).message}`);
    }
  }

  /**
   * Removes old settings from storage (optional)
   */
  private async removeOldSettings(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      await chrome.storage.sync.remove([this.OLD_STORAGE_KEY]);
    } catch (error) {
      console.warn('Failed to remove old settings:', error);
      // Don't throw - cleanup failure shouldn't affect migration success
    }
  }

  /**
   * Gets migration report
   */
  public getMigrationReport(): MigrationReport | null {
    return this.migrationReport;
  }

  /**
   * Validates migrated settings
   */
  public async validateMigratedSettings(): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        errors.push('Chrome storage API not available');
        return { valid: false, errors };
      }

      const result = await chrome.storage.sync.get([this.NEW_STORAGE_KEY]);
      const settings = result[this.NEW_STORAGE_KEY];

      if (!settings) {
        errors.push('No migrated settings found');
        return { valid: false, errors };
      }

      // Validate required fields
      const requiredFields = [
        'enableInlineExpansion',
        'autoExpandReplies',
        'maxReplyDepth',
        'debug',
        'useThreadsApi'
      ];

      requiredFields.forEach(field => {
        if (!(field in settings)) {
          errors.push(`Missing required field: ${field}`);
        }
      });

      // Validate field types
      if (typeof settings.enableInlineExpansion !== 'boolean') {
        errors.push('enableInlineExpansion must be boolean');
      }

      if (typeof settings.autoExpandReplies !== 'boolean') {
        errors.push('autoExpandReplies must be boolean');
      }

      if (typeof settings.maxReplyDepth !== 'number' || settings.maxReplyDepth < 1) {
        errors.push('maxReplyDepth must be positive number');
      }

      if (typeof settings.debug !== 'boolean') {
        errors.push('debug must be boolean');
      }

      if (typeof settings.useThreadsApi !== 'boolean') {
        errors.push('useThreadsApi must be boolean');
      }

    } catch (error) {
      errors.push(`Validation error: ${(error as Error).message}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Creates a migration utility for manual migration
   */
  public createMigrationUtility(): HTMLElement {
    const container = document.createElement('div');
    container.classList.add('tf-migration-utility');
    container.style.padding = '16px';
    container.style.backgroundColor = '#f8f9fa';
    container.style.borderRadius = '8px';
    container.style.border = '1px solid #e9ecef';
    container.style.marginTop = '16px';

    const title = document.createElement('h4');
    title.textContent = 'Settings Migration';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '16px';
    title.style.fontWeight = '600';
    title.style.color = '#495057';

    const description = document.createElement('p');
    description.textContent = 'We\'ve detected old settings that can be migrated to the new format.';
    description.style.margin = '0 0 16px 0';
    description.style.fontSize = '14px';
    description.style.color = '#6c757d';
    description.style.lineHeight = '1.4';

    const buttonGroup = document.createElement('div');
    buttonGroup.style.display = 'flex';
    buttonGroup.style.gap = '8px';

    const migrateButton = document.createElement('button');
    migrateButton.textContent = 'Migrate Settings';
    migrateButton.style.padding = '8px 16px';
    migrateButton.style.backgroundColor = '#007bff';
    migrateButton.style.color = 'white';
    migrateButton.style.border = 'none';
    migrateButton.style.borderRadius = '6px';
    migrateButton.style.cursor = 'pointer';
    migrateButton.style.fontSize = '14px';

    const skipButton = document.createElement('button');
    skipButton.textContent = 'Skip Migration';
    skipButton.style.padding = '8px 16px';
    skipButton.style.backgroundColor = '#6c757d';
    skipButton.style.color = 'white';
    skipButton.style.border = 'none';
    skipButton.style.borderRadius = '6px';
    skipButton.style.cursor = 'pointer';
    skipButton.style.fontSize = '14px';

    // Add event listeners
    migrateButton.addEventListener('click', async () => {
      migrateButton.disabled = true;
      migrateButton.textContent = 'Migrating...';

      try {
        await this.migrateSettings();
        this.showMigrationSuccess(container);
      } catch (error) {
        this.showMigrationError(container, error as Error);
      } finally {
        migrateButton.disabled = false;
        migrateButton.textContent = 'Migrate Settings';
      }
    });

    skipButton.addEventListener('click', () => {
      container.style.display = 'none';
    });

    buttonGroup.appendChild(migrateButton);
    buttonGroup.appendChild(skipButton);

    container.appendChild(title);
    container.appendChild(description);
    container.appendChild(buttonGroup);

    return container;
  }

  /**
   * Shows migration success message
   */
  private showMigrationSuccess(container: HTMLElement): void {
    const report = this.getMigrationReport();
    
    container.innerHTML = `
      <div style="color: #28a745; margin-bottom: 12px;">
        <strong>Migration Successful!</strong>
      </div>
      <div style="font-size: 12px; color: #6c757d;">
        Migrated ${report?.migratedFields || 0} settings, 
        defaulted ${report?.defaultedFields || 0} new settings.
      </div>
      <div style="margin-top: 12px;">
        <button onclick="this.parentElement.parentElement.style.display='none'" 
                style="padding: 6px 12px; background: #28a745; color: white; 
                       border: none; border-radius: 4px; cursor: pointer;">
          Close
        </button>
      </div>
    `;
  }

  /**
   * Shows migration error message
   */
  private showMigrationError(container: HTMLElement, error: Error): void {
    container.innerHTML = `
      <div style="color: #dc3545; margin-bottom: 12px;">
        <strong>Migration Failed</strong>
      </div>
      <div style="font-size: 12px; color: #6c757d; margin-bottom: 12px;">
        ${error.message}
      </div>
      <div style="margin-top: 12px;">
        <button onclick="this.parentElement.parentElement.style.display='none'" 
                style="padding: 6px 12px; background: #dc3545; color: white; 
                       border: none; border-radius: 4px; cursor: pointer;">
          Close
        </button>
      </div>
    `;
  }

  /**
   * Exports current settings for backup
   */
  public async exportCurrentSettings(): Promise<string> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      throw new Error('Chrome storage API not available');
    }

    try {
      const result = await chrome.storage.sync.get([
        this.NEW_STORAGE_KEY,
        this.OLD_STORAGE_KEY,
        this.BACKUP_STORAGE_KEY
      ]);

      const exportData = {
        currentSettings: result[this.NEW_STORAGE_KEY],
        oldSettings: result[this.OLD_STORAGE_KEY],
        backupSettings: result[this.BACKUP_STORAGE_KEY],
        migrationReport: this.migrationReport,
        exportedAt: Date.now()
      };

      return JSON.stringify(exportData, null, 2);

    } catch (error) {
      throw new Error(`Failed to export settings: ${(error as Error).message}`);
    }
  }

  /**
   * Resets migration state for testing
   */
  public resetMigrationState(): void {
    this.migrationReport = null;
  }

  /**
   * Gets migration statistics
   */
  public getMigrationStatistics(): {
    totalMigrations: number;
    successfulMigrations: number;
    failedMigrations: number;
    averageFieldsMigrated: number;
  } {
    // In a real implementation, this would track statistics across multiple users
    // For now, return statistics based on current migration
    const report = this.migrationReport;
    
    return {
      totalMigrations: report ? 1 : 0,
      successfulMigrations: report?.success ? 1 : 0,
      failedMigrations: report && !report.success ? 1 : 0,
      averageFieldsMigrated: report?.migratedFields || 0
    };
  }
}