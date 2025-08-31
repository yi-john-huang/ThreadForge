/**
 * UI Enhancement Service - Task 18
 * Enhances UI components with API-powered features including real-time metrics,
 * user profiles, improved timestamps, and media attachments
 */

export interface EngagementMetrics {
  likes: number;
  reposts: number;
  replies?: number;
  views?: number;
  likesChange?: number;
  repostsChange?: number;
}

export interface UserProfile {
  username: string;
  displayName?: string;
  avatarUrl?: string;
  verified: boolean;
  followerCount?: number;
  bio?: string;
}

export interface MediaAttachment {
  type: 'image' | 'video' | 'gif';
  url: string;
  alt?: string;
  thumbnail?: string;
  lazy?: boolean;
}

export class UIEnhancementService {
  
  /**
   * Displays engagement metrics with real-time updates
   */
  public displayEngagementMetrics(element: HTMLElement, metrics: EngagementMetrics): HTMLElement {
    element.classList.add('tf-enhanced-metrics');

    // Create or update metrics container
    let metricsContainer = element.querySelector('.tf-metrics-container') as HTMLElement;
    if (!metricsContainer) {
      metricsContainer = document.createElement('div');
      metricsContainer.classList.add('tf-metrics-container');
      metricsContainer.style.display = 'flex';
      metricsContainer.style.gap = '15px';
      metricsContainer.style.padding = '8px 0';
      metricsContainer.style.fontSize = '14px';
      metricsContainer.style.color = '#666';
      element.appendChild(metricsContainer);
    }

    // Clear existing metrics
    metricsContainer.innerHTML = '';

    // Add likes
    if (metrics.likes !== undefined) {
      const likesElement = this.createMetricElement('likes', metrics.likes, metrics.likesChange);
      metricsContainer.appendChild(likesElement);
    }

    // Add reposts
    if (metrics.reposts !== undefined) {
      const repostsElement = this.createMetricElement('reposts', metrics.reposts, metrics.repostsChange);
      metricsContainer.appendChild(repostsElement);
    }

    // Add replies
    if (metrics.replies !== undefined) {
      const repliesElement = this.createMetricElement('replies', metrics.replies);
      metricsContainer.appendChild(repliesElement);
    }

    // Add views
    if (metrics.views !== undefined) {
      const viewsElement = this.createMetricElement('views', metrics.views);
      metricsContainer.appendChild(viewsElement);
    }

    return element;
  }

  /**
   * Creates individual metric element with proper formatting
   */
  private createMetricElement(type: string, value: number, change?: number): HTMLElement {
    const metricElement = document.createElement('span');
    metricElement.classList.add(`tf-metric-${type}`);
    metricElement.style.display = 'flex';
    metricElement.style.alignItems = 'center';
    metricElement.style.gap = '4px';

    const valueSpan = document.createElement('span');
    valueSpan.textContent = this.formatNumber(value);
    metricElement.appendChild(valueSpan);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = type;
    labelSpan.style.color = '#999';
    metricElement.appendChild(labelSpan);

    // Add trend indicator if change is provided
    if (change !== undefined && change !== 0) {
      const trendSpan = document.createElement('span');
      trendSpan.classList.add(`tf-trend-${type}`);
      trendSpan.textContent = change > 0 ? `+${change}` : change.toString();
      trendSpan.style.color = change > 0 ? '#28a745' : '#dc3545';
      trendSpan.style.fontSize = '12px';
      trendSpan.style.fontWeight = 'bold';
      metricElement.appendChild(trendSpan);
    }

    return metricElement;
  }

