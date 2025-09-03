/**
 * Feature Flag Service for A/B Testing - Task 22
 * Manages feature flags and A/B testing functionality
 */

interface FeatureFlags {
  [key: string]: boolean;
}

interface ABTestConfig {
  control: FeatureFlags;
  treatment: FeatureFlags;
  splitRatio: number;
}

interface ConditionalFlag {
  condition: string;
  enabled: boolean;
}

interface FeatureStats {
  usageCount: number;
  enabled: boolean;
  lastUsed: number;
  createdAt: number;
}

export class FeatureFlagService {
  private flags: FeatureFlags = {
    useThreadsApi: false,
    enableHybridMode: true,
    autoFallback: true,
    newUIFeature: false,
    premiumFeature: false
  };
  
  private abTests: { [testName: string]: ABTestConfig } = {};
  private conditionalFlags: { [key: string]: ConditionalFlag } = {};
  private featureStats: { [key: string]: FeatureStats } = {};
  private userGroups: { [testName: string]: string } = {};
  private userId: string = '';

  constructor() {
    this.userId = this.createRandomId(); // Start with random ID
    this.initializeAsync();
  }

  /**
   * Async initialization
   */
  private async initializeAsync(): Promise<void> {
    await this.loadPersistentUserId();
    await this.loadFlags();
  }

  /**
   * Gets all current feature flags
   */
  public getAllFlags(): FeatureFlags {
    return { ...this.flags };
  }

  /**
   * Checks if a feature is enabled
   */
  public isFeatureEnabled(featureName: string): boolean {
    return this.flags[featureName] || false;
  }

  /**
   * Sets a feature flag value
   */
  public async setFeatureFlag(featureName: string, enabled: boolean): Promise<void> {
    this.flags[featureName] = enabled;
    
    // Initialize stats if not exists
    if (!this.featureStats[featureName]) {
      this.featureStats[featureName] = {
        usageCount: 0,
        enabled,
        lastUsed: 0,
        createdAt: Date.now()
      };
    }
    
    this.featureStats[featureName].enabled = enabled;
    
    await this.persistFlags();
  }

  /**
   * Creates an A/B test configuration
   */
  public async createABTest(testName: string, config: ABTestConfig): Promise<void> {
    this.abTests[testName] = config;
    
    // Assign user to group if not already assigned
    if (!this.userGroups[testName]) {
      this.userGroups[testName] = this.assignUserToGroup(config.splitRatio);
    }
    
    await this.persistFlags();
  }

  /**
   * Gets user's group for an A/B test
   */
  public getUserGroup(testName: string): string {
    if (!this.abTests[testName]) {
      return 'control'; // Default group
    }
    
    if (!this.userGroups[testName]) {
      const splitRatio = this.abTests[testName].splitRatio;
      this.userGroups[testName] = this.assignUserToGroup(splitRatio);
    }
    
    return this.userGroups[testName];
  }

  /**
   * Gets feature flags for user's group in A/B test
   */
  public getFlagsForUser(testName: string): FeatureFlags {
    if (!this.abTests[testName]) {
      return this.flags;
    }
    
    const userGroup = this.getUserGroup(testName);
    const testConfig = this.abTests[testName];
    
    if (userGroup === 'treatment') {
      return { ...this.flags, ...testConfig.treatment };
    } else {
      return { ...this.flags, ...testConfig.control };
    }
  }

  /**
   * Sets a conditional feature flag
   */
  public async setConditionalFlag(featureName: string, config: ConditionalFlag): Promise<void> {
    this.conditionalFlags[featureName] = config;
    await this.persistFlags();
  }

  /**
   * Checks if a conditional feature is enabled
   */
  public async isConditionalFeatureEnabled(featureName: string): Promise<boolean> {
    const conditionalFlag = this.conditionalFlags[featureName];
    if (!conditionalFlag) {
      return this.isFeatureEnabled(featureName);
    }
    
    const conditionMet = await this.evaluateCondition(conditionalFlag.condition);
    return conditionalFlag.enabled && conditionMet;
  }

  /**
   * Tracks feature usage
   */
  public trackFeatureUsage(featureName: string): void {
    if (!this.featureStats[featureName]) {
      this.featureStats[featureName] = {
        usageCount: 0,
        enabled: this.isFeatureEnabled(featureName),
        lastUsed: 0,
        createdAt: Date.now()
      };
    }
    
    this.featureStats[featureName].usageCount++;
    this.featureStats[featureName].lastUsed = Date.now();
    
    // Persist stats periodically (debounced)
    this.debounceStatsUpdate();
  }

  /**
   * Gets feature statistics
   */
  public getFeatureStats(featureName: string): FeatureStats | null {
    return this.featureStats[featureName] || null;
  }

  /**
   * Gets all feature statistics
   */
  public getAllFeatureStats(): { [key: string]: FeatureStats } {
    return { ...this.featureStats };
  }

  /**
   * Evaluates a condition string
   */
  private async evaluateCondition(condition: string): Promise<boolean> {
    try {
      switch (condition) {
        case 'user.hasCredentials':
          return await this.checkUserHasCredentials();
        case 'user.isPremium':
          return await this.checkUserIsPremium();
        case 'browser.supportsApi':
          return this.checkBrowserSupportsApi();
        default:
          // For complex conditions, use a safe evaluation
          return this.safeEvaluateCondition(condition);
      }
    } catch (error) {
      console.warn('Failed to evaluate condition:', condition, error);
      return false;
    }
  }

  /**
   * Safely evaluates more complex conditions
   */
  private safeEvaluateCondition(condition: string): boolean {
    // Implement safe condition evaluation
    // For now, return false for unknown conditions
    return false;
  }

