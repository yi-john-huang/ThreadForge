/**
 * Migration Guides and Upgrade Notifications - Task 23 Tests
 * Tests for upgrade notification system, popup notifications, and migration utilities
 */

import { UpgradeNotificationService } from '../migration/upgradeNotificationService';
import { MigrationGuideManager } from '../migration/migrationGuideManager';
import { GracefulDegradationService } from '../migration/gracefulDegradationService';

// Mock Chrome APIs
const mockChrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    },
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  },
  notifications: {
    create: jest.fn(),
    clear: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  runtime: {
    getManifest: jest.fn(() => ({ version: '2.0.0' })),
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  }
};

(global as any).chrome = mockChrome;

describe('UpgradeNotificationService', () => {
  let service: UpgradeNotificationService;

  beforeEach(() => {
    service = new UpgradeNotificationService();
    jest.clearAllMocks();
  });

  describe('Initialization and Version Detection', () => {
    test('should detect first-time installation', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});
      
      const isFirstTime = await service.isFirstTimeInstall();
      expect(isFirstTime).toBe(true);
    });

    test('should detect version upgrade', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({
        lastVersion: '1.0.0'
      });
      
      const isUpgrade = await service.isVersionUpgrade();
      expect(isUpgrade).toBe(true);
    });

    test('should handle same version correctly', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({
        lastVersion: '2.0.0'
      });
      
      const isUpgrade = await service.isVersionUpgrade();
      expect(isUpgrade).toBe(false);
    });

    test('should get version changelog', () => {
      const changelog = service.getVersionChangelog('2.0.0');
      expect(changelog).toHaveProperty('version', '2.0.0');
      expect(changelog).toHaveProperty('features');
      expect(changelog).toHaveProperty('improvements');
    });
  });

  describe('Notification Management', () => {
    test('should create upgrade notification', async () => {
      mockChrome.notifications.create.mockResolvedValue('notification-id');
      
      await service.showUpgradeNotification('2.0.0');
      
      expect(mockChrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'basic',
          iconUrl: expect.any(String),
          title: expect.stringContaining('ThreadForge Updated'),
          message: expect.any(String)
        })
      );
    });

    test('should create feature highlight notification', async () => {
      const features = ['Threads API Integration', 'Performance Improvements'];
      
      await service.showFeatureHighlight(features);
      
      expect(mockChrome.notifications.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'list',
          title: 'New Features Available!',
          items: expect.arrayContaining([
            expect.objectContaining({
              title: 'Threads API Integration',
              message: expect.any(String)
            })
          ])
        })
      );
    });

    test('should handle notification dismissal', async () => {
      await service.dismissNotification('test-notification');
      
      expect(mockChrome.notifications.clear).toHaveBeenCalledWith('test-notification');
    });

    test('should track notification interactions', async () => {
      const callback = jest.fn();
      
      // Add callback first
      service.onNotificationClicked(callback);
      
      // Manually trigger the handler
      await service.handleNotificationClick('upgrade-notification');
      
      expect(callback).toHaveBeenCalledWith('upgrade-notification');
    });
  });

  describe('User Preferences and Timing', () => {
    test('should respect user notification preferences', async () => {
      mockChrome.storage.sync.get.mockResolvedValue({
        notificationSettings: {
          upgradeNotifications: false
        }
      });
      
      const shouldShow = await service.shouldShowUpgradeNotification();
      expect(shouldShow).toBe(false);
    });

    test('should handle notification frequency limits', async () => {
      const lastShown = Date.now() - 1000; // 1 second ago
      mockChrome.storage.sync.get.mockResolvedValue({
        lastNotificationShown: lastShown
      });
      
      const shouldShow = await service.shouldShowUpgradeNotification();
      expect(shouldShow).toBe(false); // Too soon
    });

    test('should allow notifications after cooldown period', async () => {
      const lastShown = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      mockChrome.storage.sync.get.mockResolvedValue({
        lastNotificationShown: lastShown,
        notificationSettings: { upgradeNotifications: true }
      });
      
      const shouldShow = await service.shouldShowUpgradeNotification();
      expect(shouldShow).toBe(true);
    });
  });

  describe('Badge and Visual Indicators', () => {
    test('should create upgrade badge element', () => {
      const badge = service.createUpgradeBadge();
      
      expect(badge).toBeInstanceOf(HTMLElement);
      expect(badge.classList.contains('tf-upgrade-badge')).toBe(true);
      expect(badge.textContent).toContain('NEW');
    });

    test('should create feature announcement banner', () => {
      const features = ['API Integration', 'Better Performance'];
      const banner = service.createFeatureBanner(features);
      
      expect(banner).toBeInstanceOf(HTMLElement);
      expect(banner.classList.contains('tf-feature-banner')).toBe(true);
      expect(banner.innerHTML).toContain('API Integration');
    });

    test('should handle banner dismissal', () => {
      const banner = service.createFeatureBanner(['Test Feature']);
      document.body.appendChild(banner);
      
      const dismissBtn = banner.querySelector('.tf-dismiss-btn') as HTMLElement;
      dismissBtn.click();
      
      expect(document.body.contains(banner)).toBe(false);
    });
  });
});

