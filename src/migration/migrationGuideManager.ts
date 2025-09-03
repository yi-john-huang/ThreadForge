/**
 * Migration Guide Manager - Task 23
 * Creates interactive guides and tutorials for users
 */

interface MigrationGuide {
  title: string;
  description: string;
  steps: MigrationStep[];
  estimatedTime: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

interface MigrationStep {
  id: string;
  title: string;
  description: string;
  actions: StepAction[];
  prerequisites?: string[];
  tips?: string[];
  troubleshooting?: TroubleshootingItem[];
}

interface StepAction {
  type: 'click' | 'input' | 'navigate' | 'verify' | 'wait';
  target?: string;
  description: string;
  expected?: string;
}

interface TroubleshootingItem {
  problem: string;
  solution: string;
  moreInfo?: string;
}

interface MigrationProgress {
  completedSteps: string[];
  currentStep?: string;
  percentage: number;
  startedAt?: number;
  completedAt?: number;
}

interface CustomizedGuide {
  sections: string[];
  detailLevel: 'high' | 'medium' | 'low';
  userLevel: string;
  specificSteps: MigrationStep[];
}

interface SettingsMigration {
  mappings: { [oldKey: string]: string };
  newSettings: any;
  warnings: string[];
  success: boolean;
}

export class MigrationGuideManager {
  private readonly API_MIGRATION_GUIDE: MigrationGuide = {
    title: 'Migrating to Threads API',
    description: 'Learn how to set up and use the new Threads API integration for better performance and reliability.',
    estimatedTime: '5-10 minutes',
    difficulty: 'beginner',
    steps: [
      {
        id: 'api-overview',
        title: 'Understanding the API Benefits',
        description: 'Learn why the Threads API provides better performance and reliability than DOM scraping.',
        actions: [
          {
            type: 'navigate',
            description: 'Open ThreadForge settings by clicking the extension icon',
            expected: 'Settings popup should open'
          }
        ],
        tips: [
          'The API provides real-time data directly from Threads',
          'Better performance with faster loading times',
          'More reliable than parsing webpage content'
        ]
      },
      {
        id: 'account-connection',
        title: 'Connect Your Threads Account',
        description: 'Set up secure authentication with your Threads account to access the API.',
        actions: [
          {
            type: 'click',
            target: '.connect-account-btn',
            description: 'Click "Connect Account" button in settings',
            expected: 'OAuth login window should open'
          },
          {
            type: 'navigate',
            description: 'Log in to your Threads account in the popup window',
            expected: 'Authorization dialog appears'
          },
          {
            type: 'click',
            description: 'Click "Authorize" to grant ThreadForge access',
            expected: 'Success message and settings update'
          }
        ],
        tips: [
          'Your login credentials are never stored by ThreadForge',
          'You can revoke access at any time from settings',
          'OAuth2 provides secure, token-based authentication'
        ],
        troubleshooting: [
          {
            problem: 'Login popup is blocked',
            solution: 'Allow popups for the extension or try again',
            moreInfo: 'Check your browser popup blocker settings'
          },
          {
            problem: 'Authorization fails',
            solution: 'Ensure you\'re logged into Threads.net first',
            moreInfo: 'Try logging into Threads in a regular browser tab first'
          }
        ]
      },
      {
        id: 'enable-api-mode',
        title: 'Enable API Mode',
        description: 'Switch from DOM scraping to API mode for enhanced functionality.',
        actions: [
          {
            type: 'click',
            target: '.api-mode-toggle',
            description: 'Toggle "Use Threads API" switch to enabled',
            expected: 'Switch shows as enabled, settings save automatically'
          },
          {
            type: 'verify',
            description: 'Verify API connection status shows "Connected"',
            expected: 'Green "Connected" indicator appears'
          }
        ],
        prerequisites: ['account-connection'],
        tips: [
          'Hybrid mode automatically falls back to DOM scraping if API is unavailable',
          'Settings are saved automatically',
          'Changes take effect immediately without reloading pages'
        ]
      },
      {
        id: 'test-functionality',
        title: 'Test New Features',
        description: 'Verify that API integration is working correctly.',
        actions: [
          {
            type: 'navigate',
            description: 'Visit a Threads post with replies',
            expected: 'Threads page loads normally'
          },
          {
            type: 'click',
            description: 'Click on a post to expand replies',
            expected: 'Replies load faster with real-time data'
          },
          {
            type: 'verify',
            description: 'Check for enhanced features like engagement metrics',
            expected: 'Like counts, timestamps, and user profiles display correctly'
          }
        ],
        prerequisites: ['enable-api-mode'],
        troubleshooting: [
          {
            problem: 'Replies don\'t load or load slowly',
            solution: 'Check API connection status in settings',
            moreInfo: 'Extension will automatically fall back to DOM scraping if API is unavailable'
          }
        ]
      },
      {
        id: 'optimize-settings',
        title: 'Optimize Your Settings',
        description: 'Customize API settings for the best experience.',
        actions: [
          {
            type: 'navigate',
            description: 'Open advanced settings section',
            expected: 'Advanced options become visible'
          },
          {
            type: 'input',
            target: '.max-reply-depth',
            description: 'Adjust maximum reply depth (recommended: 5)',
            expected: 'Setting updates automatically'
          },
          {
            type: 'click',
            target: '.auto-fallback-toggle',
            description: 'Enable automatic fallback for reliability',
            expected: 'Fallback option is enabled'
          }
        ],
        tips: [
          'Higher reply depth means more data but slower loading',
          'Auto-fallback ensures extension works even if API is down',
          'All settings can be reverted to defaults if needed'
        ]
      }
    ]
  };

