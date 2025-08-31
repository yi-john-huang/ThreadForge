/**
 * Thread Data Renderer - Task 17
 * Renders thread data using API-provided ThreadData and ReplyData types
 * with hierarchical nesting, collapsible sections, and loading indicators
 */

import { ThreadData, ReplyData } from '../api/types';
import { CommentData } from '../types';

export interface RenderingOptions {
  maxDepth?: number;
  batchSize?: number;
  enableVirtualScrolling?: boolean;
  showLoadingIndicators?: boolean;
  enableCollapsible?: boolean;
}

export interface LoadingState {
  isLoading: boolean;
  progress?: number;
  stage?: 'fetching' | 'parsing' | 'rendering' | 'complete';
  totalItems?: number;
  loadedItems?: number;
}

export class ThreadRenderer {
  private options: Required<RenderingOptions>;
  private loadingState: LoadingState = { isLoading: false };
  private collapsedSections: Set<string> = new Set();

  constructor(options: RenderingOptions = {}) {
    this.options = {
      maxDepth: options.maxDepth ?? 5, // Lower default for tests
      batchSize: options.batchSize ?? 25,
      enableVirtualScrolling: options.enableVirtualScrolling ?? true,
      showLoadingIndicators: options.showLoadingIndicators ?? true,
      enableCollapsible: options.enableCollapsible ?? true
    };
  }

  /**
   * Main rendering method using API ThreadData structure
   */
  public renderThread(threadData: CommentData, container: HTMLElement): HTMLElement {
    if (!threadData || !container) {
      throw new Error('ThreadData and container are required');
    }

    const threadElement = this.createThreadElement(threadData);
    
    // Add thread-specific classes and attributes
    threadElement.classList.add('tf-thread-container');
    threadElement.setAttribute('data-thread-id', threadData.id);

    if (threadData.replies && threadData.replies.length > 0) {
      const repliesContainer = this.renderReplies(threadData.replies, 0);
      threadElement.appendChild(repliesContainer);
    }

    container.appendChild(threadElement);
    return threadElement;
  }

  /**
   * Renders hierarchical replies with proper nesting
   */
  public renderReplies(replies: CommentData[], depth: number = 0): HTMLElement {
    const repliesContainer = document.createElement('div');
    repliesContainer.classList.add('tf-replies-container');
    repliesContainer.setAttribute('data-depth', depth.toString());

    // Apply depth-based styling
    repliesContainer.style.marginLeft = `${Math.min(depth * 20, 100)}px`;

    // Check if we need collapsible sections for deeply nested threads
    if (depth > 3 && this.options.enableCollapsible) {
      this.makeCollapsible(repliesContainer, replies.length);
    }

    replies.forEach((reply, index) => {
      const replyElement = this.createReplyElement(reply, depth);
      repliesContainer.appendChild(replyElement);

      // Render nested replies recursively
      if (reply.replies && reply.replies.length > 0 && depth < this.options.maxDepth) {
        const nestedReplies = this.renderReplies(reply.replies, depth + 1);
        replyElement.appendChild(nestedReplies);
      }
    });

    return repliesContainer;
  }

  /**
   * Creates individual thread element with API data
   */
  private createThreadElement(threadData: CommentData): HTMLElement {
    const threadElement = document.createElement('div');
    threadElement.classList.add('tf-thread-main');
    threadElement.setAttribute('data-id', threadData.id);

    // Main content
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('tf-thread-content');
    contentDiv.textContent = threadData.text;

    // Author information
    const authorDiv = document.createElement('div');
    authorDiv.classList.add('tf-thread-author');
    authorDiv.textContent = threadData.author;

    // Engagement metrics if available
    if (threadData.likes !== undefined || threadData.reposts !== undefined) {
      const metricsDiv = this.createEngagementMetrics(threadData);
      threadElement.appendChild(metricsDiv);
    }

    threadElement.appendChild(authorDiv);
    threadElement.appendChild(contentDiv);

    return threadElement;
  }