describe('MigrationGuideManager', () => {
  let manager: MigrationGuideManager;

  beforeEach(() => {
    manager = new MigrationGuideManager();
    jest.clearAllMocks();
  });

  describe('Guide Generation', () => {
    test('should generate API migration guide', () => {
      const guide = manager.generateApiMigrationGuide();
      
      expect(guide).toHaveProperty('title');
      expect(guide).toHaveProperty('steps');
      expect(guide.steps).toBeInstanceOf(Array);
      expect(guide.steps.length).toBeGreaterThan(0);
    });

    test('should generate settings migration guide', () => {
      const oldSettings = {
        enable_inline: true,
        max_depth: 5
      };
      
      const guide = manager.generateSettingsMigrationGuide(oldSettings);
      
      expect(guide).toHaveProperty('mappings');
      expect(guide.mappings).toHaveProperty('enable_inline');
      expect(guide.newSettings).toHaveProperty('enableInlineExpansion');
    });

    test('should create interactive tutorial', () => {
      const tutorial = manager.createInteractiveTutorial();
      
      expect(tutorial).toBeInstanceOf(HTMLElement);
      expect(tutorial.classList.contains('tf-tutorial')).toBe(true);
      
      const steps = tutorial.querySelectorAll('.tutorial-step');
      expect(steps.length).toBeGreaterThan(0);
    });

    test('should handle tutorial navigation', () => {
      const tutorial = manager.createInteractiveTutorial();
      document.body.appendChild(tutorial);
      
      const nextBtn = tutorial.querySelector('.next-btn') as HTMLElement;
      const step1 = tutorial.querySelector('[data-step="1"]') as HTMLElement;
      const step2 = tutorial.querySelector('[data-step="2"]') as HTMLElement;
      
      expect(step1.style.display).not.toBe('none');
      expect(step2.style.display).toBe('none');
      
      nextBtn.click();
      
      expect(step1.style.display).toBe('none');
      expect(step2.style.display).not.toBe('none');
      
      document.body.removeChild(tutorial);
    });
  });

  describe('Guide Customization', () => {
    test('should customize guide based on user settings', () => {
      const userSettings = {
        useThreadsApi: true,
        enableInlineExpansion: false
      };
      
      const guide = manager.getCustomizedGuide(userSettings);
      
      expect(guide.sections).toContain('api-setup');
      expect(guide.sections).not.toContain('dom-scraping');
    });

    test('should provide beginner vs advanced guides', () => {
      const beginnerGuide = manager.getGuideForLevel('beginner');
      const advancedGuide = manager.getGuideForLevel('advanced');
      
      expect(beginnerGuide.steps.length).toBeGreaterThan(advancedGuide.steps.length);
      expect(beginnerGuide.detailLevel).toBe('high');
      expect(advancedGuide.detailLevel).toBe('low');
    });
  });

  describe('Progress Tracking', () => {
    test('should track migration progress', async () => {
      // Initial get returns no progress
      mockChrome.storage.sync.get.mockResolvedValueOnce({ migrationProgress: null });
      mockChrome.storage.sync.set.mockResolvedValue(undefined);
      // Second get returns updated progress
      mockChrome.storage.sync.get.mockResolvedValueOnce({ 
        migrationProgress: { 
          completedSteps: ['step-1'], 
          percentage: 20 
        } 
      });
      
      await manager.markStepCompleted('step-1');
      
      const progress = await manager.getMigrationProgress();
      expect(progress.completedSteps).toContain('step-1');
      expect(progress.percentage).toBeGreaterThan(0);
    });

    test('should reset migration progress', async () => {
      await manager.markStepCompleted('step-1');
      await manager.resetProgress();
      
      const progress = await manager.getMigrationProgress();
      expect(progress.completedSteps).toHaveLength(0);
      expect(progress.percentage).toBe(0);
    });
  });
});

