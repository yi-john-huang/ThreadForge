// Enhanced ExpansionEngine with timeout and retry logic
import { CommentData, ErrorType } from './types';

export interface ExpansionProgress {
  iteration: number;
  elementsFound: number;
  isComplete: boolean;
  totalExpanded?: number;
}

export interface ExpansionResult {
  success: boolean;
  totalIterations: number;
  totalExpanded: number;
  error?: string;
  comments?: CommentData[];
}

export class ExpansionEngine {
  private readonly TIMEOUT_MS = 60000; // 60 seconds
  private readonly MAX_ITERATIONS = 30;
  private readonly MAX_DEPTH = 10; // Maximum expansion depth
  private readonly MIN_DELAY_MS = 500; // Minimum delay between clicks
  private readonly WAIT_RETRY_MS = 1500; // Wait time when no new elements found
  private mutationObserver: MutationObserver | null = null;
  private newContentDetected = false;

  // Multiple fallback selectors for finding expand buttons
  private readonly EXPAND_SELECTORS = [
    // Primary selectors
    'button[aria-label*="Show replies"]',
    'button[aria-label*="View replies"]',
    '[role="button"][aria-label*="replies"]',
    
    // Text-based selectors
    'button:contains("Show replies")',
    'button:contains("View replies")',
    'button:contains("Show more")',
    
    // Generic fallback selectors
    '[role="button"]:contains("View")',
    '[role="button"]:contains("Show")',
    'div[role="button"]:contains("replies")',
    'span[role="button"]:contains("more")',
    
    // Threads.net specific selectors (if known)
    '[data-testid*="reply"]',
    '[data-testid*="expand"]',
    '.expand-replies',
    '.show-more-replies'
  ];

  /**
   * Find expand elements using multiple fallback selectors
   */
  findExpandElements(): HTMLElement[] {
    const elements: HTMLElement[] = [];
    const foundElements = new Set<HTMLElement>();

    for (const selector of this.EXPAND_SELECTORS) {
      try {
        // Handle :contains pseudo-selector manually since it's not standard CSS
        if (selector.includes(':contains(')) {
          const [baseSelector, containsText] = this.parseContainsSelector(selector);
          const candidateElements = document.querySelectorAll(baseSelector);
          
          candidateElements.forEach((el) => {
            const element = el as HTMLElement;
            if (element.textContent?.toLowerCase().includes(containsText.toLowerCase()) && 
                !foundElements.has(element)) {
              elements.push(element);
              foundElements.add(element);
            }
          });
        } else {
          // Standard CSS selector
          const candidateElements = document.querySelectorAll(selector);
          candidateElements.forEach((el) => {
            const element = el as HTMLElement;
            if (!foundElements.has(element)) {
              elements.push(element);
              foundElements.add(element);
            }
          });
        }
      } catch (error) {
        // Continue with next selector if current one fails
        console.debug(`Selector failed: ${selector}`, error);
      }
    }

    return elements;
  }