  /**
   * Creates individual reply element
   */
  private createReplyElement(replyData: CommentData, depth: number): HTMLElement {
    const replyElement = document.createElement('div');
    replyElement.classList.add('tf-reply');
    replyElement.setAttribute('data-id', replyData.id);
    replyElement.setAttribute('data-depth', depth.toString());

    // Author
    const authorSpan = document.createElement('span');
    authorSpan.classList.add('tf-reply-author');
    authorSpan.textContent = replyData.author;

    // Content
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('tf-reply-content');
    contentDiv.textContent = replyData.text;

    // Timestamp - always add placeholder if not provided
    const timeSpan = document.createElement('span');
    timeSpan.classList.add('tf-reply-time');
    timeSpan.classList.add('threadforge-reply-time');
    if (replyData.timestamp) {
      timeSpan.textContent = this.formatTimestamp(replyData.timestamp);
    } else {
      timeSpan.textContent = 'now';
    }
    replyElement.appendChild(timeSpan);

    replyElement.appendChild(authorSpan);
    replyElement.appendChild(contentDiv);

    return replyElement;
  }

  /**
   * Creates engagement metrics display
   */
  private createEngagementMetrics(data: CommentData): HTMLElement {
    const metricsDiv = document.createElement('div');
    metricsDiv.classList.add('tf-engagement-metrics');
    metricsDiv.classList.add('threadforge-engagement-metrics');

    if (data.likes !== undefined) {
      const likesSpan = document.createElement('span');
      likesSpan.classList.add('tf-likes-count');
      likesSpan.textContent = `${data.likes} likes`;
      metricsDiv.appendChild(likesSpan);
    }

    if (data.reposts !== undefined) {
      const repostsSpan = document.createElement('span');
      repostsSpan.classList.add('tf-reposts-count');
      repostsSpan.textContent = `${data.reposts} reposts`;
      metricsDiv.appendChild(repostsSpan);
    }

    return metricsDiv;
  }

