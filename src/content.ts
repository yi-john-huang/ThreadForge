import { CommentData, ClickInterceptionResult, CommentExtractorOptions } from './types';
import {
  extractRepliesFromDOM as parseRepliesFromDOM,
  extractRepliesFromCurrentPage as parseRepliesFromCurrentPage,
  extractSingleReply as parseSingleReply,
  extractRepliesFromEmbeddedJSON as parseRepliesFromEmbeddedJSON,
} from './utils/extractors';

console.log('🧵 ThreadForge UI Improver loaded!');

class ThreadForgeUIImprover {
  private settings = {
    enableInlineExpansion: true,
    autoExpandReplies: false,
    maxReplyDepth: 3,
    debug: false
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
    // Find all potential comment containers
    const selectors = [
      'div[data-pressable-container="true"]',
      'article',
      '[role="article"]',
      'div[class*="reply"]',
      'div[class*="comment"]'
    ];
    
    selectors.forEach(selector => {
      const elements = container.querySelectorAll(selector);
      elements.forEach((element) => {
        this.markPotentiallyExpandableComment(element as HTMLElement);
      });
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
      event.stopImmediatePropagation();
      this.incrementStat('interceptedCount');
      this.expandCommentInline(result.element, result.commentUrl);
    }
  }

  private interceptCommentClick(event: MouseEvent): ClickInterceptionResult {
    const target = event.target as Element;
    if (!target) return { intercepted: false };

    // Ignore clicks inside ThreadForge UI elements
    if (target.closest('.threadforge-inline-expansion') || target.closest('.threadforge-close-btn')) {
      return { intercepted: false };
    }

    // Check if the click is on a link that would navigate to a comment page
    const clickedLink = target.closest('a[href]') as HTMLAnchorElement;
    if (!clickedLink) return { intercepted: false };

    // Check if this looks like a comment navigation link
    const isCommentNavigation = this.isCommentNavigationLink(clickedLink.href);
    
    if (isCommentNavigation) {
      // Find the container for this specific click
      let commentContainer = clickedLink.closest('div[data-pressable-container="true"]') as HTMLElement;
      
      // If not found, try to find any parent container that looks like a comment
      if (!commentContainer) {
        commentContainer = clickedLink.closest('article, [role="article"], div[class*="reply"], div[class*="comment"]') as HTMLElement;
      }
      
      // If still not found, use the link's parent container
      if (!commentContainer) {
        commentContainer = clickedLink.parentElement as HTMLElement;
      }
      
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
    return (href.includes('threads.com') || href.includes('threads.net')) && 
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
      this.incrementStat('expandedCount');
      
      // Scroll into view
      expansionDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      
    } catch (error) {
      console.error('❌ Error expanding comment:', error);
      loadingDiv.innerHTML = this.getErrorHTML(commentId);
      const closeBtn = loadingDiv.querySelector('.threadforge-close-btn') as HTMLButtonElement | null;
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          loadingDiv.remove();
          this.onCommentClosed(commentId);
        });
      }
    }
  }

  private getCommentId(element: HTMLElement): string {
    return `comment-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
    try {
      console.log('🔍 Fetching comment data from:', url);
      
      // First, check if we need to navigate to the comment page
      const currentUrl = window.location.href;
      const needsNavigation = !currentUrl.includes(url.split('/post/')[1]?.split('?')[0] || '');
      
      if (needsNavigation) {
        console.log('🚀 Navigating to comment page...');
        // Open in new tab to fetch comments
        const comments = await this.fetchCommentsInNewTab(url);
        if (comments.length > 0) {
          chrome.storage.local.set({ lastReplySource: 'new-tab' });
          return comments;
        }
      } else {
        // We're already on the comment page, wait for comments to load
        console.log('🕰️ Waiting for comments to load on current page...');
        const comments = await this.waitForCommentsToLoad();
        if (comments.length > 0) {
          chrome.storage.local.set({ lastReplySource: 'current-page-wait' });
          return comments;
        }
      }
      
    } catch (error) {
      console.error('❌ Error fetching comment data:', error);
    }
    
    // If all else fails, return empty array
    console.log('😔 No replies found');
    chrome.storage.local.set({ lastReplySource: 'none' });
    return [];
  }

  private extractRepliesFromDOM(doc: Document): CommentData[] {
    return parseRepliesFromDOM(doc);
  }
  
  private async extractAllRepliesFromPage(doc: Document, pageUrl: string): Promise<CommentData[]> {
    const allReplies: CommentData[] = [];
    
    // Log page structure for debugging
    console.log('🔍 Analyzing page structure...');
    
    // Look for the main content area
    const mainContent = doc.querySelector('[role="main"]') || doc.querySelector('main') || doc.body;
    
    // Try multiple strategies to find comments
    // Strategy 1: Look for comment sections by class patterns
    const commentSections = mainContent.querySelectorAll('[class*="reply"], [class*="comment"], [class*="response"]');
    console.log(`Found ${commentSections.length} potential comment sections`);
    
    // Strategy 2: Look for articles after the main post
    const articles = Array.from(mainContent.querySelectorAll('article'));
    let isAfterMainPost = false;
    
    for (const article of articles) {
      // Check if this is the main post (usually has more content, images, etc.)
      const hasImages = article.querySelectorAll('img').length > 1;
      const textLength = article.textContent?.length || 0;
      
      if (!isAfterMainPost && (hasImages || textLength > 500)) {
        isAfterMainPost = true;
        console.log('Found main post, looking for replies after this...');
        continue;
      }
      
      if (isAfterMainPost) {
        const reply = this.extractSingleReply(article as HTMLElement);
        if (reply && reply.text && reply.text.length > 10) {
          allReplies.push(reply);
        }
      }
    }
    
    // Strategy 3: Look for specific Threads patterns
    const threadPatterns = [
      'div[data-pressable-container="true"]',
      'div[role="button"][tabindex="0"]',
      'div[class*="css-"][dir="auto"]'
    ];
    
    for (const pattern of threadPatterns) {
      const elements = mainContent.querySelectorAll(pattern);
      for (const element of Array.from(elements)) {
        // Skip if already processed
        if (allReplies.some(r => element.textContent?.includes(r.text || ''))) continue;
        
        const reply = this.extractSingleReply(element as HTMLElement);
        if (reply && reply.text && reply.text.length > 10) {
          // Additional validation - must have author or timestamp
          if (reply.author || reply.timestamp) {
            allReplies.push(reply);
          }
        }
      }
    }
    
    // If none found yet, try embedded JSON data blobs (Next.js/GraphQL dehydrated state)
    if (allReplies.length === 0) {
      try {
        const jsonReplies = parseRepliesFromEmbeddedJSON(doc);
        if (jsonReplies.length > 0) {
          this.log(`📦 Extracted ${jsonReplies.length} replies from embedded JSON`);
          allReplies.push(...jsonReplies);
          chrome.storage.local.set({ lastReplySource: 'json' });
        }
      } catch (e) {
        this.log('Embedded JSON parse failed', e);
      }
    }

    // Remove duplicates and sort by appearance
    const uniqueReplies = allReplies.filter((reply, index, self) =>
      index === self.findIndex(r => 
        r.text === reply.text && r.author === reply.author
      )
    );
    
    console.log(`Extracted ${uniqueReplies.length} unique replies`);
    return uniqueReplies;
  }

  private extractRepliesFromCurrentPage(): CommentData[] {
    return parseRepliesFromCurrentPage(document);
  }
  
  private async waitForCommentsToLoad(maxWaitTime: number = 5000): Promise<CommentData[]> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let resolved = false;
      
      // Function to check for comments
      const checkForComments = () => {
        const comments = this.extractCommentsFromPage();
        if (comments.length > 0) {
          console.log(`✅ Found ${comments.length} comments after waiting`);
          resolved = true;
          resolve(comments);
          return true;
        }
        return false;
      };
      
      // Check immediately
      if (checkForComments()) return;
      
      // Set up mutation observer to detect when comments are added
      const observer = new MutationObserver((mutations) => {
        if (resolved) return;
        
        // Check if any new nodes might be comments
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            if (checkForComments()) {
              observer.disconnect();
              return;
            }
          }
        }
      });
      
      // Start observing
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // Also check periodically
      const checkInterval = setInterval(() => {
        if (resolved || Date.now() - startTime > maxWaitTime) {
          clearInterval(checkInterval);
          observer.disconnect();
          if (!resolved) {
            console.log('⏱️ Timeout waiting for comments');
            resolve([]);
          }
          return;
        }
        checkForComments();
      }, 500);
    });
  }
  
  private extractCommentsFromPage(): CommentData[] {
    const comments: CommentData[] = [];
    const processedTexts = new Set<string>();
    
    // Multiple strategies to find comments
    // Strategy 1: Look for articles that appear to be comments
    const articles = document.querySelectorAll('article');
    let foundMainPost = false;
    
    for (const article of Array.from(articles)) {
      // Skip if this looks like the main post (usually has more content)
      if (!foundMainPost) {
        const imgCount = article.querySelectorAll('img').length;
        const videoCount = article.querySelectorAll('video').length;
        if (imgCount > 1 || videoCount > 0) {
          foundMainPost = true;
          continue;
        }
      }
      
      const comment = this.extractCommentFromElement(article);
      if (comment && !processedTexts.has(comment.text || '')) {
        comments.push(comment);
        processedTexts.add(comment.text || '');
      }
    }
    
    // Strategy 2: Look for divs with specific patterns
    if (comments.length === 0) {
      const possibleComments = document.querySelectorAll('div[role="button"], div[data-pressable-container="true"]');
      
      for (const elem of Array.from(possibleComments)) {
        const comment = this.extractCommentFromElement(elem as HTMLElement);
        if (comment && !processedTexts.has(comment.text || '')) {
          comments.push(comment);
          processedTexts.add(comment.text || '');
        }
      }
    }
    
    return comments;
  }
  
  private extractCommentFromElement(element: HTMLElement): CommentData | null {
    // Look for author info
    const authorLink = element.querySelector('a[href*="/@"], a[href*="/threads.com/@"]') as HTMLAnchorElement;
    let author = null;
    
    if (authorLink) {
      const match = authorLink.href.match(/@([^/?]+)/);
      if (match) {
        author = match[1];
      }
    }
    
    // Look for comment text
    let text = '';
    const textCandidates = element.querySelectorAll('span[dir="auto"], div[dir="auto"], span[style*="line-height"]');
    
    for (const candidate of Array.from(textCandidates)) {
      const candidateText = candidate.textContent?.trim() || '';
      // Skip if it's UI text or too short
      if (candidateText.length > 10 && 
          !candidateText.match(/^(\d+\s*)?(reply|replies|like|likes|share|follow|post|posts|repost|reposts)$/i) &&
          candidateText !== author &&
          !candidateText.includes('Translate')) {
        text = candidateText;
        break;
      }
    }
    
    // Look for timestamp
    const timeElement = element.querySelector('time, a[href*="/post/"] span');
    const timestamp = timeElement?.textContent?.trim() || null;
    
    // Only return if we have meaningful content
    if (text && text.length > 5) {
      return {
        id: `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        author,
        text,
        timestamp
      };
    }
    
    return null;
  }
  
  private async fetchCommentsInNewTab(url: string): Promise<CommentData[]> {
    // This would require using chrome.tabs API which needs additional permissions
    // For now, we'll inform the user they need to click on the actual post
    console.log('🚧 Direct navigation required - please click on the post to view comments');
    return [];
  }

  private extractSingleReply(container: HTMLElement): CommentData | null {
    return parseSingleReply(container);
  }
  
  private extractRepliesAlternative(doc: Document): CommentData[] {
    const replies: CommentData[] = [];
    
    // Alternative extraction for Threads-specific structure
    // Look for comment containers that follow a specific pattern
    const possibleComments = doc.querySelectorAll('div');
    
    for (const div of Array.from(possibleComments)) {
      // Check if this div contains comment-like content
      const hasUserLink = div.querySelector('a[href*="/@"]') || div.querySelector('a[href*="/t/"]');
      const hasText = div.textContent && div.textContent.trim().length > 20;
      const hasTimeInfo = div.querySelector('time') || div.textContent?.match(/\d+[hmd]/);
      
      if (hasUserLink && hasText && hasTimeInfo) {
        const reply = this.extractSingleReply(div as HTMLElement);
        if (reply && reply.text && !replies.some(r => r.text === reply.text)) {
          replies.push(reply);
        }
      }
    }
    
    console.log(`Alternative extraction found ${replies.length} replies`);
    return replies;
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
          <button class="threadforge-close-btn" data-threadforge-comment-id="${commentId}">
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
          <button class="threadforge-close-btn" data-threadforge-comment-id="${commentId}">
            Close
          </button>
        </div>
      `;
    }
    // Attach close handler within the content script context (avoids isolated world issues)
    const closeBtn = expansionDiv.querySelector('.threadforge-close-btn') as HTMLButtonElement | null;
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        expansionDiv.remove();
        this.onCommentClosed(commentId);
      }, true);
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
        <button class="threadforge-close-btn" data-threadforge-comment-id="${commentId}">
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

  private log(...args: any[]): void {
    if (!this.settings.debug) return;
    try { console.log(...args); } catch {}
  }

  private async incrementStat(key: 'expandedCount' | 'interceptedCount'): Promise<void> {
    try {
      const current = await chrome.storage.local.get(key);
      const next = (current[key] || 0) + 1;
      await chrome.storage.local.set({ [key]: next });
    } catch {}
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
        position: relative;
        z-index: 9999;
        pointer-events: auto;
      }

      .threadforge-close-btn:hover {
        background: linear-gradient(135deg, #495057, #343a40);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(108, 117, 125, 0.3);
      }
      
      .threadforge-close-btn:active {
        transform: translateY(0);
        box-shadow: 0 2px 6px rgba(108, 117, 125, 0.2);
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