  /**
   * Formats numbers with appropriate units (K, M, B)
   */
  private formatNumber(num: number): string {
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1).replace('.0', '') + 'K';
    if (num < 1000000000) return (num / 1000000).toFixed(1).replace('.0', '') + 'M';
    return (num / 1000000000).toFixed(1).replace('.0', '') + 'B';
  }

  /**
   * Updates metrics in real-time when data changes
   */
  public updateMetricsRealtime(element: HTMLElement, newMetrics: EngagementMetrics): void {
    const metricsContainer = element.querySelector('.tf-metrics-container');
    if (metricsContainer) {
      // Update individual metric values
      if (newMetrics.likes !== undefined) {
        const likesElement = metricsContainer.querySelector('.tf-metric-likes span');
        if (likesElement) {
          likesElement.textContent = this.formatNumber(newMetrics.likes);
        }
      }

      if (newMetrics.reposts !== undefined) {
        const repostsElement = metricsContainer.querySelector('.tf-metric-reposts span');
        if (repostsElement) {
          repostsElement.textContent = this.formatNumber(newMetrics.reposts);
        }
      }
    }
  }

  /**
   * Adds user profile integration with avatars and verification
   */
  public addUserProfile(element: HTMLElement, userProfile: UserProfile): HTMLElement {
    element.classList.add('tf-enhanced-profile');

    // Create or update profile container
    let profileContainer = element.querySelector('.tf-profile-container') as HTMLElement;
    if (!profileContainer) {
      profileContainer = document.createElement('div');
      profileContainer.classList.add('tf-profile-container');
      profileContainer.style.display = 'flex';
      profileContainer.style.alignItems = 'center';
      profileContainer.style.gap = '10px';
      profileContainer.style.marginBottom = '8px';
      element.insertBefore(profileContainer, element.firstChild);
    }

    // Add avatar
    if (userProfile.avatarUrl) {
      const avatar = this.createUserAvatar(userProfile.avatarUrl, userProfile.verified);
      profileContainer.appendChild(avatar);
    }

    // Add user info
    const userInfoDiv = document.createElement('div');
    userInfoDiv.classList.add('tf-user-info');

    const displayNameElement = document.createElement('div');
    displayNameElement.classList.add('tf-display-name');
    displayNameElement.textContent = userProfile.displayName || userProfile.username;
    displayNameElement.style.fontWeight = 'bold';
    displayNameElement.style.fontSize = '15px';

    const usernameElement = document.createElement('div');
    usernameElement.classList.add('tf-username');
    usernameElement.textContent = `@${userProfile.username}`;
    usernameElement.style.color = '#666';
    usernameElement.style.fontSize = '14px';

    userInfoDiv.appendChild(displayNameElement);
    userInfoDiv.appendChild(usernameElement);

    // Add verification badge if verified
    if (userProfile.verified) {
      const verificationBadge = document.createElement('span');
      verificationBadge.classList.add('tf-verification-badge', 'verified');
      verificationBadge.textContent = '✓';
      verificationBadge.style.color = '#1da1f2';
      verificationBadge.style.marginLeft = '5px';
      verificationBadge.setAttribute('aria-label', 'Verified user');
      displayNameElement.appendChild(verificationBadge);
    }

    profileContainer.appendChild(userInfoDiv);

    // Add follower count if available
    if (userProfile.followerCount !== undefined) {
      const followerElement = document.createElement('div');
      followerElement.classList.add('tf-follower-count');
      followerElement.textContent = `${this.formatNumber(userProfile.followerCount)} followers`;
      followerElement.style.fontSize = '12px';
      followerElement.style.color = '#999';
      userInfoDiv.appendChild(followerElement);
    }

    return element;
  }

  /**
   * Creates user avatar component with verification indicator
   */
  public createUserAvatar(avatarUrl: string, verified: boolean): HTMLElement {
    const avatarContainer = document.createElement('div');
    avatarContainer.classList.add('tf-avatar-container');
    avatarContainer.style.position = 'relative';
    avatarContainer.style.width = '40px';
    avatarContainer.style.height = '40px';

    const avatarImg = document.createElement('img');
    avatarImg.classList.add('tf-user-avatar');
    avatarImg.src = avatarUrl;
    avatarImg.alt = `${avatarUrl.split('/').pop()} avatar`;
    avatarImg.style.width = '100%';
    avatarImg.style.height = '100%';
    avatarImg.style.borderRadius = '50%';
    avatarImg.style.objectFit = 'cover';
    avatarImg.setAttribute('aria-label', `${avatarUrl} avatar`);

    // Add loading fallback
    avatarImg.onerror = () => {
      avatarImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNlMGUwZTAiLz4KPHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEwIDEwQzExLjEwNDYgMTAgMTIgOS4xMDQ1NyAxMiA4QzEyIDYuODk1NDMgMTEuMTA0NiA2IDEwIDZDOC44OTU0MyA2IDggNi44OTU0MyA4IDhDOCA5LjEwNDU3IDguODk1NDMgMTAgMTAgMTBaIiBmaWxsPSIjOTk5Ii8+CjxwYXRoIGQ9Ik0xMCAxMkM3LjQ0NzcxIDEyIDUuNSAxMy45NDc3IDUuNSAxNi41VjE3SDE0LjVWMTYuNUMxNC41IDEzLjk0NzcgMTIuNTUyMyAxMiAxMCAxMloiIGZpbGw9IiM5OTkiLz4KPC9zdmc+Cjwvc3ZnPgo=';
    };

    avatarContainer.appendChild(avatarImg);

    // Add verification indicator for avatar
    if (verified) {
      const verificationIndicator = document.createElement('div');
      verificationIndicator.classList.add('tf-avatar-verified');
      verificationIndicator.style.position = 'absolute';
      verificationIndicator.style.bottom = '-2px';
      verificationIndicator.style.right = '-2px';
      verificationIndicator.style.width = '16px';
      verificationIndicator.style.height = '16px';
      verificationIndicator.style.backgroundColor = '#1da1f2';
      verificationIndicator.style.borderRadius = '50%';
      verificationIndicator.style.border = '2px solid white';
      verificationIndicator.style.display = 'flex';
      verificationIndicator.style.alignItems = 'center';
      verificationIndicator.style.justifyContent = 'center';
      verificationIndicator.style.fontSize = '10px';
      verificationIndicator.style.color = 'white';
      verificationIndicator.textContent = '✓';
      avatarContainer.appendChild(verificationIndicator);
    }

    return avatarContainer;
  }

  /**
   * Formats timestamp with relative time display
   */
  public formatTimestamp(timestamp: string | number): string {
    // Handle invalid inputs
    if (!timestamp || isNaN(Number(timestamp)) || Number(timestamp) < 0) {
      return 'unknown';
    }

    const date = new Date(Number(timestamp));
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // If negative difference (future date), treat as invalid
    if (diffMs < 0) {
      return 'unknown';
    }

    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);

    // Recent timestamps with relative formatting
    if (diffSeconds < 60) return 'now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffWeeks < 4) return `${diffWeeks}w ago`;

    // Older timestamps with absolute dates
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Adds media attachments with gallery support
   */
  public addMediaAttachments(element: HTMLElement, media: MediaAttachment[]): HTMLElement {
    if (!media || media.length === 0) {
      return element;
    }

    element.classList.add('tf-enhanced-media');

    // Create or update media container
    let mediaContainer = element.querySelector('.tf-media-container') as HTMLElement;
    if (!mediaContainer) {
      mediaContainer = document.createElement('div');
      mediaContainer.classList.add('tf-media-container');
      mediaContainer.style.marginTop = '10px';
      element.appendChild(mediaContainer);
    }

    // Handle single vs multiple media
    if (media.length === 1) {
      const mediaElement = this.createMediaElement(media[0]);
      mediaContainer.appendChild(mediaElement);
    } else {
      const gallery = this.createMediaGallery(media.map(m => m.url));
      mediaContainer.appendChild(gallery);
    }

    return element;
  }

  /**
   * Creates individual media element
   */
  private createMediaElement(media: MediaAttachment): HTMLElement {
    let mediaElement: HTMLElement;

    if (media.type === 'video') {
      mediaElement = document.createElement('video');
      (mediaElement as HTMLVideoElement).src = media.url;
      (mediaElement as HTMLVideoElement).controls = true;
      (mediaElement as HTMLVideoElement).preload = 'metadata';
      
      if (media.thumbnail) {
        (mediaElement as HTMLVideoElement).poster = media.thumbnail;
      }
    } else {
      // Handle images and gifs
      mediaElement = document.createElement('img');
      (mediaElement as HTMLImageElement).src = media.url;
      (mediaElement as HTMLImageElement).alt = media.alt || 'Media attachment';
      
      if (media.lazy) {
        (mediaElement as HTMLImageElement).loading = 'lazy';
        mediaElement.classList.add('tf-lazy-media');
      }
    }

    mediaElement.classList.add('tf-media-image');
    mediaElement.style.maxWidth = '100%';
    mediaElement.style.borderRadius = '8px';
    mediaElement.style.cursor = 'pointer';
    mediaElement.setAttribute('tabindex', '0');
    mediaElement.setAttribute('role', 'button');

    // Add click handler for expansion
    this.handleMediaClick(mediaElement);

    return mediaElement;
  }

  /**
   * Creates media gallery for multiple attachments
   */
  public createMediaGallery(mediaUrls: string[]): HTMLElement {
    const gallery = document.createElement('div');
    gallery.classList.add('tf-media-gallery');
    gallery.style.display = 'grid';
    gallery.style.gridTemplateColumns = mediaUrls.length > 2 ? 'repeat(2, 1fr)' : '1fr';
    gallery.style.gap = '8px';
    gallery.style.borderRadius = '8px';
    gallery.style.overflow = 'hidden';

    mediaUrls.forEach((url, index) => {
      const galleryItem = document.createElement('div');
      galleryItem.classList.add('tf-gallery-item');
      
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Gallery image ${index + 1}`;
      img.style.width = '100%';
      img.style.height = '200px';
      img.style.objectFit = 'cover';
      img.style.cursor = 'pointer';
      
      galleryItem.appendChild(img);
      gallery.appendChild(galleryItem);

      // Add click handler for gallery expansion
      this.handleMediaClick(img);
    });

    // Add navigation controls for galleries with more than 2 items
    if (mediaUrls.length > 2) {
      const navControls = document.createElement('div');
      navControls.classList.add('tf-gallery-nav');
      navControls.style.position = 'absolute';
      navControls.style.top = '50%';
      navControls.style.width = '100%';
      navControls.style.display = 'flex';
      navControls.style.justifyContent = 'space-between';
      navControls.style.padding = '0 10px';
      navControls.style.transform = 'translateY(-50%)';
      
      const prevBtn = document.createElement('button');
      prevBtn.textContent = '‹';
      prevBtn.style.backgroundColor = 'rgba(0,0,0,0.5)';
      prevBtn.style.color = 'white';
      prevBtn.style.border = 'none';
      prevBtn.style.borderRadius = '50%';
      prevBtn.style.width = '30px';
      prevBtn.style.height = '30px';
      prevBtn.style.cursor = 'pointer';

      const nextBtn = document.createElement('button');
      nextBtn.textContent = '›';
      nextBtn.style.backgroundColor = 'rgba(0,0,0,0.5)';
      nextBtn.style.color = 'white';
      nextBtn.style.border = 'none';
      nextBtn.style.borderRadius = '50%';
      nextBtn.style.width = '30px';
      nextBtn.style.height = '30px';
      nextBtn.style.cursor = 'pointer';

      navControls.appendChild(prevBtn);
      navControls.appendChild(nextBtn);
      
      // Position gallery container relatively for nav controls
      gallery.style.position = 'relative';
      gallery.appendChild(navControls);
    }

    return gallery;
  }

  /**
   * Creates media gallery with media objects (for mixed media types)
   */
  private createMediaGalleryWithObjects(media: MediaAttachment[]): HTMLElement {
    const gallery = document.createElement('div');
    gallery.classList.add('tf-media-gallery');
    gallery.style.display = 'grid';
    gallery.style.gridTemplateColumns = media.length > 2 ? 'repeat(2, 1fr)' : '1fr';
    gallery.style.gap = '8px';
    gallery.style.borderRadius = '8px';
    gallery.style.overflow = 'hidden';

    media.forEach((mediaItem, index) => {
      const galleryItem = document.createElement('div');
      galleryItem.classList.add('tf-gallery-item');
      
      const mediaElement = this.createMediaElement(mediaItem);
      mediaElement.style.width = '100%';
      mediaElement.style.height = '200px';
      mediaElement.style.objectFit = 'cover';
      
      galleryItem.appendChild(mediaElement);
      gallery.appendChild(galleryItem);
    });

    return gallery;
  }

  /**
   * Handles media click events for expansion
   */
  public handleMediaClick(mediaElement: HTMLElement): void {
    mediaElement.classList.add('tf-media-expandable');
    mediaElement.style.cursor = 'pointer';

    mediaElement.addEventListener('click', () => {
      // Create modal overlay for media expansion
      const modal = document.createElement('div');
      modal.classList.add('tf-media-modal');
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100%';
      modal.style.height = '100%';
      modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
      modal.style.zIndex = '10000';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';

      const expandedMedia = mediaElement.cloneNode(true) as HTMLElement;
      expandedMedia.style.maxWidth = '90%';
      expandedMedia.style.maxHeight = '90%';
      expandedMedia.style.objectFit = 'contain';
      expandedMedia.style.cursor = 'default';

      modal.appendChild(expandedMedia);

      // Close on click
      modal.addEventListener('click', () => {
        document.body.removeChild(modal);
      });

      document.body.appendChild(modal);
    });

    // Add keyboard support
    mediaElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        mediaElement.click();
      }
    });
  }

  /**
   * Adds hover effects to interactive elements
   */
  public addHoverEffects(element: HTMLElement): void {
    element.classList.add('tf-hoverable');
    element.style.transition = 'background-color 0.2s ease, box-shadow 0.2s ease';
    element.style.cursor = 'pointer';

    element.addEventListener('mouseenter', () => {
      element.style.backgroundColor = 'rgba(0,0,0,0.05)';
      element.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    });

    element.addEventListener('mouseleave', () => {
      element.style.backgroundColor = '';
      element.style.boxShadow = '';
    });
  }

  /**
   * Creates informative tooltips
   */
  public createTooltip(targetElement: HTMLElement, content: string): HTMLElement {
    const tooltip = document.createElement('div');
    tooltip.classList.add('tf-tooltip');
    tooltip.textContent = content;
    tooltip.style.position = 'absolute';
    tooltip.style.backgroundColor = '#333';
    tooltip.style.color = 'white';
    tooltip.style.padding = '8px 12px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.fontSize = '12px';
    tooltip.style.zIndex = '1000';
    tooltip.style.opacity = '0';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.transition = 'opacity 0.2s ease';
    tooltip.setAttribute('data-target', targetElement.id || 'unnamed');

    // Position tooltip above target
    const updatePosition = () => {
      const rect = targetElement.getBoundingClientRect();
      tooltip.style.left = `${rect.left + rect.width / 2}px`;
      tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
      tooltip.style.transform = 'translateX(-50%)';
    };

    targetElement.addEventListener('mouseenter', () => {
      document.body.appendChild(tooltip);
      updatePosition();
      tooltip.style.opacity = '1';
    });

    targetElement.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
      setTimeout(() => {
        if (tooltip.parentNode) {
          document.body.removeChild(tooltip);
        }
      }, 200);
    });

    return tooltip;
  }
}