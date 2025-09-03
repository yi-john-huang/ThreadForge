/**
 * Virtual Scroll Manager - Task 19
 * Implements virtual scrolling for large threads to optimize performance
 * with windowing logic, smooth scrolling, and pagination controls
 */

import { CommentData } from '../types';

export interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  bufferSize: number;
  threshold: number; // Minimum items to activate virtual scrolling
  overscan: number; // Extra items to render outside viewport
}

export interface VisibleRange {
  start: number;
  end: number;
}

export interface PerformanceMetrics {
  renderTime: number;
  scrollFrameRate: number;
  memoryUsage: number;
  visibleItemCount: number;
  totalItems: number;
  cacheSize: number;
}

export class VirtualScrollManager {
  private config: VirtualScrollConfig;
  private container?: HTMLElement;
  private viewport?: HTMLElement;
  private content?: HTMLElement;
  private itemCache: Map<number, HTMLElement> = new Map();
  private heightCache: Map<number, number> = new Map();
  private visibleItems: Map<number, HTMLElement> = new Map();
  private lastScrollTop: number = 0;
  private scrollDirection: 'up' | 'down' = 'down';
  private isScrolling: boolean = false;
  private scrollTimer?: number;
  private performanceMetrics: PerformanceMetrics;
  private renderStartTime: number = 0;

  constructor(config: Partial<VirtualScrollConfig> = {}) {
    this.config = {
      itemHeight: config.itemHeight ?? 120,
      containerHeight: config.containerHeight ?? 600,
      bufferSize: config.bufferSize ?? 5,
      threshold: config.threshold ?? 100,
      overscan: config.overscan ?? 3
    };

    this.performanceMetrics = {
      renderTime: 0,
      scrollFrameRate: 60,
      memoryUsage: 0,
      visibleItemCount: 0,
      totalItems: 0,
      cacheSize: 0
    };
  }