  private readonly SETTINGS_MAPPINGS = {
    'enable_inline': 'enableInlineExpansion',
    'auto_expand': 'autoExpandReplies',
    'max_depth': 'maxReplyDepth',
    'debug_mode': 'debug',
    'use_api': 'useThreadsApi',
    'inline_expansion': 'enableInlineExpansion',
    'expand_replies': 'autoExpandReplies',
    'reply_depth': 'maxReplyDepth'
  };

  /**
   * Generates API migration guide
   */
  public generateApiMigrationGuide(): MigrationGuide {
    return this.API_MIGRATION_GUIDE;
  }

  /**
   * Generates settings migration guide based on old settings
   */
  public generateSettingsMigrationGuide(oldSettings: any): SettingsMigration {
    const mappings: { [oldKey: string]: string } = {};
    const newSettings: any = {
      enableInlineExpansion: true,
      autoExpandReplies: false,
      maxReplyDepth: 3,
      debug: false,
      useThreadsApi: false
    };
    const warnings: string[] = [];

    // Process each old setting
    Object.keys(oldSettings).forEach(oldKey => {
      const newKey = this.SETTINGS_MAPPINGS[oldKey];
      
      if (newKey) {
        mappings[oldKey] = newKey;
        
        // Apply the old value to new settings
        if (typeof oldSettings[oldKey] === 'boolean') {
          newSettings[newKey] = oldSettings[oldKey];
        } else if (typeof oldSettings[oldKey] === 'number' && oldSettings[oldKey] > 0) {
          newSettings[newKey] = oldSettings[oldKey];
        } else {
          warnings.push(`Could not migrate setting "${oldKey}": invalid value type or range`);
        }
      } else {
        warnings.push(`Unknown setting "${oldKey}" will not be migrated`);
      }
    });

    // Add specific warnings for breaking changes
    if (oldSettings.hasOwnProperty('theme') && oldSettings.theme !== 'default') {
      warnings.push('Custom themes are not supported in v2.0. Extension will use default theme.');
    }

    if (oldSettings.hasOwnProperty('custom_selectors')) {
      warnings.push('Custom CSS selectors are replaced by API integration. Manual selectors no longer needed.');
    }

    return {
      mappings,
      newSettings,
      warnings,
      success: warnings.filter(w => w.includes('Could not migrate')).length === 0
    };
  }

