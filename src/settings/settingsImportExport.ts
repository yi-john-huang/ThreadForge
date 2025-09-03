/**
 * Settings Import/Export for Real-Time Settings Application - Task 21
 * Handles importing and exporting extension settings
 */

import { ExtensionSettings } from '../types';

interface ExportData {
  settings: ExtensionSettings;
  metadata: {
    exportedAt: number;
    version: string;
    extension: string;
  };
}

export class SettingsImportExport {
  private readonly STORAGE_KEY = 'threadForgeSettings';
  private readonly EXTENSION_VERSION = '1.0.7';
  private readonly EXTENSION_NAME = 'ThreadForge';

  /**
   * Exports current settings to exportable format
   */
  public async exportSettings(): Promise<ExportData> {
    try {
      let currentSettings: ExtensionSettings = {
        enableInlineExpansion: true,
        autoExpandReplies: false,
        maxReplyDepth: 3,
        debug: false,
        useThreadsApi: false
      };

      // Get current settings from storage
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const result = await chrome.storage.sync.get([this.STORAGE_KEY]);
        if (result[this.STORAGE_KEY]) {
          currentSettings = { ...currentSettings, ...result[this.STORAGE_KEY] };
        }
      }

      const exportData: ExportData = {
        settings: currentSettings,
        metadata: {
          exportedAt: Date.now(),
          version: this.EXTENSION_VERSION,
          extension: this.EXTENSION_NAME
        }
      };

      return exportData;

    } catch (error) {
      console.error('Failed to export settings:', error);
      throw new Error('Failed to export settings: ' + (error as Error).message);
    }
  }

  /**
   * Creates a downloadable link for exported settings
   */
  public async createDownloadLink(exportData: ExportData): Promise<HTMLAnchorElement> {
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `threadforge-settings-${Date.now()}.json`;
    link.style.display = 'none';
    
    return link;
  }

  /**
   * Imports settings from JSON string
   */
  public async importSettings(jsonData: string): Promise<ExtensionSettings> {
    try {
      const importData = JSON.parse(jsonData) as ExportData;
      
      // Validate import data structure
      if (!importData.settings || typeof importData.settings !== 'object') {
        throw new Error('Invalid settings format: missing or invalid settings object');
      }

      // Validate and merge with defaults
      const validatedSettings = this.validateAndMergeSettings(importData.settings);

      // Save to storage
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.sync.set({
          [this.STORAGE_KEY]: validatedSettings
        });
      }

      // Broadcast the import
      await this.broadcastSettingsImport(validatedSettings);

      return validatedSettings;

    } catch (error) {
      console.error('Failed to import settings:', error);
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON format');
      }
      throw new Error('Failed to import settings: ' + (error as Error).message);
    }
  }

  /**
   * Creates file selector for importing settings
   */
  public createImportFileSelector(): HTMLInputElement {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.classList.add('tf-settings-import');
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      
      if (file) {
        try {
          const settings = await this.handleFileImport(file);
          this.showImportSuccess(settings);
        } catch (error) {
          this.showImportError(error as Error);
        }
      }
    });

    return fileInput;
  }

  /**
   * Handles file import process
   */
  public async handleFileImport(file: File): Promise<ExtensionSettings> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const settings = await this.importSettings(content);
          resolve(settings);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file);
    });
  }

  /**
   * Creates export button with download functionality
   */
  public createExportButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = 'Export Settings';
    button.classList.add('tf-export-button');
    button.style.padding = '8px 16px';
    button.style.backgroundColor = '#007bff';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '6px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '14px';

    button.addEventListener('click', async () => {
      try {
        button.disabled = true;
        button.textContent = 'Exporting...';

        const exportData = await this.exportSettings();
        const downloadLink = await this.createDownloadLink(exportData);
        
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        this.showExportSuccess();

      } catch (error) {
        this.showExportError(error as Error);
      } finally {
        button.disabled = false;
        button.textContent = 'Export Settings';
      }
    });

    return button;
  }

  /**
   * Creates import button
   */
  public createImportButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = 'Import Settings';
    button.classList.add('tf-import-button');
    button.style.padding = '8px 16px';
    button.style.backgroundColor = '#28a745';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '6px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '14px';
    button.style.marginLeft = '8px';

    const fileInput = this.createImportFileSelector();
    
    button.addEventListener('click', () => {
      fileInput.click();
    });

    // Attach file input to button (hidden)
    button.appendChild(fileInput);

    return button;
  }

  /**
   * Creates import/export controls group
   */
  public createImportExportControls(): HTMLElement {
    const container = document.createElement('div');
    container.classList.add('tf-import-export-controls');
    container.style.padding = '16px';
    container.style.backgroundColor = '#f8f9fa';
    container.style.borderRadius = '8px';
    container.style.border = '1px solid #e9ecef';
    container.style.marginTop = '16px';

    const title = document.createElement('h4');
    title.textContent = 'Settings Backup';
    title.style.margin = '0 0 12px 0';
    title.style.fontSize = '14px';
    title.style.fontWeight = '600';
    title.style.color = '#495057';

    const description = document.createElement('p');
    description.textContent = 'Export your settings to backup or share them, or import previously saved settings.';
    description.style.margin = '0 0 16px 0';
    description.style.fontSize = '12px';
    description.style.color = '#6c757d';
    description.style.lineHeight = '1.4';

    const buttonGroup = document.createElement('div');
    buttonGroup.style.display = 'flex';
    buttonGroup.style.gap = '8px';

    const exportButton = this.createExportButton();
    const importButton = this.createImportButton();

    buttonGroup.appendChild(exportButton);
    buttonGroup.appendChild(importButton);

    container.appendChild(title);
    container.appendChild(description);
    container.appendChild(buttonGroup);

    return container;
  }

  /**
   * Validates and merges imported settings with defaults
   */
  private validateAndMergeSettings(importedSettings: any): ExtensionSettings {
    const defaults: ExtensionSettings = {
      enableInlineExpansion: true,
      autoExpandReplies: false,
      maxReplyDepth: 3,
      debug: false,
      useThreadsApi: false
    };

    // Check if imported settings has completely invalid structure
    const hasValidFields = Object.keys(defaults).some(key => key in importedSettings);
    
    if (!hasValidFields) {
      throw new Error('Invalid settings format: no valid settings fields found');
    }

    const validated: ExtensionSettings = { ...defaults };

    // Validate and set each field
    if (typeof importedSettings.enableInlineExpansion === 'boolean') {
      validated.enableInlineExpansion = importedSettings.enableInlineExpansion;
    } else if ('enableInlineExpansion' in importedSettings) {
      throw new Error('Invalid settings format: enableInlineExpansion must be boolean');
    }

    if (typeof importedSettings.autoExpandReplies === 'boolean') {
      validated.autoExpandReplies = importedSettings.autoExpandReplies;
    } else if ('autoExpandReplies' in importedSettings) {
      throw new Error('Invalid settings format: autoExpandReplies must be boolean');
    }

    if (typeof importedSettings.maxReplyDepth === 'number' && importedSettings.maxReplyDepth > 0) {
      validated.maxReplyDepth = importedSettings.maxReplyDepth;
    } else if ('maxReplyDepth' in importedSettings) {
      throw new Error('Invalid settings format: maxReplyDepth must be positive number');
    }

    if (typeof importedSettings.debug === 'boolean') {
      validated.debug = importedSettings.debug;
    } else if ('debug' in importedSettings) {
      throw new Error('Invalid settings format: debug must be boolean');
    }

    if (typeof importedSettings.useThreadsApi === 'boolean') {
      validated.useThreadsApi = importedSettings.useThreadsApi;
    } else if ('useThreadsApi' in importedSettings) {
      throw new Error('Invalid settings format: useThreadsApi must be boolean');
    }

    return validated;
  }

  /**
   * Broadcasts settings import to components
   */
  private async broadcastSettingsImport(settings: ExtensionSettings): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        await chrome.runtime.sendMessage({
          type: 'SETTINGS_IMPORTED',
          data: settings,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.warn('Failed to broadcast settings import:', error);
    }
  }

  /**
   * Shows import success message
   */
  private showImportSuccess(settings: ExtensionSettings): void {
    this.showMessage(
      'Settings imported successfully!',
      'success',
      `Imported ${Object.keys(settings).length} settings. Changes will be applied immediately.`
    );
  }

  /**
   * Shows import error message
   */
  private showImportError(error: Error): void {
    this.showMessage(
      'Import Failed',
      'error',
      `Failed to import settings: ${error.message}`
    );
  }

  /**
   * Shows export success message
   */
  private showExportSuccess(): void {
    this.showMessage(
      'Settings exported!',
      'success',
      'Your settings have been downloaded as a JSON file.'
    );
  }

  /**
   * Shows export error message
   */
  private showExportError(error: Error): void {
    this.showMessage(
      'Export Failed',
      'error',
      `Failed to export settings: ${error.message}`
    );
  }

  /**
   * Shows a temporary message to the user
   */
  private showMessage(title: string, type: 'success' | 'error', description: string): void {
    // Remove any existing messages
    const existing = document.querySelectorAll('.tf-import-export-message');
    existing.forEach(el => el.remove());

    const message = document.createElement('div');
    message.classList.add('tf-import-export-message');
    message.style.position = 'fixed';
    message.style.top = '20px';
    message.style.right = '20px';
    message.style.minWidth = '300px';
    message.style.padding = '12px 16px';
    message.style.borderRadius = '8px';
    message.style.color = 'white';
    message.style.fontSize = '14px';
    message.style.zIndex = '10000';
    message.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';

    if (type === 'success') {
      message.style.backgroundColor = '#28a745';
    } else {
      message.style.backgroundColor = '#dc3545';
    }

    const titleEl = document.createElement('div');
    titleEl.style.fontWeight = 'bold';
    titleEl.style.marginBottom = '4px';
    titleEl.textContent = title;

    const descEl = document.createElement('div');
    descEl.style.fontSize = '12px';
    descEl.style.opacity = '0.9';
    descEl.textContent = description;

    message.appendChild(titleEl);
    message.appendChild(descEl);
    document.body.appendChild(message);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (message.parentNode) {
        message.parentNode.removeChild(message);
      }
    }, 5000);

    // Add click to dismiss
    message.addEventListener('click', () => {
      if (message.parentNode) {
        message.parentNode.removeChild(message);
      }
    });

    message.style.cursor = 'pointer';
    message.title = 'Click to dismiss';
  }
}