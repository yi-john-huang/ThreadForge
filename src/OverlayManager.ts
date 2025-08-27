// OverlayManager class for managing comment overlay display
import { injectOverlayStyles, removeOverlayStyles } from './styles';

export class OverlayManager {
  private overlayElement: HTMLElement | null = null;
  private originalScrollY: number = 0;
  private keydownListener: ((event: KeyboardEvent) => void) | null = null;
  private focusableElements: NodeListOf<HTMLElement> | null = null;
  private lastFocusedElement: HTMLElement | null = null;

  createOverlay(): HTMLElement {
    // Create main overlay container
    const overlay = document.createElement('div');
    overlay.id = 'tf-overlay';
    overlay.className = 'tf-overlay';

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'tf-overlay-backdrop';

    // Create content panel
    const contentPanel = document.createElement('div');
    contentPanel.className = 'tf-overlay-content';

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.className = 'tf-close-button';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Close overlay');

    // Create loading container
    const loadingContainer = document.createElement('div');
    loadingContainer.className = 'tf-loading-container';

    const loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'tf-loading-spinner';

    const loadingText = document.createElement('div');
    loadingText.className = 'tf-loading-text';
    loadingText.textContent = 'Loading comments...';

    loadingContainer.appendChild(loadingSpinner);
    loadingContainer.appendChild(loadingText);

    // Create comments container (initially hidden)
    const commentsContainer = document.createElement('div');
    commentsContainer.className = 'tf-comments-container';
    commentsContainer.style.display = 'none';

    // Assemble the overlay
    contentPanel.appendChild(closeButton);
    contentPanel.appendChild(loadingContainer);
    contentPanel.appendChild(commentsContainer);

    overlay.appendChild(backdrop);
    overlay.appendChild(contentPanel);

    this.overlayElement = overlay;
    return overlay;
  }

  showOverlay(): void {
    if (!this.overlayElement) {
      throw new Error('Overlay not created. Call createOverlay() first.');
    }

    // Store original scroll position
    this.originalScrollY = window.pageYOffset;

    // Inject styles if not already present
    injectOverlayStyles();

    // Add overlay to DOM
    document.body.appendChild(this.overlayElement);

    // Attach event listeners
    this.attachEventListeners();
  }

  hideOverlay(): void {
    if (this.overlayElement && this.overlayElement.parentNode) {
      // Remove event listeners
      this.removeEventListeners();

      // Remove from DOM
      this.overlayElement.parentNode.removeChild(this.overlayElement);

      // Restore scroll position (with error handling for test environment)
      try {
        window.scrollTo(0, this.originalScrollY);
      } catch (error) {
        // Ignore scrollTo errors in test environment
        console.debug('ScrollTo not available in test environment');
      }

      // Clean up styles
      removeOverlayStyles();

      // Reset overlay element reference
      this.overlayElement = null;
    }
  }

  setLoading(loading: boolean, message?: string): void {
    if (!this.overlayElement) {
      return; // Gracefully handle missing element
    }

    const loadingContainer = this.overlayElement.querySelector('.tf-loading-container') as HTMLElement;
    const commentsContainer = this.overlayElement.querySelector('.tf-comments-container') as HTMLElement;
    const loadingText = this.overlayElement.querySelector('.tf-loading-text') as HTMLElement;

    if (loading) {
      if (loadingContainer) {
        loadingContainer.style.display = 'block';
      }
      if (commentsContainer) {
        commentsContainer.style.display = 'none';
      }
      if (message && loadingText) {
        loadingText.textContent = message;
      }
    } else {
      if (loadingContainer) {
        loadingContainer.style.display = 'none';
      }
      if (commentsContainer) {
        commentsContainer.style.display = 'block';
      }
    }
  }

  attachEventListeners(): void {
    if (!this.overlayElement) {
      return;
    }

    // Store currently focused element to restore later
    this.lastFocusedElement = document.activeElement as HTMLElement;

    // Close button listener
    const closeButton = this.overlayElement.querySelector('.tf-close-button');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        this.hideOverlay();
      });
    }

    // Backdrop click listener (click-outside-to-close)
    const backdrop = this.overlayElement.querySelector('.tf-overlay-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        this.hideOverlay();
      });
    }

    // Content panel click listener (prevent event bubbling)
    const contentPanel = this.overlayElement.querySelector('.tf-overlay-content');
    if (contentPanel) {
      contentPanel.addEventListener('click', (event) => {
        event.stopPropagation();
      });
    }

    // Setup focus trap
    this.setupFocusTrap();

    // Enhanced keyboard listener with focus trap
    this.keydownListener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.hideOverlay();
        return;
      }

      // Handle Tab key for focus trap
      if (event.key === 'Tab') {
        this.handleTabNavigation(event);
      }
    };
    document.addEventListener('keydown', this.keydownListener);

    // Focus the close button initially
    if (closeButton) {
      (closeButton as HTMLElement).focus();
    }
  }

  private removeEventListeners(): void {
    if (this.keydownListener) {
      document.removeEventListener('keydown', this.keydownListener);
      this.keydownListener = null;
    }

    // Restore focus to previously focused element
    if (this.lastFocusedElement && typeof this.lastFocusedElement.focus === 'function') {
      try {
        this.lastFocusedElement.focus();
      } catch (error) {
        // Ignore focus errors in test environment
        console.debug('Focus restoration failed in test environment');
      }
    }

    // Clear focus trap references
    this.focusableElements = null;
    this.lastFocusedElement = null;
    // Note: Other event listeners are removed when DOM elements are removed
  }

  private setupFocusTrap(): void {
    if (!this.overlayElement) {
      return;
    }

    // Find all focusable elements within the overlay
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    this.focusableElements = this.overlayElement.querySelectorAll(focusableSelector) as NodeListOf<HTMLElement>;
  }

  private handleTabNavigation(event: KeyboardEvent): void {
    if (!this.focusableElements || this.focusableElements.length === 0) {
      return;
    }

    const firstFocusable = this.focusableElements[0];
    const lastFocusable = this.focusableElements[this.focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift + Tab - move backwards
      if (document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      }
    } else {
      // Tab - move forwards
      if (document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }
  }

  // Public method to get overlay element for testing
  getOverlayElement(): HTMLElement | null {
    return this.overlayElement;
  }
}