  /**
   * Creates interactive tutorial element
   */
  public createInteractiveTutorial(): HTMLElement {
    const tutorial = document.createElement('div');
    tutorial.className = 'tf-tutorial';
    tutorial.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      max-width: 90vw;
      max-height: 80vh;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
    `;

    const guide = this.generateApiMigrationGuide();
    let currentStepIndex = 0;

    tutorial.innerHTML = `
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; color: white;">
        <h2 style="margin: 0 0 8px 0; font-size: 24px;">${guide.title}</h2>
        <p style="margin: 0; opacity: 0.9; font-size: 16px;">${guide.description}</p>
        <div style="margin-top: 16px; font-size: 14px; opacity: 0.8;">
          <span>⏱️ ${guide.estimatedTime}</span>
          <span style="margin-left: 16px;">📊 ${guide.difficulty}</span>
        </div>
      </div>
      
      <div class="tutorial-content" style="padding: 24px; overflow-y: auto; max-height: 400px;">
        ${guide.steps.map((step, index) => `
          <div class="tutorial-step" data-step="${index + 1}" style="display: ${index === 0 ? 'block' : 'none'};">
            <div style="display: flex; align-items: center; margin-bottom: 16px;">
              <div style="
                width: 32px;
                height: 32px;
                background: #667eea;
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                margin-right: 12px;
              ">${index + 1}</div>
              <h3 style="margin: 0; font-size: 18px; color: #333;">${step.title}</h3>
            </div>
            
            <p style="color: #666; margin-bottom: 20px; line-height: 1.5;">${step.description}</p>
            
            <div class="step-actions" style="margin-bottom: 20px;">
              <h4 style="font-size: 14px; color: #333; margin: 0 0 12px 0; text-transform: uppercase; font-weight: 600;">Steps to Follow:</h4>
              ${step.actions.map((action, actionIndex) => `
                <div style="
                  display: flex;
                  align-items: flex-start;
                  margin-bottom: 12px;
                  padding: 12px;
                  background: #f8fafc;
                  border-radius: 8px;
                  border-left: 3px solid #667eea;
                ">
                  <div style="
                    width: 20px;
                    height: 20px;
                    background: #667eea;
                    color: white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                    margin-right: 12px;
                    flex-shrink: 0;
                    margin-top: 2px;
                  ">${actionIndex + 1}</div>
                  <div style="flex: 1;">
                    <div style="font-weight: 500; color: #333; margin-bottom: 4px;">${action.description}</div>
                    ${action.expected ? `<div style="font-size: 13px; color: #059669; font-style: italic;">Expected: ${action.expected}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
            
            ${step.tips && step.tips.length > 0 ? `
              <div style="margin-bottom: 20px;">
                <h4 style="font-size: 14px; color: #333; margin: 0 0 12px 0; text-transform: uppercase; font-weight: 600;">💡 Helpful Tips:</h4>
                <ul style="margin: 0; padding-left: 20px; color: #555;">
                  ${step.tips.map(tip => `<li style="margin-bottom: 6px;">${tip}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
            
            ${step.troubleshooting && step.troubleshooting.length > 0 ? `
              <div style="margin-bottom: 20px;">
                <h4 style="font-size: 14px; color: #dc2626; margin: 0 0 12px 0; text-transform: uppercase; font-weight: 600;">🔧 Troubleshooting:</h4>
                ${step.troubleshooting.map(item => `
                  <div style="margin-bottom: 12px; padding: 12px; background: #fef2f2; border-radius: 8px; border-left: 3px solid #dc2626;">
                    <div style="font-weight: 500; color: #dc2626; margin-bottom: 4px;">Problem: ${item.problem}</div>
                    <div style="color: #555; margin-bottom: 4px;">Solution: ${item.solution}</div>
                    ${item.moreInfo ? `<div style="font-size: 13px; color: #666; font-style: italic;">${item.moreInfo}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
      
      <div style="
        padding: 20px 24px;
        border-top: 1px solid #e5e7eb;
        background: #f9fafb;
        display: flex;
        justify-content: space-between;
        align-items: center;
      ">
        <div style="font-size: 14px; color: #666;">
          Step <span class="current-step">1</span> of ${guide.steps.length}
        </div>
        
        <div style="display: flex; gap: 12px;">
          <button class="prev-btn" style="
            background: #f3f4f6;
            color: #374151;
            border: 1px solid #d1d5db;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            display: none;
          ">Previous</button>
          
          <button class="next-btn" style="
            background: #667eea;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
          ">Next Step</button>
          
          <button class="complete-tutorial-btn" style="
            background: #059669;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            display: none;
          ">Complete Tutorial</button>
          
          <button class="close-btn" style="
            background: none;
            color: #6b7280;
            border: 1px solid #d1d5db;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
          ">Close</button>
        </div>
      </div>
    `;

    // Add navigation functionality
    const nextBtn = tutorial.querySelector('.next-btn') as HTMLElement;
    const prevBtn = tutorial.querySelector('.prev-btn') as HTMLElement;
    const completeBtn = tutorial.querySelector('.complete-tutorial-btn') as HTMLElement;
    const closeBtn = tutorial.querySelector('.close-btn') as HTMLElement;
    const currentStepSpan = tutorial.querySelector('.current-step') as HTMLElement;

    const updateStep = (index: number) => {
      // Hide all steps
      const steps = tutorial.querySelectorAll('.tutorial-step');
      steps.forEach((step, i) => {
        (step as HTMLElement).style.display = i === index ? 'block' : 'none';
      });

      // Update UI
      currentStepSpan.textContent = (index + 1).toString();
      prevBtn.style.display = index > 0 ? 'inline-block' : 'none';
      nextBtn.style.display = index < guide.steps.length - 1 ? 'inline-block' : 'none';
      completeBtn.style.display = index === guide.steps.length - 1 ? 'inline-block' : 'none';

      currentStepIndex = index;
    };

    nextBtn.addEventListener('click', () => {
      if (currentStepIndex < guide.steps.length - 1) {
        updateStep(currentStepIndex + 1);
      }
    });

    prevBtn.addEventListener('click', () => {
      if (currentStepIndex > 0) {
        updateStep(currentStepIndex - 1);
      }
    });

    completeBtn.addEventListener('click', async () => {
      await this.markTutorialCompleted();
      tutorial.remove();
    });

    closeBtn.addEventListener('click', () => {
      tutorial.remove();
    });

    return tutorial;
  }

  /**
   * Gets customized guide based on user settings
   */
  public getCustomizedGuide(userSettings: any): CustomizedGuide {
    const sections: string[] = ['introduction'];

    // Determine relevant sections based on settings
    if (userSettings.useThreadsApi) {
      sections.push('api-setup', 'api-optimization');
    } else {
      sections.push('dom-scraping', 'performance-tips');
    }

    if (!userSettings.enableInlineExpansion) {
      sections.push('inline-expansion-setup');
    }

    if (userSettings.debug) {
      sections.push('debugging', 'advanced-features');
    }

    const detailLevel = userSettings.advancedUser ? 'low' : 'high';

    return {
      sections,
      detailLevel,
      userLevel: userSettings.advancedUser ? 'advanced' : 'beginner',
      specificSteps: this.generateCustomSteps(sections, detailLevel)
    };
  }

  /**
   * Gets guide for specific user level
   */
  public getGuideForLevel(level: 'beginner' | 'advanced'): MigrationGuide {
    const baseGuide = this.generateApiMigrationGuide();

    if (level === 'beginner') {
      return {
        ...baseGuide,
        detailLevel: 'high',
        steps: baseGuide.steps.map(step => ({
          ...step,
          actions: step.actions,
          tips: step.tips || [],
          troubleshooting: step.troubleshooting || []
        }))
      } as MigrationGuide & { detailLevel: string };
    } else {
      // Advanced guide with condensed steps
      return {
        ...baseGuide,
        detailLevel: 'low',
        steps: [
          {
            id: 'quick-setup',
            title: 'Quick API Setup',
            description: 'Fast-track setup for experienced users.',
            actions: [
              {
                type: 'click',
                description: 'Connect account and enable API mode in settings',
                expected: 'API integration active'
              },
              {
                type: 'verify',
                description: 'Test functionality on Threads posts',
                expected: 'Enhanced features working'
              }
            ]
          }
        ]
      } as MigrationGuide & { detailLevel: string };
    }
  }

  /**
   * Generates custom steps based on sections
   */
  private generateCustomSteps(sections: string[], detailLevel: string): MigrationStep[] {
    const stepTemplates: { [key: string]: MigrationStep } = {
      'api-setup': {
        id: 'api-setup',
        title: 'Set Up API Integration',
        description: 'Configure Threads API access for enhanced functionality.',
        actions: [
          {
            type: 'click',
            target: '.connect-account-btn',
            description: 'Connect your Threads account',
            expected: 'Account successfully connected'
          }
        ]
      },
      'inline-expansion-setup': {
        id: 'inline-expansion-setup',
        title: 'Enable Inline Expansion',
        description: 'Set up inline reply expansion for better readability.',
        actions: [
          {
            type: 'click',
            target: '.inline-expansion-toggle',
            description: 'Enable inline expansion in settings',
            expected: 'Toggle shows as enabled'
          }
        ]
      }
    };

    return sections
      .filter(section => stepTemplates[section])
      .map(section => stepTemplates[section]);
  }

  /**
   * Marks a step as completed
   */
  public async markStepCompleted(stepId: string): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      const result = await chrome.storage.sync.get(['migrationProgress']);
      const progress = result.migrationProgress || {
        completedSteps: [],
        percentage: 0
      };

      if (!progress.completedSteps.includes(stepId)) {
        progress.completedSteps.push(stepId);
        progress.percentage = (progress.completedSteps.length / this.API_MIGRATION_GUIDE.steps.length) * 100;
        
        if (!progress.startedAt) {
          progress.startedAt = Date.now();
        }

        if (progress.percentage >= 100) {
          progress.completedAt = Date.now();
        }

        await chrome.storage.sync.set({ migrationProgress: progress });
      }
    } catch (error) {
      console.warn('Failed to mark step completed:', error);
    }
  }

  /**
   * Gets migration progress
   */
  public async getMigrationProgress(): Promise<MigrationProgress> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return {
        completedSteps: [],
        percentage: 0
      };
    }

    try {
      const result = await chrome.storage.sync.get(['migrationProgress']);
      return result.migrationProgress || {
        completedSteps: [],
        percentage: 0
      };
    } catch (error) {
      console.warn('Failed to get migration progress:', error);
      return {
        completedSteps: [],
        percentage: 0
      };
    }
  }

  /**
   * Resets migration progress
   */
  public async resetProgress(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      await chrome.storage.sync.set({
        migrationProgress: {
          completedSteps: [],
          percentage: 0
        }
      });
    } catch (error) {
      console.warn('Failed to reset migration progress:', error);
    }
  }

  /**
   * Marks tutorial as completed
   */
  private async markTutorialCompleted(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return;
    }

    try {
      await chrome.storage.sync.set({
        tutorialCompleted: true,
        tutorialCompletedAt: Date.now()
      });

      // Mark all steps as completed
      const allStepIds = this.API_MIGRATION_GUIDE.steps.map(step => step.id);
      for (const stepId of allStepIds) {
        await this.markStepCompleted(stepId);
      }
    } catch (error) {
      console.warn('Failed to mark tutorial completed:', error);
    }
  }

  /**
   * Checks if tutorial was completed
   */
  public async isTutorialCompleted(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return false;
    }

    try {
      const result = await chrome.storage.sync.get(['tutorialCompleted']);
      return !!result.tutorialCompleted;
    } catch (error) {
      console.warn('Failed to check tutorial completion:', error);
      return false;
    }
  }

  /**
   * Creates migration summary report
   */
  public async createMigrationSummary(): Promise<any> {
    const progress = await this.getMigrationProgress();
    const isCompleted = await this.isTutorialCompleted();

    return {
      progress,
      isCompleted,
      completedSteps: progress.completedSteps.length,
      totalSteps: this.API_MIGRATION_GUIDE.steps.length,
      timeSpent: progress.startedAt && progress.completedAt 
        ? progress.completedAt - progress.startedAt 
        : null,
      recommendations: this.getRecommendations(progress)
    };
  }

  /**
   * Gets recommendations based on progress
   */
  private getRecommendations(progress: MigrationProgress): string[] {
    const recommendations: string[] = [];

    if (progress.percentage === 0) {
      recommendations.push('Start with connecting your Threads account for API access');
    } else if (progress.percentage < 50) {
      recommendations.push('Complete the basic setup to unlock enhanced features');
    } else if (progress.percentage < 100) {
      recommendations.push('Finish the remaining steps to optimize your experience');
    } else {
      recommendations.push('Great job! Consider exploring advanced settings for further customization');
    }

    if (!progress.completedSteps.includes('test-functionality')) {
      recommendations.push('Test the new features on a Threads post to see the improvements');
    }

    return recommendations;
  }
}