// CSS-in-JS styling system for ThreadForge overlay

export interface ThemeColors {
  background: string;
  text: string;
  border: string;
  accent: string;
}

export function getLightThemeColors(): ThemeColors {
  return {
    background: '#ffffff',
    text: '#1a1a1a',
    border: '#e0e0e0',
    accent: '#007bff'
  };
}

export function getDarkThemeColors(): ThemeColors {
  return {
    background: '#1a1a1a',
    text: '#f5f5f5',
    border: '#404040',
    accent: '#4dabf7'
  };
}

// Utility function to inject styles into document head
export function injectOverlayStyles(): void {
  const existingStyle = document.getElementById('tf-overlay-styles');
  if (existingStyle) {
    return; // Styles already injected
  }

  const styleElement = document.createElement('style');
  styleElement.id = 'tf-overlay-styles';
  styleElement.textContent = getOverlayStyles();
  document.head.appendChild(styleElement);
}

// Utility function to remove injected styles
export function removeOverlayStyles(): void {
  const existingStyle = document.getElementById('tf-overlay-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
}

export function getOverlayStyles(): string {
  const lightTheme = getLightThemeColors();
  const darkTheme = getDarkThemeColors();

  return `
    /* CSS Reset and Base Styles */
    .tf-overlay * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* Main overlay container */
    .tf-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      animation: fadeIn 0.3s ease-out;
    }

    /* Semi-transparent backdrop */
    .tf-overlay-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.8);
      opacity: 0.8;
    }

    /* Content panel */
    .tf-overlay-content {
      position: relative;
      max-width: 900px;
      width: 90%;
      max-height: 90vh;
      margin: 0 auto;
      margin-top: 5vh;
      background-color: ${lightTheme.background};
      color: ${lightTheme.text};
      border: 1px solid ${lightTheme.border};
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      overflow: hidden;
      animation: slideUp 0.3s ease-out;
    }

    /* Dark theme support */
    .tf-overlay.tf-dark-theme .tf-overlay-content {
      background-color: ${darkTheme.background};
      color: ${darkTheme.text};
      border-color: ${darkTheme.border};
    }

    /* Close button */
    .tf-close-button {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 32px;
      height: 32px;
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: ${lightTheme.text};
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s ease;
    }

    .tf-close-button:hover {
      background-color: rgba(0, 0, 0, 0.1);
    }

    .tf-overlay.tf-dark-theme .tf-close-button {
      color: ${darkTheme.text};
    }

    .tf-overlay.tf-dark-theme .tf-close-button:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }

    /* Loading spinner */
    .tf-loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid ${lightTheme.border};
      border-top: 4px solid ${lightTheme.accent};
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }

    .tf-overlay.tf-dark-theme .tf-loading-spinner {
      border-color: ${darkTheme.border};
      border-top-color: ${darkTheme.accent};
    }

    /* Loading container */
    .tf-loading-container {
      padding: 40px;
      text-align: center;
    }

    /* Comment content area */
    .tf-comments-container {
      max-height: 70vh;
      overflow-y: auto;
      padding: 20px;
    }

    /* Animation keyframes */
    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes slideUp {
      from {
        transform: translateY(30px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Responsive design */
    @media (max-width: 768px) {
      .tf-overlay-content {
        width: 95%;
        margin-top: 2vh;
        max-height: 95vh;
      }
      
      .tf-comments-container {
        padding: 15px;
        max-height: 80vh;
      }
    }

    /* Smooth scrolling */
    .tf-comments-container {
      scroll-behavior: smooth;
    }

    .tf-comments-container::-webkit-scrollbar {
      width: 8px;
    }

    .tf-comments-container::-webkit-scrollbar-track {
      background: ${lightTheme.border};
    }

    .tf-comments-container::-webkit-scrollbar-thumb {
      background: ${lightTheme.accent};
      border-radius: 4px;
    }

    .tf-overlay.tf-dark-theme .tf-comments-container::-webkit-scrollbar-track {
      background: ${darkTheme.border};
    }

    .tf-overlay.tf-dark-theme .tf-comments-container::-webkit-scrollbar-thumb {
      background: ${darkTheme.accent};
    }
  `;
}