/**
 * Unit tests for Thread Data Renderer - Task 17
 * Tests API data rendering, hierarchical reply nesting, collapsible sections,
 * and loading indicators for API request states
 */

import { ThreadRenderer } from '../rendering/threadRenderer';
import { CommentData } from '../types';

describe('Thread Data Renderer - Task 17', () => {
  let renderer: ThreadRenderer;

  beforeEach(() => {
    renderer = new ThreadRenderer();
  });

  describe('API Data Thread Rendering', () => {
    test('should render thread with API ThreadData structure', () => {
      const threadData: CommentData = {
        id: 'thread_123',
        author: 'test_user',
        text: 'Main thread content',
        timestamp: '2023-12-01T10:00:00Z',
        likes: 42,
        reposts: 15,
        replies: [
          {
            id: 'reply_1',
            author: 'reply_user_1',
            text: 'First reply',
            timestamp: '2023-12-01T10:05:00Z',
            likes: 8,
            replies: []
          }
        ],
        verified: true,
        avatar: 'https://example.com/avatar.jpg'
      };

      const expansionElement = renderer.createExpansionElement([threadData], 'test_comment_1');

      expect(expansionElement).toBeTruthy();
      expect(expansionElement.classList.contains('threadforge-inline-expansion')).toBe(true);
      
      // Should contain thread content
      expect(expansionElement.textContent).toContain('Main thread content');
      expect(expansionElement.textContent).toContain('test_user');
      expect(expansionElement.textContent).toContain('First reply');
    });

    test('should handle ReplyData with proper type structure', () => {
      const replyData: CommentData = {
        id: 'reply_456',
        author: 'reply_author',
        text: 'Reply content with @mentions and #hashtags',
        timestamp: '2023-12-01T11:00:00Z',
        likes: 5,
        parentId: 'thread_123',
        replies: []
      };

      const replyElement = renderer.renderSingleReply(replyData, 0);

      expect(replyElement).toBeTruthy();
      expect(replyElement.classList.contains('threadforge-reply')).toBe(true);
      expect(replyElement.textContent).toContain('reply_author');
      expect(replyElement.textContent).toContain('Reply content');
    });

    test('should render engagement metrics from API data', () => {
      const threadWithMetrics: CommentData = {
        id: 'metrics_thread',
        author: 'metrics_user',
        text: 'Thread with engagement data',
        likes: 1250,
        reposts: 340,
        replies: [],
        timestamp: '2023-12-01T12:00:00Z'
      };

      const element = renderer.renderSingleReply(threadWithMetrics, 0);
      
      // Should display metrics
      const metricsElement = element.querySelector('.threadforge-engagement-metrics');
      expect(metricsElement).toBeTruthy();
      expect(metricsElement?.textContent).toContain('1250'); // likes
      expect(metricsElement?.textContent).toContain('340'); // reposts
    });

    test('should handle missing optional API data fields gracefully', () => {
      const minimalThread: CommentData = {
        id: 'minimal_thread',
        author: 'minimal_user',
        text: 'Minimal thread data',
        replies: []
      };

      const element = renderer.createExpansionElement([minimalThread], 'minimal_test');

      expect(element).toBeTruthy();
      expect(element.textContent).toContain('minimal_user');
      expect(element.textContent).toContain('Minimal thread data');
      
      // Should handle missing timestamp gracefully
      expect(element.querySelector('.threadforge-reply-time')?.textContent).toBeDefined();
    });
  });

  describe('Hierarchical Reply Rendering', () => {
    test('should render nested replies with proper hierarchy', () => {
      const nestedThread: CommentData = {
        id: 'nested_thread',
        author: 'root_user',
        text: 'Root thread',
        replies: [
          {
            id: 'level_1_reply',
            author: 'level_1_user',
            text: 'Level 1 reply',
            replies: [
              {
                id: 'level_2_reply',
                author: 'level_2_user',
                text: 'Level 2 reply',
                replies: [
                  {
                    id: 'level_3_reply',
                    author: 'level_3_user',
                    text: 'Level 3 reply',
                    replies: []
                  }
                ]
              }
            ]
          }
        ]
      };

      const element = renderer.createExpansionElement([nestedThread], 'nested_test');

      // Should have nested structure
      const level1Replies = element.querySelectorAll('.threadforge-reply[data-level="1"]');
      const level2Replies = element.querySelectorAll('.threadforge-reply[data-level="2"]');
      const level3Replies = element.querySelectorAll('.threadforge-reply[data-level="3"]');

      expect(level1Replies.length).toBe(1);
      expect(level2Replies.length).toBe(1);
      expect(level3Replies.length).toBe(1);

      // Should have proper indentation
      const level3Reply = level3Replies[0] as HTMLElement;
      expect(level3Reply.style.marginLeft).toBe('60px'); // 3 levels * 20px
    });

    test('should limit nesting depth to prevent excessive indentation', () => {
      // Create deeply nested structure
      let deepThread: CommentData = {
        id: 'deep_root',
        author: 'root',
        text: 'Root',
        replies: []
      };

      // Build 10 levels deep
      let currentReply = deepThread;
      for (let i = 1; i <= 10; i++) {
        const newReply: CommentData = {
          id: `deep_level_${i}`,
          author: `user_${i}`,
          text: `Level ${i} reply`,
          replies: []
        };
        currentReply.replies = [newReply];
        currentReply = newReply;
      }

      const element = renderer.createExpansionElement([deepThread], 'deep_test');

      // Should cap nesting at maxDepth (typically 5)
      const maxLevelReplies = element.querySelectorAll('.threadforge-reply[data-level="5"]');
      const beyondMaxReplies = element.querySelectorAll('.threadforge-reply[data-level="6"]');

      expect(maxLevelReplies.length).toBeGreaterThan(0);
      expect(beyondMaxReplies.length).toBe(0); // Should be flattened
    });

    test('should group deeply nested replies with "Show More" functionality', () => {
      const threadWithManyReplies: CommentData = {
        id: 'many_replies',
        author: 'popular_user',
        text: 'Popular thread',
        replies: Array.from({ length: 25 }, (_, i) => ({
          id: `reply_${i}`,
          author: `user_${i}`,
          text: `Reply ${i}`,
          replies: []
        }))
      };

      const element = renderer.createExpansionElement([threadWithManyReplies], 'many_test');

      // Should initially show limited number
      const visibleReplies = element.querySelectorAll('.threadforge-reply:not(.threadforge-hidden)');
      expect(visibleReplies.length).toBeLessThanOrEqual(10); // Initial batch

      // Should have "Show More" button
      const showMoreBtn = element.querySelector('.threadforge-show-more-btn');
      expect(showMoreBtn).toBeTruthy();
      expect(showMoreBtn?.textContent).toContain('Show More');
    });

    test('should maintain parent-child relationships in DOM structure', () => {
      const parentChildThread: CommentData = {
        id: 'parent_thread',
        author: 'parent_user',
        text: 'Parent thread',
        replies: [
          {
            id: 'child_1',
            author: 'child_user_1',
            text: 'Child 1',
            parentId: 'parent_thread',
            replies: []
          },
          {
            id: 'child_2',
            author: 'child_user_2',
            text: 'Child 2',
            parentId: 'parent_thread',
            replies: []
          }
        ]
      };

      const element = renderer.createExpansionElement([parentChildThread], 'parent_child_test');

      const childReplies = element.querySelectorAll('.threadforge-reply[data-parent-id="parent_thread"]');
      expect(childReplies.length).toBe(2);

      // Each child should reference its parent
      childReplies.forEach(child => {
        expect(child.getAttribute('data-parent-id')).toBe('parent_thread');
      });
    });
  });

  describe('Collapsible Sections for Nested Threads', () => {
    test('should create collapsible sections for deeply nested threads', () => {
      const deepNestedThread: CommentData = {
        id: 'collapsible_root',
        author: 'root_user',
        text: 'Root with deep nesting',
        replies: [
          {
            id: 'branch_1',
            author: 'branch_user',
            text: 'Branch with many nested replies',
            replies: Array.from({ length: 8 }, (_, i) => ({
              id: `nested_${i}`,
              author: `nested_user_${i}`,
              text: `Nested reply ${i}`,
              replies: []
            }))
          }
        ]
      };

      const element = renderer.createExpansionElement([deepNestedThread], 'collapsible_test');

      // Should have collapsible section for branch with many replies
      const collapsibleSection = element.querySelector('.threadforge-collapsible-section');
      expect(collapsibleSection).toBeTruthy();

      // Should have toggle button
      const toggleBtn = collapsibleSection?.querySelector('.threadforge-toggle-btn');
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn?.textContent).toContain('replies');
    });

    test('should toggle visibility of nested sections on click', () => {
      const collapsibleThread: CommentData = {
        id: 'toggle_root',
        author: 'toggle_user',
        text: 'Thread with collapsible section',
        replies: Array.from({ length: 12 }, (_, i) => ({
          id: `toggle_reply_${i}`,
          author: `user_${i}`,
          text: `Reply ${i}`,
          replies: []
        }))
      };

      const element = renderer.createExpansionElement([collapsibleThread], 'toggle_test');
      const toggleBtn = element.querySelector('.threadforge-toggle-btn') as HTMLButtonElement;
      
      expect(toggleBtn).toBeTruthy();

      // Initially collapsed
      const collapsibleContent = element.querySelector('.threadforge-collapsible-content');
      expect(collapsibleContent?.classList.contains('threadforge-collapsed')).toBe(true);

      // Click to expand
      toggleBtn.click();
      expect(collapsibleContent?.classList.contains('threadforge-collapsed')).toBe(false);
      expect(toggleBtn.textContent).toContain('Collapse');

      // Click to collapse again
      toggleBtn.click();
      expect(collapsibleContent?.classList.contains('threadforge-collapsed')).toBe(true);
      expect(toggleBtn.textContent).toContain('replies');
    });

    test('should show reply count in collapsible section headers', () => {
      const threadWithCounts: CommentData = {
        id: 'count_thread',
        author: 'count_user',
        text: 'Thread for counting',
        replies: [
          {
            id: 'section_with_replies',
            author: 'section_user',
            text: 'Section with replies',
            replies: Array.from({ length: 15 }, (_, i) => ({
              id: `count_reply_${i}`,
              author: `count_user_${i}`,
              text: `Counted reply ${i}`,
              replies: []
            }))
          }
        ]
      };

      const element = renderer.createExpansionElement([threadWithCounts], 'count_test');
      const toggleBtn = element.querySelector('.threadforge-toggle-btn');
      
      expect(toggleBtn?.textContent).toContain('15 replies');
    });

    test('should handle expand/collapse state persistence', () => {
      const persistentThread: CommentData = {
        id: 'persistent_thread',
        author: 'persistent_user',
        text: 'Thread with persistent state',
        replies: Array.from({ length: 10 }, (_, i) => ({
          id: `persistent_reply_${i}`,
          author: `user_${i}`,
          text: `Reply ${i}`,
          replies: []
        }))
      };

      const element = renderer.createExpansionElement([persistentThread], 'persistent_test');
      const toggleBtn = element.querySelector('.threadforge-toggle-btn') as HTMLButtonElement;

      // Expand section
      toggleBtn.click();

      // Should remember state in session
      expect(renderer.getCollapsedSections().has('persistent_thread')).toBe(false);

      // Collapse section
      toggleBtn.click();
      expect(renderer.getCollapsedSections().has('persistent_thread')).toBe(true);
    });
  });

  describe('Loading Indicators for API Request States', () => {
    test('should show loading indicators during API requests', () => {
      const loadingContainer = document.createElement('div');
      
      renderer.showLoadingIndicator(loadingContainer, {
        type: 'thread',
        message: 'Loading thread...',
        progress: 0
      });

      const loadingIndicator = loadingContainer.querySelector('.threadforge-loading-indicator');
      expect(loadingIndicator).toBeTruthy();
      expect(loadingIndicator?.textContent).toContain('Loading thread...');

      // Should have spinner
      const spinner = loadingIndicator?.querySelector('.threadforge-spinner');
      expect(spinner).toBeTruthy();
    });

    test('should update loading progress for incremental loading', () => {
      const progressContainer = document.createElement('div');
      
      // Initial loading state
      renderer.showLoadingIndicator(progressContainer, {
        type: 'replies',
        message: 'Loading replies...',
        progress: 25
      });

      let progressBar = progressContainer.querySelector('.threadforge-progress-bar');
      expect(progressBar?.getAttribute('data-progress')).toBe('25');

      // Update progress
      renderer.updateLoadingProgress(progressContainer, 75);
      progressBar = progressContainer.querySelector('.threadforge-progress-bar');
      expect(progressBar?.getAttribute('data-progress')).toBe('75');
    });

    test('should show different loading states for different API operations', () => {
      const container = document.createElement('div');

      const loadingStates = [
        { type: 'thread', expectedClass: 'loading-thread' },
        { type: 'replies', expectedClass: 'loading-replies' },
        { type: 'user_profile', expectedClass: 'loading-profile' },
        { type: 'engagement', expectedClass: 'loading-engagement' }
      ];

      loadingStates.forEach(({ type, expectedClass }) => {
        container.innerHTML = '';
        renderer.showLoadingIndicator(container, { type, message: `Loading ${type}...` });
        
        const indicator = container.querySelector('.threadforge-loading-indicator');
        expect(indicator?.classList.contains(expectedClass)).toBe(true);
      });
    });

    test('should remove loading indicators on completion', () => {
      const container = document.createElement('div');
      
      renderer.showLoadingIndicator(container, {
        type: 'thread',
        message: 'Loading...'
      });

      expect(container.querySelector('.threadforge-loading-indicator')).toBeTruthy();

      renderer.hideLoadingIndicator(container);
      expect(container.querySelector('.threadforge-loading-indicator')).toBeFalsy();
    });

    test('should show error states when API requests fail', () => {
      const errorContainer = document.createElement('div');
      
      renderer.showErrorIndicator(errorContainer, {
        type: 'api_error',
        message: 'Failed to load thread data',
        retryable: true
      });

      const errorIndicator = errorContainer.querySelector('.threadforge-error-indicator');
      expect(errorIndicator).toBeTruthy();
      expect(errorIndicator?.textContent).toContain('Failed to load');

      // Should have retry button for retryable errors
      const retryBtn = errorIndicator?.querySelector('.threadforge-retry-btn');
      expect(retryBtn).toBeTruthy();
    });

    test('should handle timeout states for slow API requests', () => {
      const timeoutContainer = document.createElement('div');
      
      renderer.showTimeoutIndicator(timeoutContainer, {
        duration: 10000,
        onRetry: jest.fn(),
        onCancel: jest.fn()
      });

      const timeoutIndicator = timeoutContainer.querySelector('.threadforge-timeout-indicator');
      expect(timeoutIndicator).toBeTruthy();
      expect(timeoutIndicator?.textContent).toContain('Taking longer than expected');

      // Should have retry and cancel options
      const retryBtn = timeoutIndicator?.querySelector('.threadforge-retry-btn');
      const cancelBtn = timeoutIndicator?.querySelector('.threadforge-cancel-btn');
      expect(retryBtn).toBeTruthy();
      expect(cancelBtn).toBeTruthy();
    });
  });

  describe('Enhanced Thread Rendering Features', () => {
    test('should render user verification badges from API data', () => {
      const verifiedUser: CommentData = {
        id: 'verified_thread',
        author: 'verified_user',
        text: 'Verified user content',
        verified: true,
        replies: []
      };

      const element = renderer.renderSingleReply(verifiedUser, 0);
      const verificationBadge = element.querySelector('.threadforge-verification-badge');
      
      expect(verificationBadge).toBeTruthy();
      expect(verificationBadge?.classList.contains('verified')).toBe(true);
    });

    test('should format timestamps with relative time display', () => {
      const recentThread: CommentData = {
        id: 'recent_thread',
        author: 'recent_user',
        text: 'Recent content',
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        replies: []
      };

      const element = renderer.renderSingleReply(recentThread, 0);
      const timeElement = element.querySelector('.threadforge-reply-time');
      
      expect(timeElement?.textContent).toContain('1h ago');
    });

    test('should handle media attachments in thread content', () => {
      const mediaThread: CommentData = {
        id: 'media_thread',
        author: 'media_user',
        text: 'Thread with media',
        media: {
          images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
          videos: []
        },
        replies: []
      };

      const element = renderer.renderSingleReply(mediaThread, 0);
      const mediaContainer = element.querySelector('.threadforge-media-container');
      
      expect(mediaContainer).toBeTruthy();
      
      const images = mediaContainer?.querySelectorAll('img');
      expect(images?.length).toBe(2);
    });
  });
});