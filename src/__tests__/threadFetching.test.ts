/**
 * Thread Fetching Tests for ThreadsAPIService
 * Tests for getThread, getThreadReplies, pagination, and response parsing
 * Requirements: 1.2 (thread data fetching), 1.3 (reply fetching), 3.2 (content display)
 */

import { ThreadsAPIService } from '../api/threadsApiService';
import { ThreadData, ReplyData, UserProfile, ThreadsAPIResponse, APIServiceConfig } from '../api/types';

// Mock chrome.storage
const mockChromeStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn()
  }
};

(global as any).chrome = {
  storage: mockChromeStorage
};

// Mock fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('ThreadsAPIService - Thread Fetching', () => {
  let apiService: ThreadsAPIService;
  
  const mockConfig: APIServiceConfig = {
    baseURL: 'https://graph.threads.net/v1.0',
    timeout: 10000,
    maxRetries: 3,
    rateLimitWindow: 7 * 24 * 60 * 60 * 1000,
    rateLimitQueries: 500
  };

  const mockUserProfile: UserProfile = {
    id: 'user123',
    username: 'testuser',
    displayName: 'Test User',
    avatar: 'https://example.com/avatar.jpg',
    isVerified: false
  };

  const mockThreadData: ThreadData = {
    id: 'thread123',
    author: mockUserProfile,
    text: 'This is a test thread',
    media: [],
    replyCount: 5,
    likeCount: 10,
    repostCount: 2,
    timestamp: new Date('2024-01-01T10:00:00Z'),
    replies: [],
    parentThread: undefined
  };

  const mockReplyData: ReplyData = {
    id: 'reply123',
    author: mockUserProfile,
    text: 'This is a test reply',
    timestamp: new Date('2024-01-01T11:00:00Z'),
    likeCount: 3,
    parentReply: undefined,
    nestedReplies: [],
    depth: 0
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiService = new ThreadsAPIService(mockConfig);
    
    // Default storage mock
    mockChromeStorage.local.get.mockResolvedValue({});
    mockChromeStorage.local.set.mockResolvedValue(undefined);
  });

  describe('getThread', () => {
    test('should fetch single thread successfully', async () => {
      const threadId = 'thread123';
      const mockAPIResponse = {
        data: {
          id: 'thread123',
          text: 'This is a test thread',
          owner: {
            id: 'user123',
            username: 'testuser'
          },
          timestamp: '2024-01-01T10:00:00+0000',
          like_count: 10,
          reply_count: 5
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockAPIResponse)
      });

      const result = await apiService.getThread(threadId);

      expect(result).toMatchObject({
        id: 'thread123',
        text: 'This is a test thread',
        author: expect.objectContaining({
          id: 'user123',
          username: 'testuser'
        }),
        likeCount: 10,
        replyCount: 5
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/${threadId}?fields=`),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    }, 10000);

    test('should include fields parameter for thread fetching', async () => {
      const threadId = 'thread123';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: mockThreadData })
      });

      await apiService.getThread(threadId);

      const fetchCall = mockFetch.mock.calls[0];
      const url = fetchCall[0];
      expect(url).toContain('fields=id,media_product_type,media_type,media_url,owner,permalink,shortcode,text,thumbnail_url,timestamp,username,children,like_count,reply_count');
    });

    test('should handle thread not found error', async () => {
      const threadId = 'nonexistent';
      
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({
          error: {
            message: 'Thread not found',
            type: 'GraphMethodException',
            code: 100
          }
        })
      });

      await expect(apiService.getThread(threadId)).rejects.toThrow('Thread not found');
    }, 10000);

    test('should handle invalid thread ID format', async () => {
      const invalidThreadId = '';
      
      await expect(apiService.getThread(invalidThreadId)).rejects.toThrow('Invalid thread ID');
    });

    test('should transform API response to ThreadData format', async () => {
      const threadId = 'thread123';
      const apiResponse = {
        data: {
          id: 'thread123',
          text: 'Test thread content',
          owner: {
            id: 'user123',
            username: 'testuser'
          },
          timestamp: '2024-01-01T10:00:00+0000',
          like_count: 10,
          reply_count: 5,
          media_type: 'TEXT',
          permalink: 'https://threads.net/@testuser/post/ABC123'
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(apiResponse)
      });

      const result = await apiService.getThread(threadId);

      expect(result).toMatchObject({
        id: 'thread123',
        text: 'Test thread content',
        author: expect.objectContaining({
          id: 'user123',
          username: 'testuser'
        }),
        timestamp: expect.any(Date),
        likeCount: 10,
        replyCount: 5
      });
    });
  });

  describe('getThreadReplies', () => {
    test('should fetch thread replies successfully', async () => {
      const threadId = 'thread123';
      const mockAPIRepliesResponse = {
        data: [
          {
            id: 'reply123',
            text: 'This is a test reply',
            owner: {
              id: 'user123',
              username: 'testuser'
            },
            timestamp: '2024-01-01T11:00:00+0000',
            like_count: 3
          }
        ],
        paging: {
          cursors: {
            after: 'cursor123'
          },
          next: 'https://graph.threads.net/v1.0/thread123/replies?after=cursor123'
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockAPIRepliesResponse)
      });

      const result = await apiService.getThreadReplies(threadId);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'reply123',
        text: 'This is a test reply',
        author: expect.objectContaining({
          id: 'user123',
          username: 'testuser'
        }),
        likeCount: 3,
        depth: 0
      });
      expect(result.paging).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/${threadId}/replies`),
        expect.any(Object)
      );
    }, 10000);

    test('should handle pagination with cursor', async () => {
      const threadId = 'thread123';
      const cursor = 'cursor123';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: [], paging: {} })
      });

      await apiService.getThreadReplies(threadId, { after: cursor });

      const fetchCall = mockFetch.mock.calls[0];
      const url = fetchCall[0];
      expect(url).toContain(`after=${cursor}`);
    });

    test('should handle pagination with limit', async () => {
      const threadId = 'thread123';
      const limit = 25;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: [], paging: {} })
      });

      await apiService.getThreadReplies(threadId, { limit });

      const fetchCall = mockFetch.mock.calls[0];
      const url = fetchCall[0];
      expect(url).toContain(`limit=${limit}`);
    });

    test('should transform API replies to ReplyData format', async () => {
      const threadId = 'thread123';
      const apiResponse = {
        data: [
          {
            id: 'reply123',
            text: 'This is a reply',
            owner: {
              id: 'user456',
              username: 'replyuser'
            },
            timestamp: '2024-01-01T11:00:00+0000',
            like_count: 3,
            reply_count: 1
          }
        ]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(apiResponse)
      });

      const result = await apiService.getThreadReplies(threadId);

      expect(result.data[0]).toMatchObject({
        id: 'reply123',
        text: 'This is a reply',
        author: expect.objectContaining({
          id: 'user456',
          username: 'replyuser'
        }),
        timestamp: expect.any(Date),
        likeCount: 3,
        depth: 0
      });
    });

    test('should handle nested replies with proper depth calculation', async () => {
      const parentReplyId = 'reply123';
      const nestedReplies = [
        {
          id: 'reply456',
          text: 'Nested reply',
          owner: { id: 'user789', username: 'nested' },
          timestamp: '2024-01-01T12:00:00+0000',
          like_count: 1,
          reply_count: 0
        }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: nestedReplies })
      });

      const result = await apiService.getThreadReplies(parentReplyId);

      expect(result.data[0].depth).toBe(1);
    });

    test('should handle empty replies response', async () => {
      const threadId = 'thread123';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: [] })
      });

      const result = await apiService.getThreadReplies(threadId);

      expect(result.data).toEqual([]);
    });
  });

  describe('Response Parsing and Data Transformation', () => {
    test('should parse media attachments correctly', async () => {
      const threadId = 'thread123';
      const apiResponse = {
        data: {
          id: 'thread123',
          text: 'Thread with image',
          owner: { id: 'user123', username: 'testuser' },
          timestamp: '2024-01-01T10:00:00+0000',
          media_type: 'IMAGE',
          media_url: 'https://example.com/image.jpg',
          thumbnail_url: 'https://example.com/thumb.jpg',
          like_count: 5,
          reply_count: 2
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(apiResponse)
      });

      const result = await apiService.getThread(threadId);

      expect(result.media).toBeDefined();
      expect(result.media![0]).toMatchObject({
        type: 'image',
        url: 'https://example.com/image.jpg',
        thumbnailUrl: 'https://example.com/thumb.jpg'
      });
    });

    test('should handle video media attachments', async () => {
      const threadId = 'thread123';
      const apiResponse = {
        data: {
          id: 'thread123',
          text: 'Thread with video',
          owner: { id: 'user123', username: 'testuser' },
          timestamp: '2024-01-01T10:00:00+0000',
          media_type: 'VIDEO',
          media_url: 'https://example.com/video.mp4',
          thumbnail_url: 'https://example.com/video_thumb.jpg',
          like_count: 8,
          reply_count: 3
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(apiResponse)
      });

      const result = await apiService.getThread(threadId);

      expect(result.media![0].type).toBe('video');
    });

    test('should handle missing or null fields gracefully', async () => {
      const threadId = 'thread123';
      const incompleteResponse = {
        data: {
          id: 'thread123',
          text: null,
          owner: { id: 'user123', username: 'testuser' },
          timestamp: '2024-01-01T10:00:00+0000'
          // Missing like_count, reply_count, etc.
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(incompleteResponse)
      });

      const result = await apiService.getThread(threadId);

      expect(result.text).toBe('');
      expect(result.likeCount).toBe(0);
      expect(result.replyCount).toBe(0);
      expect(result.repostCount).toBe(0);
    });

    test('should parse timestamps correctly', async () => {
      const threadId = 'thread123';
      const apiResponse = {
        data: {
          id: 'thread123',
          text: 'Test thread',
          owner: { id: 'user123', username: 'testuser' },
          timestamp: '2024-01-15T14:30:45+0000',
          like_count: 0,
          reply_count: 0
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(apiResponse)
      });

      const result = await apiService.getThread(threadId);

      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.timestamp.toISOString()).toBe('2024-01-15T14:30:45.000Z');
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed API response', async () => {
      const threadId = 'thread123';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ invalid: 'response' })
      });

      await expect(apiService.getThread(threadId)).rejects.toThrow('Invalid API response format');
    });

    test('should handle network errors during thread fetching', async () => {
      const threadId = 'thread123';

      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      await expect(apiService.getThread(threadId)).rejects.toThrow('Failed to fetch');
    }, 10000);

    test('should handle API rate limiting for thread requests', async () => {
      const threadId = 'thread123';

      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({
          'content-type': 'application/json',
          'retry-after': '3600'
        }),
        json: () => Promise.resolve({
          error: {
            message: 'Rate limit exceeded',
            type: 'GraphMethodException',
            code: 4
          }
        })
      });

      await expect(apiService.getThread(threadId)).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Pagination', () => {
    test('should handle paginated thread replies', async () => {
      const threadId = 'thread123';
      const mockPaginatedResponse = {
        data: [mockReplyData],
        paging: {
          cursors: {
            before: 'before_cursor',
            after: 'after_cursor'
          },
          next: `https://graph.threads.net/v1.0/${threadId}/replies?after=after_cursor`,
          previous: `https://graph.threads.net/v1.0/${threadId}/replies?before=before_cursor`
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockPaginatedResponse)
      });

      const result = await apiService.getThreadReplies(threadId);

      expect(result.paging).toBeDefined();
      expect(result.paging!.next).toBe(mockPaginatedResponse.paging.next);
      expect(result.paging!.previous).toBe(mockPaginatedResponse.paging.previous);
      expect(result.paging!.cursors.after).toBe('after_cursor');
    });

    test('should fetch next page of replies using pagination cursor', async () => {
      const threadId = 'thread123';
      const nextCursor = 'next_page_cursor';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: [], paging: {} })
      });

      await apiService.getThreadReplies(threadId, { after: nextCursor, limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`after=${nextCursor}`),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
    });

    test('should handle end of pagination gracefully', async () => {
      const threadId = 'thread123';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({
          data: [],
          paging: {} // No next/previous URLs
        })
      });

      const result = await apiService.getThreadReplies(threadId);

      expect(result.data).toEqual([]);
      expect(result.paging?.next).toBeUndefined();
    });
  });

  describe('Integration with Rate Limiting', () => {
    test('should respect rate limits when fetching threads', async () => {
      // Mock rate limit exceeded scenario
      mockChromeStorage.local.get.mockResolvedValue({
        'threadforge_ratelimit': {
          count: 500,
          windowStart: Date.now() - 1000,
          resetTime: Date.now() + 3600000
        }
      });

      await expect(apiService.getThread('thread123')).rejects.toThrow('Rate limit exceeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should increment rate limit counter after successful thread fetch', async () => {
      const threadId = 'thread123';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: mockThreadData })
      });

      await apiService.getThread(threadId);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        'threadforge_ratelimit': expect.objectContaining({
          count: expect.any(Number)
        })
      });
    });
  });
});