describe('GracefulDegradationService', () => {
  let service: GracefulDegradationService;

  beforeEach(() => {
    service = new GracefulDegradationService();
    jest.clearAllMocks();
  });

  describe('Feature Detection', () => {
    test('should detect API availability', async () => {
      const isAvailable = await service.isApiAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });

    test('should detect browser capabilities', () => {
      const capabilities = service.detectBrowserCapabilities();
      
      expect(capabilities).toHaveProperty('supportsNotifications');
      expect(capabilities).toHaveProperty('supportsServiceWorkers');
      expect(capabilities).toHaveProperty('supportsModernJS');
    });

    test('should provide feature alternatives', () => {
      const alternatives = service.getFeatureAlternatives('threadsApi');
      
      expect(alternatives).toHaveProperty('fallback', 'domScraping');
      expect(alternatives).toHaveProperty('message');
      expect(alternatives).toHaveProperty('limitations');
    });
  });

  describe('Degradation Messaging', () => {
    test('should create degradation notice', () => {
      const notice = service.createDegradationNotice('API unavailable', 'domScraping');
      
      expect(notice).toBeInstanceOf(HTMLElement);
      expect(notice.classList.contains('tf-degradation-notice')).toBe(true);
      expect(notice.textContent).toContain('API unavailable');
    });

    test('should show feature limitation warning', () => {
      const warning = service.createFeatureLimitationWarning(['Real-time metrics', 'User profiles']);
      
      expect(warning).toBeInstanceOf(HTMLElement);
      expect(warning.textContent).toContain('Limited Functionality');
      expect(warning.innerHTML).toContain('Real-time metrics');
    });

    test('should handle notice dismissal with remember preference', async () => {
      mockChrome.storage.sync.set.mockResolvedValue(undefined);
      
      const notice = service.createDegradationNotice('Test message', 'fallback');
      document.body.appendChild(notice);
      
      const rememberCheckbox = notice.querySelector('input[type="checkbox"]') as HTMLInputElement;
      const dismissBtn = notice.querySelector('.dismiss-btn') as HTMLElement;
      
      rememberCheckbox.checked = true;
      
      // Wait for the async operation to complete
      dismissBtn.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({
          dismissedNotices: expect.arrayContaining(['Test message'])
        })
      );
      
      expect(document.body.contains(notice)).toBe(false);
    });
  });

  describe('Performance Monitoring', () => {
    test('should monitor degradation performance impact', () => {
      service.startPerformanceMonitoring();
      
      // Simulate some operations
      service.recordOperationTime('domScraping', 150);
      service.recordOperationTime('apiCall', 50);
      
      const stats = service.getPerformanceStats();
      expect(stats).toHaveProperty('domScraping');
      expect(stats).toHaveProperty('apiCall');
      expect(stats.domScraping.averageTime).toBe(150);
    });

    test('should provide performance recommendations', () => {
      service.recordOperationTime('domScraping', 500);
      service.recordOperationTime('domScraping', 600);
      
      const recommendations = service.getPerformanceRecommendations();
      expect(recommendations).toContain('Consider enabling API mode for better performance');
    });
  });

  describe('Auto-Recovery', () => {
    test('should attempt auto-recovery when API becomes available', async () => {
      const mockApiCheck = jest.spyOn(service, 'isApiAvailable').mockResolvedValue(true);
      mockChrome.notifications.create.mockResolvedValue('recovery-success');
      
      await service.attemptAutoRecovery();
      
      expect(mockApiCheck).toHaveBeenCalled();
      // Should notify about recovery
      expect(mockChrome.notifications.create).toHaveBeenCalledWith(
        'recovery-success',
        expect.objectContaining({
          title: expect.stringContaining('Feature Restored'),
          message: expect.stringContaining('API is now available')
        })
      );
    });

    test('should schedule periodic recovery attempts', () => {
      const scheduleHandler = service.scheduleAutoRecovery();
      
      expect(scheduleHandler).toBeDefined();
      expect(typeof scheduleHandler.cancel).toBe('function');
    });
  });
});

