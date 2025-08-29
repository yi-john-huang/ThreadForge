import { CommentData, ClickInterceptionResult, CommentExtractorOptions } from './types';

console.log('🧵 ThreadForge UI Improver loaded!');

class ThreadForgeUIImprover {
  private settings = {
    enableInlineExpansion: true,
    autoExpandReplies: false,
    maxReplyDepth: 3
  };

  private expandedComments = new Set<string>();
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    if (this.isInitialized) return;
    
    console.log('🚀 Initializing ThreadForge UI Improver...');
    
    // Load settings from storage
    await this.loadSettings();
    
    // Setup click interception
    this.setupClickInterception();
    
    // Setup mutation observer for dynamic content
    this.setupMutationObserver();
    
    // Add custom styles
    this.addCustomStyles();
    
    this.isInitialized = true;
    console.log('✅ ThreadForge UI Improver initialized successfully!');
  }

  private async loadSettings(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get('threadForgeSettings');
      if (result.threadForgeSettings) {
        this.settings = { ...this.settings, ...result.threadForgeSettings };
      }
    } catch (error) {
      console.warn('Failed to load settings, using defaults:', error);
    }
  }

  private setupClickInterception(): void {
    document.addEventListener('click', this.handleClick.bind(this), true);
  }

  private setupMutationObserver(): void {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.processNewContent(node as Element);
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private processNewContent(container: Element): void {
    // Find comment containers in new content
    const commentElements = container.querySelectorAll('div[data-pressable-container="true"]');
    
    commentElements.forEach((element) => {
      this.markPotentiallyExpandableComment(element as HTMLElement);
    });
  }

  private markPotentiallyExpandableComment(element: HTMLElement): void {
    // Check if this element has characteristics of a clickable comment
    const hasAuthor = element.querySelector('a[href*="/@"]');
    const hasText = element.textContent && element.textContent.trim().length > 20;
    
    if (hasAuthor && hasText) {
      element.setAttribute('data-threadforge-expandable', 'true');
    }
  }

  private handleClick(event: MouseEvent): void {
    if (!this.settings.enableInlineExpansion) return;

    const result = this.interceptCommentClick(event);
    if (result.intercepted && result.commentUrl && result.element) {
      event.preventDefault();
      event.stopPropagation();
      this.expandCommentInline(result.element, result.commentUrl);
    }
  }

  private interceptCommentClick(event: MouseEvent): ClickInterceptionResult {
    const target = event.target as Element;
    if (!target) return { intercepted: false };

    // Find the closest comment container
    const commentContainer = target.closest('div[data-threadforge-expandable="true"]') as HTMLElement;
    if (!commentContainer) return { intercepted: false };

    // Check if the click is on a link that would navigate to a comment page
    const clickedLink = target.closest('a[href]') as HTMLAnchorElement;
    if (!clickedLink) return { intercepted: false };

    // Check if this looks like a comment navigation link
    const isCommentNavigation = this.isCommentNavigationLink(clickedLink.href);
    
    if (isCommentNavigation) {
      console.log('🔗 Intercepting comment click for inline expansion:', clickedLink.href);
      return {
        intercepted: true,
        commentUrl: clickedLink.href,
        element: commentContainer
      };
    }

    return { intercepted: false };
  }

  private isCommentNavigationLink(href: string): boolean {
    return href.includes('threads.com') && 
           href.includes('/post/') &&
           !href.includes('photo/') &&
           !href.includes('video/') &&
           !href.includes('edit');
  }

  private async expandCommentInline(commentContainer: HTMLElement, commentUrl: string): Promise<void> {
    const commentId = this.getCommentId(commentContainer);
    
    // Check if already expanded
    if (this.expandedComments.has(commentId) || 
        commentContainer.querySelector('.threadforge-inline-expansion')) {
      return;
    }

    this.expandedComments.add(commentId);
    
    // Show loading state
    const loadingDiv = this.createLoadingElement();
    commentContainer.appendChild(loadingDiv);

    try {
      // Fetch comment data (mock for now)
      const commentData = await this.fetchCommentData(commentUrl);
      
      // Remove loading
      loadingDiv.remove();
      
      // Create and show expansion
      const expansionDiv = this.createExpansionElement(commentData, commentId);
      commentContainer.appendChild(expansionDiv);
      
      // Scroll into view
      expansionDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      
    } catch (error) {
      console.error('❌ Error expanding comment:', error);
      loadingDiv.innerHTML = this.getErrorHTML(commentId);
    }
  }

  private getCommentId(element: HTMLElement): string {
    return `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private createLoadingElement(): HTMLElement {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'threadforge-inline-expansion threadforge-loading';
    loadingDiv.innerHTML = `
      <div class="threadforge-loading-content">
        <div class="threadforge-spinner"></div>
        <span>Loading replies...</span>
      </div>
    `;
    return loadingDiv;
  }

  private async fetchCommentData(url: string): Promise<CommentData[]> {
    // In a real implementation, this would fetch the actual comment page
    // For now, we'll simulate with mock data
    await this.sleep(1500);
    
    const mockReplies: CommentData[] = [
      {
        id: '1',
        author: 'alice_dev',
        text: 'Really interesting perspective! I\'ve been thinking about this too.',
        timestamp: '2 hours ago'
      },
      {
        id: '2', 
        author: 'bob_coder',
        text: 'Thanks for sharing this. The integration with Claude Code looks promising!',
        timestamp: '1 hour ago'
      },
      {
        id: '3',
        author: 'charlie_tech',
        text: 'I wonder how this compares to VSCode\'s implementation. Any thoughts?',
        timestamp: '30 minutes ago'
      }
    ];
    
    // Randomly return different numbers of replies
    const numReplies = Math.floor(Math.random() * 4);
    return mockReplies.slice(0, numReplies);
  }

  private createExpansionElement(replies: CommentData[], commentId: string): HTMLElement {
    const expansionDiv = document.createElement('div');
    expansionDiv.className = 'threadforge-inline-expansion';
    
    if (replies.length > 0) {
      expansionDiv.innerHTML = `
        <div class="threadforge-replies-container">
          <div class="threadforge-replies-header">
            <span class="threadforge-reply-count">
              💬 ${replies.length} ${replies.length === 1 ? 'Reply' : 'Replies'}
            </span>
          </div>
          <div class="threadforge-replies-list">
            ${replies.map(reply => this.createReplyHTML(reply)).join('')}
          </div>
          <button class="threadforge-close-btn" onclick="this.parentElement.parentElement.remove(); window.threadForgeInstance?.onCommentClosed('${commentId}')">
            Close Replies
          </button>
        </div>
      `;
    } else {
      expansionDiv.innerHTML = `
        <div class="threadforge-replies-container">
          <div class="threadforge-no-replies">
            <span>💭 No replies yet</span>
          </div>
          <button class="threadforge-close-btn" onclick="this.parentElement.parentElement.remove(); window.threadForgeInstance?.onCommentClosed('${commentId}')">
            Close
          </button>
        </div>
      `;
    }
    
    return expansionDiv;
  }

  private createReplyHTML(reply: CommentData): string {
    return `
      <div class="threadforge-reply">
        <div class="threadforge-reply-header">
          <span class="threadforge-reply-author">@${reply.author || 'Anonymous'}</span>
          <span class="threadforge-reply-time">${reply.timestamp || 'Unknown time'}</span>
        </div>
        <div class="threadforge-reply-text">
          ${reply.text || 'No text content'}
        </div>
      </div>
    `;
  }

  private getErrorHTML(commentId: string): string {
    return `
      <div class="threadforge-error-content">
        <span>❌ Failed to load replies</span>
        <button class="threadforge-close-btn" onclick="this.parentElement.parentElement.remove(); window.threadForgeInstance?.onCommentClosed('${commentId}')">
          Close
        </button>
      </div>
    `;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public onCommentClosed(commentId: string): void {
    this.expandedComments.delete(commentId);
  }

  private addCustomStyles(): void {
    if (document.getElementById('threadforge-styles')) return;

    const style = document.createElement('style');
    style.id = 'threadforge-styles';
    style.textContent = `
      /* ThreadForge Custom Styles */
      .threadforge-inline-expansion {
        margin-top: 16px;
        margin-left: 12px;
        border-left: 3px solid #1877F2;
        animation: threadforge-fade-in 0.3s ease-out;
      }

      @keyframes threadforge-fade-in {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes threadforge-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .threadforge-loading-content {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 20px;
        background: linear-gradient(135deg, #f8f9fa, #e9ecef);
        border-radius: 12px;
        margin: 8px 0;
        font-size: 14px;
        color: #495057;
      }

      .threadforge-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid #e9ecef;
        border-top: 2px solid #1877F2;
        border-radius: 50%;
        animation: threadforge-spin 1s linear infinite;
      }

      .threadforge-replies-container {
        background: linear-gradient(135deg, #ffffff, #f8f9fa);
        border-radius: 16px;
        padding: 20px;
        margin: 8px 0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        border: 1px solid #e9ecef;
      }

      .threadforge-replies-header {
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 2px solid #e9ecef;
      }

      .threadforge-reply-count {
        font-weight: 600;
        color: #1877F2;
        font-size: 15px;
      }

      .threadforge-replies-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 16px;
      }

      .threadforge-reply {
        background: #ffffff;
        border-radius: 12px;
        padding: 16px;
        border: 1px solid #e9ecef;
        border-left: 4px solid #1877F2;
        transition: all 0.2s ease;
      }

      .threadforge-reply:hover {
        box-shadow: 0 2px 8px rgba(24, 119, 242, 0.15);
        transform: translateX(4px);
      }

      .threadforge-reply-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .threadforge-reply-author {
        font-weight: 700;
        color: #1877F2;
        font-size: 14px;
      }

      .threadforge-reply-time {
        font-size: 12px;
        color: #6c757d;
        background: #f8f9fa;
        padding: 4px 8px;
        border-radius: 8px;
      }

      .threadforge-reply-text {
        color: #212529;
        line-height: 1.5;
        font-size: 14px;
      }

      .threadforge-close-btn {
        background: linear-gradient(135deg, #6c757d, #495057);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 25px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.2s ease;
        float: right;
      }

      .threadforge-close-btn:hover {
        background: linear-gradient(135deg, #495057, #343a40);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(108, 117, 125, 0.3);
      }

      .threadforge-no-replies {
        text-align: center;
        padding: 40px 20px;
        color: #6c757d;
        font-style: italic;
        font-size: 16px;
      }

      .threadforge-error-content {
        background: linear-gradient(135deg, #fff5f5, #fed7d7);
        border: 1px solid #feb2b2;
        border-radius: 12px;
        padding: 20px;
        margin: 8px 0;
        color: #c53030;
        text-align: center;
        font-weight: 600;
      }

      /* Mobile responsiveness */
      @media (max-width: 768px) {
        .threadforge-inline-expansion {
          margin-left: 8px;
        }
        
        .threadforge-replies-container {
          padding: 16px;
        }
        
        .threadforge-reply {
          padding: 12px;
        }
        
        .threadforge-reply-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
        }
      }
    `;

    document.head.appendChild(style);
  }
}

// Initialize the extension
const threadForgeInstance = new ThreadForgeUIImprover();

// Make it globally accessible for cleanup callbacks
(window as any).threadForgeInstance = threadForgeInstance;