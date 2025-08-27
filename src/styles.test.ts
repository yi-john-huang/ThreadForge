// Unit tests for CSS-in-JS styling system
import { getOverlayStyles, getLightThemeColors, getDarkThemeColors, injectOverlayStyles, removeOverlayStyles } from './styles';

describe('getOverlayStyles function', () => {
  test('should return CSS string for overlay styles', () => {
    const styles = getOverlayStyles();
    
    expect(typeof styles).toBe('string');
    expect(styles).toContain('.tf-overlay');
    expect(styles).toContain('position: fixed');
    expect(styles).toContain('z-index:');
  });

  test('should include backdrop with correct opacity', () => {
    const styles = getOverlayStyles();
    
    expect(styles).toContain('.tf-overlay-backdrop');
    expect(styles).toMatch(/opacity:\s*0\.[7-9]/); // Between 0.7 and 0.9
  });

  test('should include content panel with max width 900px', () => {
    const styles = getOverlayStyles();
    
    expect(styles).toContain('.tf-overlay-content');
    expect(styles).toContain('max-width: 900px');
    expect(styles).toContain('margin: 0 auto');
  });

  test('should include animation keyframes', () => {
    const styles = getOverlayStyles();
    
    expect(styles).toContain('@keyframes');
    expect(styles).toContain('fadeIn');
    expect(styles).toContain('slideUp');
  });

  test('should include close button styles', () => {
    const styles = getOverlayStyles();
    
    expect(styles).toContain('.tf-close-button');
    expect(styles).toContain('position: absolute');
    expect(styles).toContain('top:');
    expect(styles).toContain('right:');
  });

  test('should include loading spinner styles', () => {
    const styles = getOverlayStyles();
    
    expect(styles).toContain('.tf-loading-spinner');
    expect(styles).toContain('border-radius: 50%');
    expect(styles).toContain('animation:');
  });

  test('should include responsive breakpoints', () => {
    const styles = getOverlayStyles();
    
    expect(styles).toContain('@media');
    expect(styles).toContain('max-width: 768px'); // Mobile breakpoint
  });
});

describe('Theme color functions', () => {
  test('should return light theme colors', () => {
    const colors = getLightThemeColors();
    
    expect(colors).toHaveProperty('background');
    expect(colors).toHaveProperty('text');
    expect(colors).toHaveProperty('border');
    expect(colors).toHaveProperty('accent');
    
    // Light theme should have dark text on light background
    expect(colors.background).toMatch(/#[f-f]/i); // Light color
    expect(colors.text).toMatch(/#[0-4]/); // Dark color
  });

  test('should return dark theme colors', () => {
    const colors = getDarkThemeColors();
    
    expect(colors).toHaveProperty('background');
    expect(colors).toHaveProperty('text');
    expect(colors).toHaveProperty('border');
    expect(colors).toHaveProperty('accent');
    
    // Dark theme should have light text on dark background
    expect(colors.background).toMatch(/#[0-4]/); // Dark color
    expect(colors.text).toMatch(/#[e-f]/i); // Light color
  });

  test('should have different colors for light and dark themes', () => {
    const lightColors = getLightThemeColors();
    const darkColors = getDarkThemeColors();
    
    expect(lightColors.background).not.toBe(darkColors.background);
    expect(lightColors.text).not.toBe(darkColors.text);
  });
});

describe('CSS isolation and injection', () => {
  test('should use tf- prefix for all class names', () => {
    const styles = getOverlayStyles();
    const classMatches = styles.match(/\.[a-z-]+/g) || [];
    
    classMatches.forEach(className => {
      expect(className).toMatch(/^\.tf-/);
    });
  });

  test('should include CSS reset for overlay elements', () => {
    const styles = getOverlayStyles();
    
    expect(styles).toContain('box-sizing: border-box');
    expect(styles).toContain('margin: 0');
    expect(styles).toContain('padding: 0');
  });

  test('should set high z-index for overlay', () => {
    const styles = getOverlayStyles();
    
    // Should have very high z-index (like 2147483647)
    expect(styles).toMatch(/z-index:\s*214748364[0-7]/);
  });

  test('should include minimum font size of 14px', () => {
    const styles = getOverlayStyles();
    
    expect(styles).toMatch(/font-size:\s*(1[4-9]|[2-9]\d)px/);
  });
});

// Test for system font stack
describe('Typography settings', () => {
  test('should use system font stack', () => {
    const styles = getOverlayStyles();
    
    expect(styles).toContain('font-family:');
    expect(styles).toMatch(/system-ui|Helvetica|Arial/);
  });

  test('should include line-height for readability', () => {
    const styles = getOverlayStyles();
    
    expect(styles).toContain('line-height:');
  });
});

// Test style injection utilities
describe('Style injection utilities', () => {
  beforeEach(() => {
    // Clean up any existing styles before each test
    const existingStyle = document.getElementById('tf-overlay-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
  });

  afterEach(() => {
    // Clean up after each test
    const existingStyle = document.getElementById('tf-overlay-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
  });

  test('should inject styles into document head', () => {
    injectOverlayStyles();
    
    const styleElement = document.getElementById('tf-overlay-styles');
    expect(styleElement).toBeTruthy();
    expect(styleElement?.tagName).toBe('STYLE');
    expect(styleElement?.textContent).toContain('.tf-overlay');
  });

  test('should not inject duplicate styles', () => {
    injectOverlayStyles();
    injectOverlayStyles(); // Call again
    
    const styleElements = document.querySelectorAll('#tf-overlay-styles');
    expect(styleElements.length).toBe(1);
  });

  test('should remove injected styles', () => {
    injectOverlayStyles();
    expect(document.getElementById('tf-overlay-styles')).toBeTruthy();
    
    removeOverlayStyles();
    expect(document.getElementById('tf-overlay-styles')).toBeFalsy();
  });

  test('should handle removing non-existent styles gracefully', () => {
    expect(() => removeOverlayStyles()).not.toThrow();
  });
});