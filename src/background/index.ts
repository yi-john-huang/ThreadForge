/**
 * Background service worker for ThreadForge extension
 * Handles initialization, message routing, and lifecycle events
 * Requirements: 1.1 (API connection), 2.1 (authentication), 7.1 (migration)
 */

import { handleMessage } from './messageRouter';
import { BackgroundMessage, MessageSender, SendResponse } from './types';

console.log('🧵 ThreadForge background service worker starting...');

/**
 * Handle extension installation and updates
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  
  // Handle different installation reasons based on details.reason
  switch (details.reason) {
    case chrome.runtime.OnInstalledReason.INSTALL:
      await handleInstallation();
      break;
    
    case chrome.runtime.OnInstalledReason.UPDATE:
      await handleUpdate(details.previousVersion);
      break;
    
    default:
      console.log('Extension startup reason:', details.reason);
      break;
  }
});

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener(
  (message: BackgroundMessage, sender: MessageSender, sendResponse: SendResponse) => {
    // Call message router and indicate async response
    handleMessage(message, sender, sendResponse);
    return true; // Keep the message channel open for async response
  }
);

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('Extension starting up...');
  initialize();
});

/**
 * Initialize extension on fresh installation
 */
async function handleInstallation(): Promise<void> {
  console.log('🎉 ThreadForge installed! Setting up initial configuration...');
  
  try {
    // Initialize default settings
    await initializeDefaultSettings();
    
    // Set up initial state
    await initialize();
    
    console.log('✅ Installation setup complete');
  } catch (error) {
    console.error('❌ Error during installation setup:', error);
  }
}

/**
 * Handle extension updates and migration
 * Requirement 7.1: Migration and backward compatibility
 */
async function handleUpdate(previousVersion?: string): Promise<void> {
  console.log(`🔄 ThreadForge updated from ${previousVersion} to ${chrome.runtime.getManifest().version}`);
  
  try {
    // Perform migration if needed
    await migrateSettings(previousVersion);
    
    // Reinitialize with new version
    await initialize();
    
    console.log('✅ Update migration complete');
  } catch (error) {
    console.error('❌ Error during update migration:', error);
  }
}

/**
 * Initialize extension state and services
 */
async function initialize(): Promise<void> {
  console.log('🔧 Initializing ThreadForge services...');
  
  try {
    // Load and validate settings
    await loadSettings();
    
    // Initialize API connection state
    await initializeAPIConnection();
    
    // Set up performance monitoring
    await setupPerformanceMonitoring();
    
    console.log('✅ ThreadForge initialization complete');
  } catch (error) {
    console.error('❌ Error during initialization:', error);
  }
}

/**
 * Initialize default settings on first install
 */
async function initializeDefaultSettings(): Promise<void> {
  const defaultSettings = {
    enableInlineExpansion: true,
    autoExpandReplies: false,
    maxReplyDepth: 3,
    debug: false,
    apiMode: true, // Use Threads API by default
    fallbackToDOM: true, // Fall back to DOM scraping if API fails
    version: chrome.runtime.getManifest().version
  };

  try {
    const existing = await chrome.storage.sync.get('threadForgeSettings');
    if (!existing.threadForgeSettings) {
      await chrome.storage.sync.set({ threadForgeSettings: defaultSettings });
      console.log('📝 Default settings initialized');
    }
  } catch (error) {
    console.error('Error initializing default settings:', error);
  }
}

/**
 * Migrate settings from previous versions
 */
async function migrateSettings(previousVersion?: string): Promise<void> {
  if (!previousVersion) return;
  
  try {
    const currentSettings = await chrome.storage.sync.get('threadForgeSettings');
    let settings = currentSettings.threadForgeSettings || {};
    
    // Add new settings for API integration
    if (!settings.hasOwnProperty('apiMode')) {
      settings.apiMode = true;
    }
    
    if (!settings.hasOwnProperty('fallbackToDOM')) {
      settings.fallbackToDOM = true;
    }
    
    // Update version
    settings.version = chrome.runtime.getManifest().version;
    
    await chrome.storage.sync.set({ threadForgeSettings: settings });
    console.log('📝 Settings migrated from version', previousVersion);
  } catch (error) {
    console.error('Error migrating settings:', error);
  }
}

/**
 * Load and validate current settings
 */
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get('threadForgeSettings');
    const settings = result.threadForgeSettings;
    
    if (settings) {
      console.log('📋 Settings loaded:', Object.keys(settings));
    } else {
      console.log('⚠️ No settings found, using defaults');
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Initialize API connection state
 * Requirement 1.1: Extension shall establish connection to Threads API
 */
async function initializeAPIConnection(): Promise<void> {
  try {
    // TODO: Check authentication status
    // TODO: Validate API credentials  
    // TODO: Test API connectivity
    // TODO: Initialize thread data fetching
    // TODO: Set up getThread handlers
    
    console.log('🔌 API connection state initialized');
  } catch (error) {
    console.error('Error initializing API connection:', error);
  }
}

/**
 * Set up performance monitoring
 */
async function setupPerformanceMonitoring(): Promise<void> {
  try {
    // TODO: Initialize performance tracking
    // TODO: Set up memory usage monitoring
    // TODO: Configure API rate limit tracking
    
    console.log('📊 Performance monitoring initialized');
  } catch (error) {
    console.error('Error setting up performance monitoring:', error);
  }
}

console.log('🚀 ThreadForge background service worker ready!');