  /**
   * Checks if user has stored credentials
   */
  private async checkUserHasCredentials(): Promise<boolean> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.sync.get(['threads_credentials']);
        return !!result.threads_credentials?.access_token;
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  /**
   * Checks if user has premium features
   */
  private async checkUserIsPremium(): Promise<boolean> {
    // Placeholder for premium check logic
    return false;
  }

  /**
   * Checks if browser supports API features
   */
  private checkBrowserSupportsApi(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.runtime;
  }

  /**
   * Assigns user to A/B test group
   */
  private assignUserToGroup(splitRatio: number): string {
    // Use consistent hash based on user ID for stable group assignment
    const hash = this.hashString(this.userId);
    const normalized = (hash % 1000) / 1000; // Normalize to 0-1
    
    return normalized < splitRatio ? 'treatment' : 'control';
  }

  /**
   * Generates a consistent hash from string
   */
  private hashString(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash);
  }

  /**
   * Loads persistent user ID from storage
   */
  private async loadPersistentUserId(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.sync.get(['userId']);
        if (!result.userId) {
          const newUserId = this.createRandomId();
          await chrome.storage.sync.set({ userId: newUserId });
          this.userId = newUserId;
        } else {
          this.userId = result.userId;
        }
      } catch (error) {
        console.warn('Failed to load persistent user ID:', error);
        // Keep the random ID generated in constructor
      }
    }
  }

  /**
   * Creates a random ID
   */
  private createRandomId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  /**
   * Loads flags from storage
   */
  private async loadFlags(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.sync.get([
          'feature_flags',
          'ab_tests',
          'conditional_flags',
          'feature_stats',
          'user_groups'
        ]);
        
        if (result.feature_flags) {
          this.flags = { ...this.flags, ...result.feature_flags };
        }
        
        if (result.ab_tests) {
          this.abTests = result.ab_tests;
        }
        
        if (result.conditional_flags) {
          this.conditionalFlags = result.conditional_flags;
        }
        
        if (result.feature_stats) {
          this.featureStats = result.feature_stats;
        }
        
        if (result.user_groups) {
          this.userGroups = result.user_groups;
        }
        
      } catch (error) {
        console.warn('Failed to load feature flags:', error);
      }
    }
  }

  /**
   * Persists flags to storage
   */
  private async persistFlags(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        await chrome.storage.sync.set({
          feature_flags: this.flags,
          ab_tests: this.abTests,
          conditional_flags: this.conditionalFlags,
          feature_stats: this.featureStats,
          user_groups: this.userGroups
        });
      } catch (error) {
        console.warn('Failed to persist feature flags:', error);
      }
    }
  }

  /**
   * Debounced stats update to avoid excessive storage writes
   */
  private statsUpdateTimer: NodeJS.Timeout | null = null;
  
  private debounceStatsUpdate(): void {
    if (this.statsUpdateTimer) {
      clearTimeout(this.statsUpdateTimer);
    }
    
    this.statsUpdateTimer = setTimeout(() => {
      this.persistStats();
    }, 5000); // Update stats every 5 seconds max
  }

  /**
   * Persists only statistics to reduce storage calls
   */
  private async persistStats(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        await chrome.storage.sync.set({
          feature_stats: this.featureStats
        });
      } catch (error) {
        console.warn('Failed to persist feature stats:', error);
      }
    }
  }

  /**
   * Resets all feature flags to defaults
   */
  public async resetToDefaults(): Promise<void> {
    this.flags = {
      useThreadsApi: false,
      enableHybridMode: true,
      autoFallback: true,
      newUIFeature: false,
      premiumFeature: false
    };
    
    this.abTests = {};
    this.conditionalFlags = {};
    this.userGroups = {};
    
    await this.persistFlags();
  }

  /**
   * Gets experiment summary for analytics
   */
  public getExperimentSummary(): any {
    const summary: any = {};
    
    Object.keys(this.abTests).forEach(testName => {
      const userGroup = this.getUserGroup(testName);
      const config = this.abTests[testName];
      
      summary[testName] = {
        userGroup,
        splitRatio: config.splitRatio,
        controlFlags: config.control,
        treatmentFlags: config.treatment
      };
    });
    
    return summary;
  }

  /**
   * Validates flag configuration
   */
  public validateFlags(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check for invalid flag values
    Object.entries(this.flags).forEach(([key, value]) => {
      if (typeof value !== 'boolean') {
        errors.push(`Flag '${key}' must be boolean, got ${typeof value}`);
      }
    });
    
    // Check A/B test configurations
    Object.entries(this.abTests).forEach(([testName, config]) => {
      if (config.splitRatio < 0 || config.splitRatio > 1) {
        errors.push(`A/B test '${testName}' has invalid split ratio: ${config.splitRatio}`);
      }
      
      if (!config.control || !config.treatment) {
        errors.push(`A/B test '${testName}' is missing control or treatment configuration`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Exports feature flag configuration
   */
  public exportConfiguration(): any {
    return {
      flags: this.flags,
      abTests: this.abTests,
      conditionalFlags: this.conditionalFlags,
      stats: this.featureStats,
      userGroups: this.userGroups,
      exportedAt: Date.now(),
      version: '1.0.0'
    };
  }

  /**
   * Imports feature flag configuration
   */
  public async importConfiguration(config: any): Promise<void> {
    if (config.flags) {
      this.flags = { ...this.flags, ...config.flags };
    }
    
    if (config.abTests) {
      this.abTests = { ...this.abTests, ...config.abTests };
    }
    
    if (config.conditionalFlags) {
      this.conditionalFlags = { ...this.conditionalFlags, ...config.conditionalFlags };
    }
    
    await this.persistFlags();
  }
}