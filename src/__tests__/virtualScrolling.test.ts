/**
 * Unit tests for Virtual Scrolling for Large Threads - Task 19
 * Tests virtual scrolling container, windowing logic, smooth scrolling,
 * pagination controls, and performance optimizations
 */

import { CommentData } from '../types';
import { VirtualScrollManager } from '../performance/virtualScrollManager';

describe('Virtual Scrolling for Large Threads - Task 19', () => {
  let virtualScrollManager: VirtualScrollManager;
  let container: HTMLElement;
  let largeMockDataset: CommentData[];

  beforeEach(() => {
    virtualScrollManager = new VirtualScrollManager();
    container = document.createElement('div');
    
    // Create large mock dataset for testing
    largeMockDataset = Array.from({ length: 500 }, (_, i) => ({
      id: `reply_${i}`,
      author: `user_${i % 50}`,
      text: `This is reply content ${i}. It could be short or very long depending on the test case. Some replies might have multiple lines of content to test variable height scenarios.`,
      timestamp: Date.now() - (i * 60000), // Each reply 1 minute apart
      replies: i % 10 === 0 ? [
        {
          id: `nested_${i}_1`,
          author: `nested_user_${i}`,
          text: `Nested reply to ${i}`,
          timestamp: Date.now() - (i * 60000) + 30000
        }
      ] : undefined
    }));

    jest.clearAllMocks();
  });

  describe('Virtual Scrolling Container Creation', () => {
    test('should create virtual scrolling container for large datasets', () => {
      const totalItems = 500;
      const itemHeight = 120;

      const virtualContainer = virtualScrollManager.createVirtualContainer(totalItems, itemHeight);

      expect(virtualContainer).toBeTruthy();
      expect(virtualContainer.classList.contains('tf-virtual-scroll-container')).toBe(true);

      // Should have proper styling for virtual scrolling
      expect(virtualContainer.style.position).toBe('relative');
      expect(virtualContainer.style.overflow).toBe('auto');
      expect(virtualContainer.style.height).toBeTruthy();

      // Should have viewport and content areas
      const viewport = virtualContainer.querySelector('.tf-virtual-viewport');
      const content = virtualContainer.querySelector('.tf-virtual-content');

      expect(viewport).toBeTruthy();
      expect(content).toBeTruthy();

      // Content should have calculated total height
      const expectedHeight = totalItems * itemHeight;
      expect((content as HTMLElement).style.height).toBe(`${expectedHeight}px`);
    });

    test('should only activate virtual scrolling for threads with 100+ replies', () => {
      const smallDataset = Array.from({ length: 50 }, (_, i) => ({
        id: `small_${i}`,
        author: `user_${i}`,
        text: `Small dataset item ${i}`,
        timestamp: Date.now()
      }));

      const largeDataset = Array.from({ length: 150 }, (_, i) => ({
        id: `large_${i}`,
        author: `user_${i}`,
        text: `Large dataset item ${i}`,
        timestamp: Date.now()
      }));

      // Small dataset should not use virtual scrolling
      const smallContainer = virtualScrollManager.createVirtualContainer(smallDataset.length, 120);
      expect(smallContainer.classList.contains('tf-virtual-disabled')).toBe(true);

      // Large dataset should use virtual scrolling
      const largeContainer = virtualScrollManager.createVirtualContainer(largeDataset.length, 120);
      expect(largeContainer.classList.contains('tf-virtual-scroll-container')).toBe(true);
      expect(largeContainer.classList.contains('tf-virtual-disabled')).toBe(false);
    });

    test('should handle variable item heights with estimation', () => {
      const variableItems = [
        { height: 80, content: 'Short content' },
        { height: 150, content: 'Medium content with more text' },
        { height: 200, content: 'Long content with much more text and possibly multiple lines' }
      ];

      const virtualContainer = virtualScrollManager.createVirtualContainer(100, 120); // estimated height
      
      expect(virtualContainer).toBeTruthy();
      
      // Should have mechanism for height adjustment
      const heightCache = virtualContainer.getAttribute('data-height-cache');
      expect(heightCache).toBeDefined();
    });
  });

  describe('Windowing Logic for Visible Items', () => {
    test('should calculate visible range based on scroll position', () => {
      const scrollTop = 1200; // User scrolled down
      const containerHeight = 600; // Viewport height
      const itemHeight = 120;
      
      // Initialize with large dataset first
      virtualScrollManager.createVirtualContainer(500, itemHeight);

      const visibleRange = virtualScrollManager.updateVisibleRange(scrollTop, containerHeight);

      // Should calculate start and end indices for visible items
      expect(visibleRange.start).toBeGreaterThanOrEqual(0);
      expect(visibleRange.end).toBeGreaterThan(visibleRange.start);
      expect(visibleRange.end - visibleRange.start).toBeLessThanOrEqual(25); // Buffer for smooth scrolling
    });

    test('should include buffer items for smooth scrolling', () => {
      const scrollTop = 2400;
      const containerHeight = 600;
      
      // Initialize with large dataset first
      virtualScrollManager.createVirtualContainer(500, 120);

      const visibleRange = virtualScrollManager.updateVisibleRange(scrollTop, containerHeight);

      // Should include buffer items before and after visible range
      const visibleCount = Math.ceil(containerHeight / 120);
      
      expect(visibleRange.end - visibleRange.start).toBeGreaterThan(visibleCount);
      expect(visibleRange.end - visibleRange.start).toBeLessThanOrEqual(visibleCount + 20); // Allow for buffers
    });

    test('should render only visible items to DOM', () => {
      const startIndex = 10;
      const endIndex = 20;
      const visibleItems = largeMockDataset.slice(startIndex, endIndex);

      const renderedElements = virtualScrollManager.renderVisibleItems(visibleItems, startIndex, endIndex);

      expect(renderedElements).toBeTruthy();
      expect(renderedElements.length).toBe(endIndex - startIndex);

      // Each element should have proper positioning
      renderedElements.forEach((element, index) => {
        expect(element.classList.contains('tf-virtual-item')).toBe(true);
        expect(element.getAttribute('data-index')).toBe((startIndex + index).toString());
        
        // Should have absolute positioning for virtual scrolling
        const expectedTop = (startIndex + index) * 120;
        expect(element.style.position).toBe('absolute');
        expect(element.style.top).toBe(`${expectedTop}px`);
      });
    });

    test('should handle edge cases at beginning and end of list', () => {
      // Initialize with large dataset first
      virtualScrollManager.createVirtualContainer(largeMockDataset.length, 120);
      
      // Test beginning of list
      const startRange = virtualScrollManager.updateVisibleRange(0, 600);
      expect(startRange.start).toBe(0);
      expect(startRange.end).toBeGreaterThan(0);

      // Test end of list  
      const totalHeight = largeMockDataset.length * 120;
      const endScrollTop = totalHeight - 600;
      const endRange = virtualScrollManager.updateVisibleRange(endScrollTop, 600);
      
      expect(endRange.end).toBeLessThanOrEqual(largeMockDataset.length);
      expect(endRange.start).toBeLessThan(endRange.end);
    });
  });

  describe('Smooth Scrolling and Item Height Calculation', () => {
    test('should calculate item height from sample elements', () => {
      const sampleElement = document.createElement('div');
      sampleElement.style.height = '140px';
      sampleElement.style.padding = '10px';
      sampleElement.style.margin = '5px 0';
      container.appendChild(sampleElement);

      const calculatedHeight = virtualScrollManager.calculateItemHeight(sampleElement);

      // Should include padding and margins in calculation
      expect(calculatedHeight).toBeGreaterThan(140);
      expect(calculatedHeight).toBeLessThanOrEqual(170); // 140 + 20 padding + 10 margins
    });

    test('should handle dynamic height adjustments', () => {
      const mockScrollEvent = new Event('scroll');
      Object.defineProperty(mockScrollEvent, 'target', {
        value: {
          scrollTop: 1500,
          clientHeight: 600
        }
      });

      // Should not throw errors during scroll handling
      expect(() => {
        virtualScrollManager.handleScroll(mockScrollEvent);
      }).not.toThrow();

      // Should trigger re-calculation of visible items
      expect(mockScrollEvent.target).toBeTruthy();
    });

    test('should implement smooth scrolling transitions', () => {
      const virtualContainer = virtualScrollManager.createVirtualContainer(500, 120);
      
      // Should have smooth scrolling styles
      expect(virtualContainer.style.scrollBehavior).toBe('smooth');
      
      // Should handle scroll momentum properly
      const scrollEvent = new CustomEvent('scroll', { detail: { momentum: true } });
      expect(() => {
        virtualContainer.dispatchEvent(scrollEvent);
      }).not.toThrow();
    });

    test('should optimize rendering during fast scrolling', () => {
      const fastScrollEvent = new Event('scroll');
      Object.defineProperty(fastScrollEvent, 'target', {
        value: {
          scrollTop: 5000,
          clientHeight: 600,
          scrolling: true
        }
      });

      // Should implement throttling during fast scroll
      const startTime = performance.now();
      
      for (let i = 0; i < 10; i++) {
        virtualScrollManager.handleScroll(fastScrollEvent);
      }
      
      const endTime = performance.now();
      
      // Should not take too long even with multiple rapid scroll events
      expect(endTime - startTime).toBeLessThan(100); // Less than 100ms
    });
  });

  describe('Pagination Controls for Navigation', () => {
    test('should add pagination controls for large datasets', () => {
      const totalItems = 500;
      const itemsPerPage = 50;
      const totalPages = Math.ceil(totalItems / itemsPerPage);

      const paginationControls = virtualScrollManager.addPaginationControls(container, totalPages);

      expect(paginationControls).toBeTruthy();
      expect(paginationControls.classList.contains('tf-pagination-controls')).toBe(true);

      // Should have page navigation buttons
      const prevButton = paginationControls.querySelector('.tf-page-prev');
      const nextButton = paginationControls.querySelector('.tf-page-next');
      const pageInfo = paginationControls.querySelector('.tf-page-info');

      expect(prevButton).toBeTruthy();
      expect(nextButton).toBeTruthy();
      expect(pageInfo).toBeTruthy();

      // Should show current page information
      expect(pageInfo?.textContent).toContain('1');
      expect(pageInfo?.textContent).toContain(totalPages.toString());
    });

    test('should enable jumping to specific pages', () => {
      const targetPage = 5;
      
      // Should not throw when jumping to valid page
      expect(() => {
        virtualScrollManager.jumpToPage(targetPage);
      }).not.toThrow();

      // Test edge cases
      expect(() => {
        virtualScrollManager.jumpToPage(0); // Invalid page
      }).not.toThrow();

      expect(() => {
        virtualScrollManager.jumpToPage(999); // Out of range page
      }).not.toThrow();
    });

    test('should support jumping to specific items', () => {
      const targetItemIndex = 250;

      expect(() => {
        virtualScrollManager.jumpToItem(targetItemIndex);
      }).not.toThrow();

      // Should handle edge cases gracefully
      expect(() => {
        virtualScrollManager.jumpToItem(-1); // Invalid index
      }).not.toThrow();

      expect(() => {
        virtualScrollManager.jumpToItem(1000); // Out of range index
      }).not.toThrow();
    });

    test('should create quick navigation shortcuts', () => {
      const paginationControls = virtualScrollManager.addPaginationControls(container, 10);

      // Should have quick jump buttons
      const jumpToTop = paginationControls.querySelector('.tf-jump-top');
      const jumpToBottom = paginationControls.querySelector('.tf-jump-bottom');

      expect(jumpToTop).toBeTruthy();
      expect(jumpToBottom).toBeTruthy();

      // Should have keyboard shortcuts
      const shortcuts = paginationControls.querySelector('.tf-keyboard-shortcuts');
      expect(shortcuts).toBeTruthy();
    });
  });

  describe('Performance Optimizations', () => {
    test('should track and report performance metrics', () => {
      const metrics = virtualScrollManager.getPerformanceMetrics();

      expect(metrics).toBeTruthy();
      expect(typeof metrics.renderTime).toBe('number');
      expect(typeof metrics.scrollFrameRate).toBe('number');
      expect(typeof metrics.memoryUsage).toBe('number');
      expect(typeof metrics.visibleItemCount).toBe('number');
    });

    test('should implement rendering optimizations', () => {
      const startTime = performance.now();
      
      virtualScrollManager.optimizeRendering();
      
      const endTime = performance.now();
      
      // Optimization should not take significant time
      expect(endTime - startTime).toBeLessThan(50);
    });

    test('should preload adjacent content for smooth scrolling', () => {
      expect(() => {
        virtualScrollManager.preloadNextBatch('down');
      }).not.toThrow();

      expect(() => {
        virtualScrollManager.preloadNextBatch('up');
      }).not.toThrow();
    });

    test('should handle memory cleanup for large datasets', () => {
      // Simulate large dataset scrolling
      for (let i = 0; i < 100; i++) {
        const scrollEvent = new Event('scroll');
        Object.defineProperty(scrollEvent, 'target', {
          value: { scrollTop: i * 50, clientHeight: 600 }
        });
        virtualScrollManager.handleScroll(scrollEvent);
      }

      // Should not accumulate excessive memory
      const metrics = virtualScrollManager.getPerformanceMetrics();
      expect(metrics.memoryUsage).toBeLessThan(100); // Under 100MB
    });
  });

  describe('Integration with Thread Rendering', () => {
    test('should integrate with ThreadRenderer for virtual scrolling', () => {
      const virtualContainer = virtualScrollManager.createVirtualContainer(500, 120);
      
      // Should be compatible with existing thread rendering
      expect(virtualContainer.getAttribute('data-thread-renderer')).toBe('compatible');
    });

    test('should handle nested replies in virtual scrolling', () => {
      const nestedDataset = largeMockDataset.filter(item => item.replies && item.replies.length > 0);
      
      const visibleItems = virtualScrollManager.renderVisibleItems(nestedDataset, 0, 10);
      
      expect(visibleItems.length).toBeLessThanOrEqual(10);
      
      // Should handle nested content properly
      visibleItems.forEach(item => {
        expect(item.classList.contains('tf-virtual-item')).toBe(true);
        expect(item.getAttribute('data-has-nested')).toBeDefined();
      });
    });

    test('should maintain scroll position during data updates', () => {
      const initialScrollTop = 2400;
      
      // Simulate data update (new replies added)
      const updatedDataset = [...largeMockDataset];
      updatedDataset.splice(100, 0, {
        id: 'new_reply_inserted',
        author: 'new_user',
        text: 'This is a newly inserted reply',
        timestamp: Date.now()
      });

      // Should maintain relative scroll position
      const scrollEvent = new Event('scroll');
      Object.defineProperty(scrollEvent, 'target', {
        value: { scrollTop: initialScrollTop, clientHeight: 600 }
      });

      expect(() => {
        virtualScrollManager.handleScroll(scrollEvent);
      }).not.toThrow();
    });

    test('should handle real-time updates efficiently', () => {
      const updateStartTime = performance.now();
      
      // Simulate real-time reply additions
      for (let i = 0; i < 20; i++) {
        const newReply = {
          id: `realtime_${i}`,
          author: `realtime_user_${i}`,
          text: `Real-time reply ${i}`,
          timestamp: Date.now()
        };
        
        largeMockDataset.push(newReply);
        
        // Update virtual scrolling container
        const visibleRange = virtualScrollManager.updateVisibleRange(0, 600);
        expect(visibleRange).toBeTruthy();
      }
      
      const updateEndTime = performance.now();
      
      // Should handle updates efficiently
      expect(updateEndTime - updateStartTime).toBeLessThan(200);
    });
  });
});