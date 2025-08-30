/**
 * Integration tests for type definitions
 * Validates type compatibility and compilation
 */

// Import all types to verify they compile correctly
import { ThreadData, ReplyData, UserProfile, MediaAttachment, SearchResult, ThreadsAPIResponse, APIError } from '../api/types';
import { AuthenticationContext, OAuth2Config, AuthenticationResult, TokenRefreshRequest, TokenRefreshResponse, AuthenticationStatus } from '../auth/types';
import { CacheEntry, CacheConfig, CacheStats, CacheOperation, CacheKey, CacheMetadata } from '../cache/types';
import { ErrorType, ErrorContext, UserMessage, UserMessageAction, RetryConfig, FallbackOption } from '../errors/types';

describe('Type Integration and Compatibility', () => {
  test('should create valid ThreadData with UserProfile', () => {
    const userProfile: UserProfile = {
      id: 'user123',
      username: 'testuser',
      displayName: 'Test User',
      avatar: 'https://example.com/avatar.jpg',
      isVerified: true
    };

    const threadData: ThreadData = {
      id: 'thread123',
      author: userProfile,
      text: 'Test thread content',
      replyCount: 5,
      likeCount: 10,
      repostCount: 2,
      timestamp: new Date()
    };

    expect(threadData.author.id).toBe('user123');
    expect(threadData.author.isVerified).toBe(true);
  });

  test('should create valid ReplyData with nested structure', () => {
    const author: UserProfile = {
      id: 'user456',
      username: 'replier',
      displayName: 'Reply User',
      isVerified: false
    };

    const parentReply: ReplyData = {
      id: 'reply123',
      author,
      text: 'Parent reply',
      timestamp: new Date(),
      likeCount: 3,
      depth: 1
    };

    const nestedReply: ReplyData = {
      id: 'reply456',
      author,
      text: 'Nested reply',
      timestamp: new Date(),
      likeCount: 1,
      parentReply: parentReply.id,
      depth: 2
    };

    parentReply.nestedReplies = [nestedReply];

    expect(parentReply.nestedReplies).toHaveLength(1);
    expect(nestedReply.parentReply).toBe('reply123');
    expect(nestedReply.depth).toBe(2);
  });

  test('should create valid AuthenticationContext', () => {
    const authContext: AuthenticationContext = {
      accessToken: 'access_token_123',
      refreshToken: 'refresh_token_456',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
      scopes: ['threads_basic', 'threads_content_publish'],
      userId: 'user123'
    };

    expect(authContext.scopes).toContain('threads_basic');
    expect(authContext.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('should create valid CacheEntry with generic type', () => {
    const threadData: ThreadData = {
      id: 'thread123',
      author: {
        id: 'user123',
        username: 'testuser',
        displayName: 'Test User',
        isVerified: false
      },
      text: 'Cached thread',
      replyCount: 0,
      likeCount: 0,
      repostCount: 0,
      timestamp: new Date()
    };

    const cacheEntry: CacheEntry<ThreadData> = {
      data: threadData,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 600000), // 10 minutes
      accessCount: 1,
      key: 'thread:thread123'
    };

    expect(cacheEntry.data.id).toBe('thread123');
    expect(typeof cacheEntry.data).toBe('object');
  });

  test('should create valid ErrorContext with ErrorType enum', () => {
    const errorContext: ErrorContext = {
      type: ErrorType.API_REQUEST_FAILED,
      message: 'Failed to fetch thread data',
      recoverable: true,
      retryAfter: 5000,
      fallbackAvailable: true,
      debugInfo: { statusCode: 500, endpoint: '/threads/123' }
    };

    expect(errorContext.type).toBe('api_failed');
    expect(errorContext.recoverable).toBe(true);
    expect(errorContext.fallbackAvailable).toBe(true);
  });

  test('should handle MediaAttachment in ThreadData', () => {
    const media: MediaAttachment = {
      id: 'media123',
      type: 'image',
      url: 'https://example.com/image.jpg',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      width: 800,
      height: 600,
      altText: 'Test image'
    };

    const threadWithMedia: ThreadData = {
      id: 'thread456',
      author: {
        id: 'user789',
        username: 'photographer',
        displayName: 'Photo User',
        isVerified: true
      },
      text: 'Check out this image!',
      media: [media],
      replyCount: 0,
      likeCount: 5,
      repostCount: 1,
      timestamp: new Date()
    };

    expect(threadWithMedia.media).toHaveLength(1);
    expect(threadWithMedia.media![0].type).toBe('image');
  });

  test('should validate OAuth2Config structure', () => {
    const oauth2Config: OAuth2Config = {
      clientId: 'client123',
      scopes: ['threads_basic', 'threads_read_replies'],
      redirectUri: 'https://extension.example.com/callback',
      authUrl: 'https://threads.net/oauth/authorize',
      tokenUrl: 'https://graph.threads.net/oauth/access_token'
    };

    expect(oauth2Config.scopes).toHaveLength(2);
    expect(oauth2Config.redirectUri).toContain('extension.example.com');
  });

  test('should work with ThreadsAPIResponse wrapper', () => {
    const apiResponse: ThreadsAPIResponse<ThreadData[]> = {
      data: [{
        id: 'thread789',
        author: {
          id: 'user999',
          username: 'apiuser',
          displayName: 'API User',
          isVerified: false
        },
        text: 'API response thread',
        replyCount: 3,
        likeCount: 7,
        repostCount: 0,
        timestamp: new Date()
      }],
      paging: {
        cursors: {
          after: 'cursor123'
        },
        next: 'https://graph.threads.net/v1.0/me/threads?after=cursor123'
      }
    };

    expect(apiResponse.data).toHaveLength(1);
    expect(apiResponse.paging?.cursors.after).toBe('cursor123');
  });
});