  /**
   * Parse :contains() pseudo-selector into base selector and text
   */
  private parseContainsSelector(selector: string): [string, string] {
    const containsMatch = selector.match(/^(.+):contains\("([^"]+)"\)$/);
    if (containsMatch) {
      return [containsMatch[1], containsMatch[2]];
    }
    return [selector.replace(/:contains\([^)]+\)/, ''), ''];
  }

  /**
   * Expand comments with timeout mechanism
   */
  async expandWithTimeout(progressCallback?: (progress: ExpansionProgress) => void): Promise<ExpansionResult> {
    let iteration = 0;
    let totalExpanded = 0;

    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('EXPANSION_TIMEOUT'));
        }, this.TIMEOUT_MS);
      });

      // Main expansion logic
      const expansionPromise = this.performExpansion(progressCallback);

      // Race between expansion and timeout
      const result = await Promise.race([expansionPromise, timeoutPromise]);
      return result;

    } catch (error) {
      let errorType = ErrorType.DOM_NOT_FOUND;
      
      if (error instanceof Error) {
        if (error.message === 'EXPANSION_TIMEOUT') {
          errorType = ErrorType.EXPANSION_TIMEOUT;
        } else if (error.message.includes('DOM')) {
          errorType = ErrorType.DOM_NOT_FOUND;
        } else {
          errorType = ErrorType.PARSING_ERROR;
        }
      }

      return {
        success: false,
        totalIterations: iteration,
        totalExpanded: 0,
        error: errorType
      };
    }
  }

  /**
   * Setup MutationObserver to detect newly loaded comment sections
   */
  private setupMutationObserver(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }

    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any added nodes contain comment-like structures
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              
              // Check if the element itself matches comment indicators
              const elementMatches = element.matches([
                'div[role="article"]',
                '[data-testid*="comment"]',
                '.comment',
                '[aria-label*="comment"]',
                'button[aria-label*="replies"]'
              ].join(','));

              // Or check if it contains comment indicators
              const hasCommentIndicators = element.querySelector([
                'div[role="article"]',
                '[data-testid*="comment"]',
                '.comment',
                '[aria-label*="comment"]',
                'button[aria-label*="replies"]'
              ].join(','));

              if (elementMatches || hasCommentIndicators) {
                this.newContentDetected = true;
                break;
              }
            }
          }
          if (this.newContentDetected) break;
        }
      }
    });

    // Observe the entire document for changes
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      attributeOldValue: false,
      characterData: false,
      characterDataOldValue: false
    });
  }

  /**
   * Cleanup MutationObserver
   */
  private cleanupMutationObserver(): void {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  /**
   * Perform the actual expansion logic with optimized iteration
   */
  private async performExpansion(progressCallback?: (progress: ExpansionProgress) => void): Promise<ExpansionResult> {
    let iteration = 0;
    let totalExpanded = 0;
    let consecutiveEmptyIterations = 0;
    let expansionDepth = 0;

    // Setup mutation observer to detect new content
    this.setupMutationObserver();

    try {
      while (iteration < this.MAX_ITERATIONS && expansionDepth < this.MAX_DEPTH) {
        iteration++;
        this.newContentDetected = false;
        
        try {
          // Find expand elements
          const expandElements = this.findExpandElements();
          
          // Update progress
          if (progressCallback) {
            progressCallback({
              iteration,
              elementsFound: expandElements.length,
              isComplete: expandElements.length === 0 && !this.newContentDetected,
              totalExpanded
            });
          }

          // If no elements found, check if we should continue
          if (expandElements.length === 0) {
            consecutiveEmptyIterations++;
            
            // If no elements found for multiple iterations, we're likely done
            if (consecutiveEmptyIterations >= 3 && !this.newContentDetected) {
              break;
            }
            
            // Wait and retry to allow for dynamic content loading
            await this.delay(this.WAIT_RETRY_MS);
            
            // Check if new content was detected during the wait
            if (this.newContentDetected) {
              consecutiveEmptyIterations = 0; // Reset counter if new content detected
              continue;
            }
            continue;
          }

          consecutiveEmptyIterations = 0;
          expansionDepth++; // Increment depth when we find elements to expand

          // Click expand elements with optimized delays
          for (const element of expandElements) {
            try {
              // Click element
              this.clickElement(element);
              totalExpanded++;

              // Minimum delay between clicks (500ms as per requirement)
              await this.delay(this.MIN_DELAY_MS);
              
              // Check for new content after each click
              if (this.newContentDetected) {
                // Reset depth tracking if new content suggests deeper nesting
                this.newContentDetected = false;
              }
            } catch (error) {
              console.debug('Failed to click element:', error);
            }
          }

          // Wait for potential DOM updates after clicking all elements
          await this.delay(this.MIN_DELAY_MS);

        } catch (error) {
          console.error('Error in expansion iteration:', error);
          throw new Error('DOM_ERROR');
        }
      }

      return {
        success: true,
        totalIterations: iteration,
        totalExpanded,
        comments: [] // Will be populated by comment extraction in later tasks
      };
    } finally {
      // Always cleanup observer
      this.cleanupMutationObserver();
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  async retryWithBackoff<T>(
    operation: () => Promise<T> | T,
    maxRetries: number,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Don't delay after the last attempt
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s...
          await this.delay(delay);
        }
      }
    }
    
    throw lastError!;
  }

  /**
   * Click an element safely
   */
  private clickElement(element: HTMLElement): void {
    if (!element || typeof element.click !== 'function') {
      throw new Error('Invalid element for clicking');
    }
    
    try {
      // Scroll element into view if needed
      if (element.scrollIntoView) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      
      // Ensure element is clickable
      if (element.offsetParent === null) {
        throw new Error('Element is not visible');
      }
      
      // Trigger click
      element.click();
    } catch (error) {
      throw new Error(`Click failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract comment data from current DOM state
   * This will be enhanced in Task 7
   */
  scrapeCommentData(): CommentData[] {
    // Basic implementation - will be enhanced in Task 7
    const comments: CommentData[] = [];
    
    try {
      // Find comment elements using various selectors
      const commentElements = document.querySelectorAll([
        'div[role="article"]',
        '[data-testid*="comment"]',
        '.comment',
        '[aria-label*="comment"]'
      ].join(','));

      commentElements.forEach((element, index) => {
        const htmlElement = element as HTMLElement;
        const comment: CommentData = {
          id: `comment-${index}-${Date.now()}`,
          author: this.extractAuthor(htmlElement),
          text: this.extractText(htmlElement),
          timestamp: this.extractTimestamp(htmlElement),
          replies: [],
          depth: 0
        };
        
        if (comment.text && comment.text.trim().length > 0) {
          comments.push(comment);
        }
      });
    } catch (error) {
      console.error('Error scraping comment data:', error);
    }
    
    return comments;
  }

  /**
   * Extract author from comment element
   */
  private extractAuthor(element: HTMLElement): string | null {
    const authorSelectors = [
      '[data-testid*="author"]',
      '.author',
      '[aria-label*="author"]',
      'strong',
      'b',
      'span[role="link"]'
    ];

    for (const selector of authorSelectors) {
      const authorElement = element.querySelector(selector) as HTMLElement;
      if (authorElement && authorElement.textContent?.trim()) {
        return authorElement.textContent.trim();
      }
    }

    return null;
  }

  /**
   * Extract text content from comment element
   */
  private extractText(element: HTMLElement): string | null {
    // Remove author and timestamp elements temporarily to get just the comment text
    const clone = element.cloneNode(true) as HTMLElement;
    
    // Remove known non-content elements
    const elementsToRemove = clone.querySelectorAll([
      '[data-testid*="author"]',
      '[data-testid*="timestamp"]',
      '.author',
      '.timestamp',
      'time',
      'button',
      'strong', // Remove author names in strong tags
      'b'       // Remove author names in bold tags
    ].join(','));
    
    elementsToRemove.forEach(el => el.remove());
    
    const text = clone.textContent?.trim();
    return text && text.length > 0 ? text : null;
  }

  /**
   * Extract timestamp from comment element
   */
  private extractTimestamp(element: HTMLElement): string | null {
    const timestampSelectors = [
      'time',
      '[data-testid*="timestamp"]',
      '.timestamp',
      '[aria-label*="time"]'
    ];

    for (const selector of timestampSelectors) {
      const timeElement = element.querySelector(selector) as HTMLElement;
      if (timeElement) {
        // Try datetime attribute first, then text content
        const datetime = timeElement.getAttribute('datetime');
        if (datetime) return datetime;
        
        const text = timeElement.textContent?.trim();
        if (text) return text;
      }
    }

    return null;
  }
}