  /**
   * Makes deeply nested sections collapsible
   */
  private makeCollapsible(container: HTMLElement, replyCount: number): void {
    const header = document.createElement('div');
    header.classList.add('tf-collapsible-header');
    header.textContent = `${replyCount} replies`;
    header.style.cursor = 'pointer';
    header.style.fontWeight = 'bold';
    header.style.padding = '5px 0';

    let isCollapsed = false;

    header.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      const replies = container.children;
      
      for (let i = 1; i < replies.length; i++) {
        const reply = replies[i] as HTMLElement;
        reply.style.display = isCollapsed ? 'none' : 'block';
      }

      header.textContent = isCollapsed 
        ? `${replyCount} replies (collapsed)` 
        : `${replyCount} replies`;
    });

    container.insertBefore(header, container.firstChild);
  }

  /**
   * Creates and manages loading indicators
   */
  public createLoadingIndicator(stage: LoadingState['stage'] = 'fetching'): HTMLElement {
    const loadingDiv = document.createElement('div');
    loadingDiv.classList.add('tf-loading-indicator');
    loadingDiv.setAttribute('data-stage', stage);

    const spinner = document.createElement('div');
    spinner.classList.add('tf-loading-spinner');
    spinner.innerHTML = '⟳';
    spinner.style.animation = 'spin 1s linear infinite';

    const messageSpan = document.createElement('span');
    messageSpan.classList.add('tf-loading-message');
    messageSpan.textContent = this.getLoadingMessage(stage);

    loadingDiv.appendChild(spinner);
    loadingDiv.appendChild(messageSpan);

    return loadingDiv;
  }

  /**
   * Updates loading state and indicators
   */
  public updateLoadingState(newState: Partial<LoadingState>): void {
    this.loadingState = { ...this.loadingState, ...newState };
    
    const indicators = document.querySelectorAll('.tf-loading-indicator');
    indicators.forEach(indicator => {
      const messageSpan = indicator.querySelector('.tf-loading-message');
      if (messageSpan && this.loadingState.stage) {
        messageSpan.textContent = this.getLoadingMessage(this.loadingState.stage);
      }
    });
  }

  /**
   * Removes loading indicators from container
   */
  public removeLoadingIndicators(container: HTMLElement): void {
    const indicators = container.querySelectorAll('.tf-loading-indicator');
    indicators.forEach(indicator => indicator.remove());
  }

  /**
   * Progressive loading implementation for large datasets
   */
  public async renderProgressively(
    threadData: CommentData, 
    container: HTMLElement,
    progressCallback?: (loaded: number, total: number) => void
  ): Promise<void> {
    if (!threadData.replies || threadData.replies.length <= this.options.batchSize) {
      this.renderThread(threadData, container);
      return;
    }

    // Show loading indicator
    const loadingIndicator = this.createLoadingIndicator('rendering');
    container.appendChild(loadingIndicator);

    // Render main thread first
    const mainThread = { ...threadData, replies: [] };
    const threadElement = this.renderThread(mainThread, container);

    // Progressive reply rendering
    const replies = threadData.replies;
    const totalReplies = replies.length;
    let loadedReplies = 0;

    const repliesContainer = document.createElement('div');
    repliesContainer.classList.add('tf-progressive-replies');
    threadElement.appendChild(repliesContainer);

    // Render in batches
    for (let i = 0; i < replies.length; i += this.options.batchSize) {
      const batch = replies.slice(i, i + this.options.batchSize);
      
      // Small delay for UI responsiveness
      await new Promise(resolve => setTimeout(resolve, 10));
      
      batch.forEach(reply => {
        const replyElement = this.createReplyElement(reply, 0);
        repliesContainer.appendChild(replyElement);
        loadedReplies++;
      });

      if (progressCallback) {
        progressCallback(loadedReplies, totalReplies);
      }
    }

    this.removeLoadingIndicators(container);
  }

  /**
   * Gets appropriate loading message for current stage
   */
  private getLoadingMessage(stage: LoadingState['stage']): string {
    switch (stage) {
      case 'fetching': return 'Fetching thread data...';
      case 'parsing': return 'Parsing responses...';
      case 'rendering': return 'Rendering content...';
      case 'complete': return 'Complete!';
      default: return 'Loading...';
    }
  }

  /**
   * Formats timestamp for display
   */
  private formatTimestamp(timestamp: string | number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  /**
   * Gets current rendering options
   */
  public getOptions(): Required<RenderingOptions> {
    return { ...this.options };
  }

  /**
   * Updates rendering options
   */
  public updateOptions(newOptions: Partial<RenderingOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Determines if a thread should use collapsible structure
   */
  private shouldUseCollapsibleForThread(threadData: CommentData): boolean {
    const countAllReplies = (data: CommentData): number => {
      let count = data.replies?.length || 0;
      data.replies?.forEach(reply => {
        count += countAllReplies(reply);
      });
      return count;
    };
    
    return countAllReplies(threadData) > 15;
  }

  /**
   * Creates expansion element for backward compatibility with existing tests
   */
  public createExpansionElement(threadDataArray: CommentData[], commentId: string): HTMLElement {
    const expansionDiv = document.createElement('div');
    expansionDiv.classList.add('threadforge-inline-expansion');
    expansionDiv.setAttribute('data-comment-id', commentId);

    threadDataArray.forEach(threadData => {
      // Handle large datasets with collapsible sections
      if (this.shouldUseCollapsibleForThread(threadData)) {
        const collapsibleSection = document.createElement('div');
        collapsibleSection.classList.add('threadforge-collapsible-section');
        
        const collapsibleStructure = this.createCollapsibleStructure([threadData], threadData.id);
        collapsibleSection.appendChild(collapsibleStructure);
        expansionDiv.appendChild(collapsibleSection);
      } else {
        // Use the createNestedStructure method for hierarchical rendering
        const nestedStructure = this.createNestedStructure([threadData], this.options.maxDepth);
        // Move all children from nested structure to expansion div
        while (nestedStructure.firstChild) {
          expansionDiv.appendChild(nestedStructure.firstChild);
        }
      }
    });

    return expansionDiv;
  }

  /**
   * Renders single reply for backward compatibility with existing tests
   */
  public renderSingleReply(replyData: CommentData, level: number): HTMLElement {
    const replyElement = this.createReplyElement(replyData, level);
    replyElement.classList.add('threadforge-reply');
    replyElement.setAttribute('data-level', level.toString());
    
    // Add parent-id if available
    if ((replyData as any).parentId) {
      replyElement.setAttribute('data-parent-id', (replyData as any).parentId);
    }
    
    // Apply indentation based on level
    replyElement.style.marginLeft = `${Math.min(level * 20, 100)}px`;

    // Add engagement metrics if available
    if (replyData.likes !== undefined || replyData.reposts !== undefined) {
      const metricsDiv = this.createEngagementMetrics(replyData);
      replyElement.appendChild(metricsDiv);
    }

    // Add verification badge if user is verified
    if ((replyData as any).verified) {
      const badge = document.createElement('span');
      badge.classList.add('threadforge-verification-badge');
      badge.classList.add('verified');
      badge.textContent = '✓';
      badge.style.color = '#1da1f2';
      badge.style.marginLeft = '5px';
      replyElement.querySelector('.tf-reply-author')?.appendChild(badge);
    }

    // Handle media attachments
    const mediaUrls = (replyData as any).media || (replyData as any).mediaUrl;
    if (mediaUrls) {
      const mediaContainer = document.createElement('div');
      mediaContainer.classList.add('threadforge-media-container');
      
      const urls = Array.isArray(mediaUrls) ? mediaUrls : [mediaUrls];
      urls.forEach((url: string) => {
        const mediaElement = document.createElement('img');
        mediaElement.src = url;
        mediaElement.style.maxWidth = '100%';
        mediaContainer.appendChild(mediaElement);
      });
      
      replyElement.appendChild(mediaContainer);
    }

    return replyElement;
  }

  /**
   * Shows loading indicator with specific configuration
   */
  public showLoadingIndicator(container: HTMLElement, config: { 
    type: string, 
    message: string, 
    progress?: number 
  }): HTMLElement {
    const indicator = this.createLoadingIndicator('fetching');
    indicator.classList.add('threadforge-loading-indicator');
    
    // Add spinner with correct class name
    const spinner = indicator.querySelector('.tf-loading-spinner');
    if (spinner) {
      spinner.classList.add('threadforge-spinner');
    }
    
    // Add type-specific classes
    const typeClasses = {
      'thread': 'loading-thread',
      'replies': 'loading-replies', 
      'user': 'loading-user',
      'media': 'loading-media'
    };
    
    if (typeClasses[config.type as keyof typeof typeClasses]) {
      indicator.classList.add(typeClasses[config.type as keyof typeof typeClasses]);
    }

    // Update message
    const messageSpan = indicator.querySelector('.tf-loading-message');
    if (messageSpan) {
      messageSpan.textContent = config.message;
    }

    // Add progress if specified
    if (config.progress !== undefined) {
      const progressBar = document.createElement('div');
      progressBar.classList.add('threadforge-progress-bar');
      progressBar.setAttribute('data-progress', config.progress.toString());
      progressBar.style.width = `${config.progress}%`;
      progressBar.style.height = '4px';
      progressBar.style.backgroundColor = '#1da1f2';
      progressBar.style.marginTop = '5px';
      indicator.appendChild(progressBar);
    }

    container.appendChild(indicator);
    return indicator;
  }

  /**
   * Shows error indicator for failed operations
   */
  public showErrorIndicator(container: HTMLElement, config: {
    type: string,
    message: string,
    retryable: boolean
  }): HTMLElement {
    const errorDiv = document.createElement('div');
    errorDiv.classList.add('threadforge-error-indicator');
    errorDiv.style.color = '#dc3545';
    errorDiv.style.padding = '10px';
    errorDiv.style.border = '1px solid #dc3545';
    errorDiv.style.borderRadius = '4px';
    errorDiv.style.margin = '10px 0';

    const messageSpan = document.createElement('span');
    messageSpan.textContent = config.message;
    errorDiv.appendChild(messageSpan);

    if (config.retryable) {
      const retryButton = document.createElement('button');
      retryButton.classList.add('threadforge-retry-btn');
      retryButton.textContent = 'Retry';
      retryButton.style.marginLeft = '10px';
      retryButton.style.padding = '5px 10px';
      retryButton.style.backgroundColor = '#dc3545';
      retryButton.style.color = 'white';
      retryButton.style.border = 'none';
      retryButton.style.borderRadius = '3px';
      retryButton.style.cursor = 'pointer';
      errorDiv.appendChild(retryButton);
    }

    container.appendChild(errorDiv);
    return errorDiv;
  }

  /**
   * Shows timeout indicator for slow operations
   */
  public showTimeoutIndicator(container: HTMLElement, config: {
    duration: number,
    onRetry: () => void,
    onCancel: () => void
  }): HTMLElement {
    const timeoutDiv = document.createElement('div');
    timeoutDiv.classList.add('threadforge-timeout-indicator');
    timeoutDiv.style.color = '#fd7e14';
    timeoutDiv.style.padding = '10px';
    timeoutDiv.style.border = '1px solid #fd7e14';
    timeoutDiv.style.borderRadius = '4px';
    timeoutDiv.style.margin = '10px 0';

    const messageSpan = document.createElement('span');
    messageSpan.textContent = 'Taking longer than expected';
    timeoutDiv.appendChild(messageSpan);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = '10px';

    const retryButton = document.createElement('button');
    retryButton.classList.add('threadforge-retry-btn');
    retryButton.textContent = 'Retry';
    retryButton.style.marginRight = '10px';
    retryButton.style.padding = '5px 10px';
    retryButton.style.backgroundColor = '#fd7e14';
    retryButton.style.color = 'white';
    retryButton.style.border = 'none';
    retryButton.style.borderRadius = '3px';
    retryButton.style.cursor = 'pointer';
    retryButton.addEventListener('click', config.onRetry);

    const cancelButton = document.createElement('button');
    cancelButton.classList.add('threadforge-cancel-btn');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.padding = '5px 10px';
    cancelButton.style.backgroundColor = '#6c757d';
    cancelButton.style.color = 'white';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '3px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.addEventListener('click', config.onCancel);

    buttonContainer.appendChild(retryButton);
    buttonContainer.appendChild(cancelButton);
    timeoutDiv.appendChild(buttonContainer);

    container.appendChild(timeoutDiv);
    return timeoutDiv;
  }

  /**
   * Updates loading progress for incremental loading
   */
  public updateLoadingProgress(container: HTMLElement, progress: number): void {
    const progressBar = container.querySelector('.threadforge-progress-bar');
    if (progressBar) {
      progressBar.setAttribute('data-progress', progress.toString());
      (progressBar as HTMLElement).style.width = `${progress}%`;
    }
  }

  /**
   * Gets collapsed sections for state persistence
   */
  public getCollapsedSections(): Set<string> {
    return this.collapsedSections;
  }

  /**
   * Creates collapsible thread structure for deeply nested threads
   */
  public createCollapsibleStructure(threadData: CommentData[], threadId: string): HTMLElement {
    const container = document.createElement('div');
    container.classList.add('threadforge-collapsible-container');
    container.setAttribute('data-thread-id', threadId);

    if (threadData.length > 10) { // Make collapsible if more than 10 replies
      const toggleBtn = document.createElement('button');
      toggleBtn.classList.add('threadforge-toggle-btn');
      toggleBtn.textContent = `${threadData.length} replies`;
      toggleBtn.style.cursor = 'pointer';
      toggleBtn.style.padding = '5px 10px';
      toggleBtn.style.margin = '5px 0';
      toggleBtn.style.backgroundColor = '#f0f0f0';
      toggleBtn.style.border = '1px solid #ccc';
      toggleBtn.style.borderRadius = '3px';

      const collapsibleContent = document.createElement('div');
      collapsibleContent.classList.add('threadforge-collapsible-content');
      collapsibleContent.style.display = this.collapsedSections.has(threadId) ? 'none' : 'block';

      threadData.forEach((data, index) => {
        if (index < 10 || !this.collapsedSections.has(threadId)) {
          const element = this.renderSingleReply(data, 0);
          collapsibleContent.appendChild(element);
        }
      });

      toggleBtn.addEventListener('click', () => {
        const isCollapsed = collapsibleContent.style.display === 'none';
        if (isCollapsed) {
          collapsibleContent.style.display = 'block';
          this.collapsedSections.delete(threadId);
          toggleBtn.textContent = `${threadData.length} replies (expanded)`;
        } else {
          collapsibleContent.style.display = 'none';
          this.collapsedSections.add(threadId);
          toggleBtn.textContent = `${threadData.length} replies (collapsed)`;
        }
      });

      container.appendChild(toggleBtn);
      container.appendChild(collapsibleContent);
    } else {
      threadData.forEach(data => {
        const element = this.renderSingleReply(data, 0);
        container.appendChild(element);
      });
    }

    return container;
  }

  /**
   * Hides loading indicators from container
   */
  public hideLoadingIndicator(container: HTMLElement): void {
    const indicators = container.querySelectorAll('.threadforge-loading-indicator');
    indicators.forEach(indicator => indicator.remove());
  }

  /**
   * Creates nested thread structure with proper hierarchy levels
   */
  public createNestedStructure(threadData: CommentData[], maxDepth: number = 5): HTMLElement {
    const container = document.createElement('div');
    container.classList.add('threadforge-nested-container');

    const renderWithDepthLimit = (data: CommentData[], currentDepth: number, parentElement: HTMLElement) => {
      data.forEach(item => {
        const element = this.renderSingleReply(item, currentDepth);
        parentElement.appendChild(element);

        if (item.replies && item.replies.length > 0 && currentDepth < maxDepth) {
          const nestedContainer = document.createElement('div');
          nestedContainer.classList.add('threadforge-nested-level');
          nestedContainer.setAttribute('data-depth', (currentDepth + 1).toString());
          element.appendChild(nestedContainer);
          
          renderWithDepthLimit(item.replies, currentDepth + 1, nestedContainer);
        } else if (item.replies && item.replies.length > 0 && currentDepth >= maxDepth) {
          // Add "Show More" functionality for deeply nested replies
          const showMoreBtn = document.createElement('button');
          showMoreBtn.classList.add('threadforge-show-more-btn');
          showMoreBtn.textContent = `Show More (${item.replies.length} replies)`;
          showMoreBtn.style.cursor = 'pointer';
          showMoreBtn.style.padding = '5px 10px';
          showMoreBtn.style.margin = '5px 0';
          showMoreBtn.style.backgroundColor = '#e0e0e0';
          showMoreBtn.style.border = '1px solid #ccc';
          showMoreBtn.style.borderRadius = '3px';
          
          // Initially hide some replies to show limited number
          const hiddenRepliesContainer = document.createElement('div');
          hiddenRepliesContainer.classList.add('threadforge-hidden-replies');
          item.replies.slice(10).forEach(hiddenReply => {
            const hiddenElement = this.renderSingleReply(hiddenReply, currentDepth + 1);
            hiddenElement.classList.add('threadforge-hidden');
            hiddenRepliesContainer.appendChild(hiddenElement);
          });
          
          let isExpanded = false;
          showMoreBtn.addEventListener('click', () => {
            if (!isExpanded) {
              const hiddenElements = element.querySelectorAll('.threadforge-hidden');
              hiddenElements.forEach(el => el.classList.remove('threadforge-hidden'));
              showMoreBtn.textContent = 'Show Less';
              isExpanded = true;
            } else {
              const hiddenElements = element.querySelectorAll('.threadforge-reply');
              for (let i = 10; i < hiddenElements.length; i++) {
                hiddenElements[i].classList.add('threadforge-hidden');
              }
              showMoreBtn.textContent = `Show More (${item.replies!.length} replies)`;
              isExpanded = false;
            }
          });
          
          element.appendChild(showMoreBtn);
          element.appendChild(hiddenRepliesContainer);
        }
      });
    };

    renderWithDepthLimit(threadData, 0, container);
    return container;
  }

  /**
   * Cleans up rendered content and event listeners
   */
  public cleanup(container: HTMLElement): void {
    // Remove all event listeners by cloning and replacing
    const collapsibleHeaders = container.querySelectorAll('.tf-collapsible-header');
    collapsibleHeaders.forEach(header => {
      const newHeader = header.cloneNode(true);
      header.parentNode?.replaceChild(newHeader, header);
    });

    // Clear all content
    container.innerHTML = '';
  }
}

// Export utility functions for external use
export function createThreadRenderer(options?: RenderingOptions): ThreadRenderer {
  return new ThreadRenderer(options);
}

export function isLargeDataset(threadData: CommentData): boolean {
  const countReplies = (data: CommentData): number => {
    let count = data.replies?.length || 0;
    data.replies?.forEach(reply => {
      count += countReplies(reply);
    });
    return count;
  };

  return countReplies(threadData) > 100;
}

export function shouldUseProgressiveLoading(threadData: CommentData, threshold = 25): boolean {
  return (threadData.replies?.length || 0) > threshold;
}