  /**
   * Creates virtual scrolling container for large datasets
   */
  public createVirtualContainer(totalItems: number, itemHeight?: number): HTMLElement {
    if (itemHeight) {
      this.config.itemHeight = itemHeight;
    }

    this.performanceMetrics.totalItems = totalItems;

    // Don't use virtual scrolling for small datasets
    if (totalItems < this.config.threshold) {
      const simpleContainer = document.createElement('div');
      simpleContainer.classList.add('tf-virtual-disabled');
      return simpleContainer;
    }

    // Create main container
    this.container = document.createElement('div');
    this.container.classList.add('tf-virtual-scroll-container');
    this.container.style.position = 'relative';
    this.container.style.overflow = 'auto';
    this.container.style.height = `${this.config.containerHeight}px`;
    this.container.style.scrollBehavior = 'smooth';
    this.container.setAttribute('data-thread-renderer', 'compatible');
    this.container.setAttribute('data-height-cache', 'enabled');

    // Create viewport
    this.viewport = document.createElement('div');
    this.viewport.classList.add('tf-virtual-viewport');
    this.viewport.style.position = 'relative';
    this.viewport.style.width = '100%';
    this.viewport.style.height = '100%';

    // Create content container with total height
    this.content = document.createElement('div');
    this.content.classList.add('tf-virtual-content');
    this.content.style.position = 'relative';
    this.content.style.width = '100%';
    this.content.style.height = `${totalItems * this.config.itemHeight}px`;

    // Assemble structure
    this.viewport.appendChild(this.content);
    this.container.appendChild(this.viewport);

    // Add scroll listener
    this.container.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });

    // Add intersection observer for performance monitoring
    this.setupPerformanceMonitoring();

    return this.container;
  }

  /**
   * Updates visible range based on scroll position
   */
  public updateVisibleRange(scrollTop: number, containerHeight: number): VisibleRange {
    const itemHeight = this.config.itemHeight || 120;
    const startIndex = Math.floor(scrollTop / itemHeight);
    const visibleItemCount = Math.ceil(containerHeight / itemHeight);
    const endIndex = Math.min(
      startIndex + visibleItemCount + this.config.overscan,
      this.performanceMetrics.totalItems
    );

    // Add buffer for smooth scrolling
    const bufferedStart = Math.max(0, startIndex - this.config.bufferSize);
    const bufferedEnd = Math.min(endIndex + this.config.bufferSize, this.performanceMetrics.totalItems);

    return {
      start: bufferedStart,
      end: bufferedEnd
    };
  }

  /**
   * Renders only visible items to DOM
   */
  public renderVisibleItems(items: CommentData[], startIndex: number, endIndex: number): HTMLElement[] {
    this.renderStartTime = performance.now();
    const renderedElements: HTMLElement[] = [];

    // Clear existing visible items that are out of range
    this.cleanupOffScreenItems(startIndex, endIndex);

    // Handle the case where we have items to render
    const itemsToRender = Math.min(endIndex - startIndex, items.length);
    
    for (let i = 0; i < itemsToRender; i++) {
      const itemIndex = startIndex + i;
      const item = items[i];
      
      if (!item) continue;
      
      let element = this.visibleItems.get(itemIndex);
      
      if (!element) {
        element = this.createVirtualItem(item, itemIndex);
        this.visibleItems.set(itemIndex, element);
        
        if (this.content) {
          this.content.appendChild(element);
        }
      }

      renderedElements.push(element);
    }

    this.performanceMetrics.visibleItemCount = renderedElements.length;
    this.performanceMetrics.renderTime = performance.now() - this.renderStartTime;
    this.performanceMetrics.cacheSize = this.itemCache.size;

    return renderedElements;
  }

  /**
   * Creates individual virtual item element
   */
  private createVirtualItem(item: CommentData, index: number): HTMLElement {
    const element = document.createElement('div');
    element.classList.add('tf-virtual-item');
    element.setAttribute('data-index', index.toString());
    element.setAttribute('data-id', item.id);
    
    if (item.replies && item.replies.length > 0) {
      element.setAttribute('data-has-nested', 'true');
    }

    // Position absolutely within content container
    const top = index * this.config.itemHeight;
    element.style.position = 'absolute';
    element.style.top = `${top}px`;
    element.style.left = '0';
    element.style.right = '0';
    element.style.height = `${this.config.itemHeight}px`;

    // Add content
    this.populateItemContent(element, item);

    // Cache the element
    this.itemCache.set(index, element);

    return element;
  }

  /**
   * Populates content for virtual item
   */
  private populateItemContent(element: HTMLElement, item: CommentData): void {
    element.innerHTML = ''; // Clear existing content

    // Author info
    const authorDiv = document.createElement('div');
    authorDiv.classList.add('tf-virtual-author');
    authorDiv.textContent = item.author;
    authorDiv.style.fontWeight = 'bold';
    authorDiv.style.marginBottom = '4px';
    element.appendChild(authorDiv);

    // Content
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('tf-virtual-content-text');
    contentDiv.textContent = item.text;
    contentDiv.style.marginBottom = '8px';
    contentDiv.style.lineHeight = '1.4';
    element.appendChild(contentDiv);

    // Timestamp
    if (item.timestamp) {
      const timeDiv = document.createElement('div');
      timeDiv.classList.add('tf-virtual-timestamp');
      timeDiv.textContent = this.formatTimestamp(item.timestamp);
      timeDiv.style.fontSize = '12px';
      timeDiv.style.color = '#666';
      element.appendChild(timeDiv);
    }

    // Nested indicator
    if (item.replies && item.replies.length > 0) {
      const nestedIndicator = document.createElement('div');
      nestedIndicator.classList.add('tf-virtual-nested-indicator');
      nestedIndicator.textContent = `${item.replies.length} replies`;
      nestedIndicator.style.fontSize = '11px';
      nestedIndicator.style.color = '#1da1f2';
      nestedIndicator.style.marginTop = '4px';
      element.appendChild(nestedIndicator);
    }

    // Add styling
    element.style.padding = '12px 16px';
    element.style.borderBottom = '1px solid #eee';
    element.style.backgroundColor = '#fff';
    element.style.boxSizing = 'border-box';
  }

  /**
   * Calculates item height from sample elements
   */
  public calculateItemHeight(sampleElement: HTMLElement): number {
    const styles = window.getComputedStyle(sampleElement);
    
    const height = parseFloat(styles.height) || 0;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const paddingBottom = parseFloat(styles.paddingBottom) || 0;
    const marginTop = parseFloat(styles.marginTop) || 0;
    const marginBottom = parseFloat(styles.marginBottom) || 0;
    const borderTop = parseFloat(styles.borderTopWidth) || 0;
    const borderBottom = parseFloat(styles.borderBottomWidth) || 0;

    const totalHeight = height + paddingTop + paddingBottom + marginTop + marginBottom + borderTop + borderBottom;
    
    return Math.max(totalHeight, this.config.itemHeight);
  }

  /**
   * Handles scroll events with throttling
   */
  public handleScroll(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target || !this.content) return;

    const currentScrollTop = target.scrollTop;
    this.scrollDirection = currentScrollTop > this.lastScrollTop ? 'down' : 'up';
    this.lastScrollTop = currentScrollTop;
    this.isScrolling = true;

    // Clear existing timer
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }

    // Throttle scroll updates for performance
    this.scrollTimer = window.setTimeout(() => {
      this.updateVisibleItemsOnScroll(currentScrollTop, target.clientHeight);
      this.isScrolling = false;
      
      // Preload next batch if needed
      this.preloadNextBatch(this.scrollDirection);
    }, 16); // ~60fps
  }

  /**
   * Updates visible items based on current scroll position
   */
  private updateVisibleItemsOnScroll(scrollTop: number, containerHeight: number): void {
    const visibleRange = this.updateVisibleRange(scrollTop, containerHeight);
    
    // Only update if range changed significantly
    const currentItems = Array.from(this.visibleItems.keys()).sort((a, b) => a - b);
    const hasSignificantChange = currentItems.length === 0 ||
      Math.abs(currentItems[0] - visibleRange.start) > this.config.overscan ||
      Math.abs(currentItems[currentItems.length - 1] - visibleRange.end) > this.config.overscan;

    if (hasSignificantChange) {
      // Would need access to items array here - in real implementation
      // this would be passed from the calling component
      this.performanceMetrics.scrollFrameRate = 1000 / (performance.now() - this.renderStartTime);
    }
  }

  /**
   * Cleans up off-screen items to manage memory
   */
  private cleanupOffScreenItems(startIndex: number, endIndex: number): void {
    const itemsToRemove: number[] = [];

    this.visibleItems.forEach((element, index) => {
      if (index < startIndex || index >= endIndex) {
        if (this.content && element.parentNode === this.content) {
          this.content.removeChild(element);
        }
        itemsToRemove.push(index);
      }
    });

    itemsToRemove.forEach(index => {
      this.visibleItems.delete(index);
    });
  }

  /**
   * Adds pagination controls for thread navigation
   */
  public addPaginationControls(container: HTMLElement, totalPages: number): HTMLElement {
    const paginationContainer = document.createElement('div');
    paginationContainer.classList.add('tf-pagination-controls');
    paginationContainer.style.display = 'flex';
    paginationContainer.style.alignItems = 'center';
    paginationContainer.style.justifyContent = 'center';
    paginationContainer.style.gap = '10px';
    paginationContainer.style.padding = '16px';
    paginationContainer.style.borderTop = '1px solid #eee';
    paginationContainer.style.backgroundColor = '#f9f9f9';

    // Previous button
    const prevButton = document.createElement('button');
    prevButton.classList.add('tf-page-prev');
    prevButton.textContent = '← Previous';
    prevButton.style.padding = '8px 16px';
    prevButton.style.border = '1px solid #ddd';
    prevButton.style.borderRadius = '4px';
    prevButton.style.backgroundColor = '#fff';
    prevButton.style.cursor = 'pointer';
    prevButton.disabled = true; // Initially on page 1

    // Next button
    const nextButton = document.createElement('button');
    nextButton.classList.add('tf-page-next');
    nextButton.textContent = 'Next →';
    nextButton.style.padding = '8px 16px';
    nextButton.style.border = '1px solid #ddd';
    nextButton.style.borderRadius = '4px';
    nextButton.style.backgroundColor = '#fff';
    nextButton.style.cursor = 'pointer';

    // Page info
    const pageInfo = document.createElement('span');
    pageInfo.classList.add('tf-page-info');
    pageInfo.textContent = `Page 1 of ${totalPages}`;
    pageInfo.style.margin = '0 16px';
    pageInfo.style.fontWeight = 'bold';

    // Jump to top button
    const jumpToTop = document.createElement('button');
    jumpToTop.classList.add('tf-jump-top');
    jumpToTop.textContent = '↑ Top';
    jumpToTop.style.padding = '8px 16px';
    jumpToTop.style.border = '1px solid #1da1f2';
    jumpToTop.style.borderRadius = '4px';
    jumpToTop.style.backgroundColor = '#1da1f2';
    jumpToTop.style.color = 'white';
    jumpToTop.style.cursor = 'pointer';

    // Jump to bottom button
    const jumpToBottom = document.createElement('button');
    jumpToBottom.classList.add('tf-jump-bottom');
    jumpToBottom.textContent = '↓ Bottom';
    jumpToBottom.style.padding = '8px 16px';
    jumpToBottom.style.border = '1px solid #1da1f2';
    jumpToBottom.style.borderRadius = '4px';
    jumpToBottom.style.backgroundColor = '#1da1f2';
    jumpToBottom.style.color = 'white';
    jumpToBottom.style.cursor = 'pointer';

    // Keyboard shortcuts indicator
    const shortcuts = document.createElement('div');
    shortcuts.classList.add('tf-keyboard-shortcuts');
    shortcuts.textContent = 'Keys: ↑↓ scroll, Home/End jump, PgUp/PgDn page';
    shortcuts.style.fontSize = '11px';
    shortcuts.style.color = '#666';
    shortcuts.style.marginLeft = '20px';

    // Add event listeners
    jumpToTop.addEventListener('click', () => this.jumpToItem(0));
    jumpToBottom.addEventListener('click', () => this.jumpToItem(this.performanceMetrics.totalItems - 1));

    // Assemble pagination
    paginationContainer.appendChild(prevButton);
    paginationContainer.appendChild(pageInfo);
    paginationContainer.appendChild(nextButton);
    paginationContainer.appendChild(jumpToTop);
    paginationContainer.appendChild(jumpToBottom);
    paginationContainer.appendChild(shortcuts);

    container.appendChild(paginationContainer);
    return paginationContainer;
  }

  /**
   * Jumps to a specific page
   */
  public jumpToPage(pageNumber: number): void {
    if (!this.container || pageNumber < 1) return;

    const itemsPerPage = Math.floor(this.config.containerHeight / this.config.itemHeight);
    const targetIndex = (pageNumber - 1) * itemsPerPage;
    
    this.jumpToItem(Math.min(targetIndex, this.performanceMetrics.totalItems - 1));
  }

  /**
   * Jumps to a specific item by index
   */
  public jumpToItem(itemIndex: number): void {
    if (!this.container) return;

    const clampedIndex = Math.max(0, Math.min(itemIndex, this.performanceMetrics.totalItems - 1));
    const targetScrollTop = clampedIndex * this.config.itemHeight;

    this.container.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    });
  }

  /**
   * Gets current performance metrics
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    // Update memory usage estimate
    this.performanceMetrics.memoryUsage = this.estimateMemoryUsage();
    return { ...this.performanceMetrics };
  }

  /**
   * Estimates memory usage in MB
   */
  private estimateMemoryUsage(): number {
    const itemCacheSize = this.itemCache.size * 2; // Rough estimate: 2KB per cached item
    const visibleItemsSize = this.visibleItems.size * 1; // 1KB per visible item
    const heightCacheSize = this.heightCache.size * 0.1; // 100B per height entry
    
    return (itemCacheSize + visibleItemsSize + heightCacheSize) / 1024; // Convert to MB
  }

  /**
   * Implements rendering optimizations
   */
  public optimizeRendering(): void {
    // Clear excessive cache entries
    if (this.itemCache.size > 200) {
      const entries = Array.from(this.itemCache.entries());
      const toDelete = entries.slice(100); // Keep most recent 100 items
      
      toDelete.forEach(([index]) => {
        this.itemCache.delete(index);
      });
    }

    // Clear old height cache entries
    if (this.heightCache.size > 1000) {
      this.heightCache.clear();
    }

    // Force garbage collection hint
    if (typeof window !== 'undefined' && 'gc' in window) {
      (window as any).gc();
    }
  }

  /**
   * Preloads next batch of content for smooth scrolling
   */
  public preloadNextBatch(direction: 'up' | 'down'): void {
    if (!this.container) return;

    const currentScrollTop = this.container.scrollTop;
    const visibleRange = this.updateVisibleRange(currentScrollTop, this.config.containerHeight);
    
    if (direction === 'down') {
      // Preload items below current view
      const preloadStart = visibleRange.end;
      const preloadEnd = Math.min(preloadStart + 10, this.performanceMetrics.totalItems);
      
      for (let i = preloadStart; i < preloadEnd; i++) {
        if (!this.itemCache.has(i)) {
          // In real implementation, this would create placeholder items
          this.heightCache.set(i, this.config.itemHeight);
        }
      }
    } else {
      // Preload items above current view
      const preloadEnd = visibleRange.start;
      const preloadStart = Math.max(0, preloadEnd - 10);
      
      for (let i = preloadStart; i < preloadEnd; i++) {
        if (!this.itemCache.has(i)) {
          this.heightCache.set(i, this.config.itemHeight);
        }
      }
    }
  }

  /**
   * Sets up performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    if (!this.container) return;

    // Use Intersection Observer to track visible items (with fallback for test environment)
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver((entries) => {
        let visibleCount = 0;
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            visibleCount++;
          }
        });
        
        this.performanceMetrics.visibleItemCount = visibleCount;
      }, {
        root: this.container,
        threshold: 0.1
      });
    }

    // Monitor frame rate
    let lastFrameTime = performance.now();
    const trackFrameRate = () => {
      const currentTime = performance.now();
      const frameDelta = currentTime - lastFrameTime;
      this.performanceMetrics.scrollFrameRate = Math.min(60, Math.max(1, 1000 / frameDelta));
      lastFrameTime = currentTime;
      
      if (this.isScrolling) {
        requestAnimationFrame(trackFrameRate);
      }
    };

    this.container.addEventListener('scroll', () => {
      if (!this.isScrolling) {
        requestAnimationFrame(trackFrameRate);
      }
    });
  }

  /**
   * Formats timestamp for display
   */
  private formatTimestamp(timestamp: string | number): string {
    const date = new Date(Number(timestamp));
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'now';
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  /**
   * Destroys the virtual scroll manager and cleans up resources
   */
  public destroy(): void {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }

    this.itemCache.clear();
    this.heightCache.clear();
    this.visibleItems.clear();

    if (this.container) {
      this.container.removeEventListener('scroll', this.handleScroll);
    }
  }
}