describe('Integration Tests', () => {
  let upgradeService: UpgradeNotificationService;
  let migrationManager: MigrationGuideManager;
  let degradationService: GracefulDegradationService;

  beforeEach(() => {
    upgradeService = new UpgradeNotificationService();
    migrationManager = new MigrationGuideManager();
    degradationService = new GracefulDegradationService();
    jest.clearAllMocks();
  });

  test('should coordinate upgrade flow with migration guide', async () => {
    mockChrome.storage.sync.get.mockResolvedValue({
      lastVersion: '1.0.0'
    });
    
    const isUpgrade = await upgradeService.isVersionUpgrade();
    expect(isUpgrade).toBe(true);
    
    if (isUpgrade) {
      const guide = migrationManager.generateApiMigrationGuide();
      expect(guide).toBeDefined();
      
      await upgradeService.showUpgradeNotification('2.0.0');
      expect(mockChrome.notifications.create).toHaveBeenCalled();
    }
  });

  test('should show degradation notice when API setup is incomplete', async () => {
    mockChrome.storage.sync.get.mockResolvedValue({
      threads_credentials: null
    });
    
    const isApiAvailable = await degradationService.isApiAvailable();
    if (!isApiAvailable) {
      const notice = degradationService.createDegradationNotice(
        'API credentials not configured',
        'domScraping'
      );
      expect(notice).toBeDefined();
    }
  });

  test('should integrate tutorial with actual settings UI', () => {
    const tutorial = migrationManager.createInteractiveTutorial();
    document.body.appendChild(tutorial);
    
    // Simulate tutorial completion
    const completeBtn = tutorial.querySelector('.complete-tutorial-btn') as HTMLElement;
    completeBtn.click();
    
    expect(mockChrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({
        tutorialCompleted: true
      })
    );
    
    document.body.removeChild(tutorial);
  });

  test('should handle mixed API and DOM mode gracefully', async () => {
    // Setup hybrid mode
    const hybridSettings = {
      useThreadsApi: true,
      autoFallback: true
    };
    
    mockChrome.storage.sync.get.mockResolvedValue({
      threadForgeSettings: hybridSettings
    });
    
    // Test degradation flow
    const alternatives = degradationService.getFeatureAlternatives('threadsApi');
    expect(alternatives.fallback).toBe('domScraping');
    
    // Should show informative message, not error
    const notice = degradationService.createDegradationNotice(
      'Using fallback mode for better reliability',
      'hybrid'
    );
    expect(notice.classList.contains('info')).toBe(true);
  });

  test('should export migration status for debugging', async () => {
    // Mock for markStepCompleted
    mockChrome.storage.sync.get.mockResolvedValueOnce({ migrationProgress: null });
    mockChrome.storage.sync.set.mockResolvedValue(undefined);
    // Mock for getMigrationProgress
    mockChrome.storage.sync.get.mockResolvedValueOnce({ 
      migrationProgress: { 
        completedSteps: ['api-setup'], 
        percentage: 20 
      } 
    });
    mockChrome.storage.local.get.mockResolvedValue({ notificationHistory: [] });
    
    await migrationManager.markStepCompleted('api-setup');
    await upgradeService.dismissNotification('upgrade-notification');
    
    const status = {
      migrationProgress: await migrationManager.getMigrationProgress(),
      notificationHistory: await upgradeService.getNotificationHistory(),
      degradationStatus: await degradationService.getCurrentStatus()
    };
    
    expect(status.migrationProgress.completedSteps).toContain('api-setup');
    expect(status.notificationHistory).toBeDefined();
    expect(status.degradationStatus).toHaveProperty('activeNotices');
  });
});