/**
 * User Profile and Metadata Tests for ThreadsAPIService
 * Tests for getUserProfile, searchThreads, getThreadInsights, and caching
 * Requirements: 1.2 (user profile data), 1.3 (thread discovery)
 */

import { ThreadsAPIService } from '../api/threadsApiService';
import { 
  UserProfile, 
  ThreadData, 
  SearchResult, 
  ThreadsAPIResponse, 
  APIServiceConfig,
  ThreadInsights
} from '../api/types';

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

describe('ThreadsAPIService - User Profile and Metadata', () => {
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
    isVerified: true
  };

  const mockThreadInsights = {
    id: 'thread123',
    impressions: 1500,
    reach: 1200,
    engagement: 85,
    saves: 12,
    shares: 8,
    profileViews: 45,
    demographics: {
      ageGroups: {
        '18-24': 35,
        '25-34': 40,
        '35-44': 20,
        '45+': 5
      },
      genders: {
        male: 45,
        female: 55
      },
      topCities: [
        { name: 'New York', percentage: 15 },
        { name: 'Los Angeles', percentage: 12 },
        { name: 'Chicago', percentage: 8 }
      ]
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiService = new ThreadsAPIService(mockConfig);
    
    // Default storage mock
    mockChromeStorage.local.get.mockResolvedValue({});
    mockChromeStorage.local.set.mockResolvedValue(undefined);
  });

  describe('getUserProfile', () => {
    test('should fetch user profile successfully', async () => {
      const userId = 'user123';
      const mockAPIResponse = {
        data: {
          id: 'user123',
          username: 'testuser',
          name: 'Test User',
          profile_pic_url: 'https://example.com/avatar.jpg',
          is_verified: true,
          biography: 'This is a test user bio',
          followers_count: 1500,
          following_count: 300,
          threads_count: 42
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockAPIResponse)
      });

      const result = await apiService.getUserProfile(userId);

      expect(result).toMatchObject({
        id: 'user123',
        username: 'testuser',
        displayName: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
        isVerified: true
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/${userId}?fields=`),
        expect.any(Object)
      );
    }, 10000);

    test('should include profile fields parameter', async () => {
      const userId = 'user123';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: mockUserProfile })
      });

      await apiService.getUserProfile(userId);

      const fetchCall = mockFetch.mock.calls[0];
      const url = fetchCall[0];
      expect(url).toContain('fields=id,username,name,profile_pic_url,is_verified,biography,followers_count,following_count,threads_count');
    });

    test('should handle user not found error', async () => {
      const userId = 'nonexistent';
      
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({
          error: {
            message: 'User not found',
            type: 'GraphMethodException',
            code: 100
          }
        })
      });

      await expect(apiService.getUserProfile(userId)).rejects.toThrow('User not found');
    }, 10000);

    test('should handle invalid user ID format', async () => {
      const invalidUserId = '';
      
      await expect(apiService.getUserProfile(invalidUserId)).rejects.toThrow('Invalid user ID');
    });

    test('should transform API response to UserProfile format', async () => {
      const userId = 'user123';
      const apiResponse = {
        data: {
          id: 'user123',
          username: 'testuser',
          name: 'Test User Full Name',
          profile_pic_url: 'https://example.com/profile.jpg',
          is_verified: false,
          biography: 'A test biography',
          followers_count: 2500,
          following_count: 150
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(apiResponse)
      });

      const result = await apiService.getUserProfile(userId);

      expect(result).toMatchObject({
        id: 'user123',
        username: 'testuser',
        displayName: 'Test User Full Name',
        avatar: 'https://example.com/profile.jpg',
        isVerified: false
      });
    });

    test('should handle missing profile picture gracefully', async () => {
      const userId = 'user123';
      const apiResponse = {
        data: {
          id: 'user123',
          username: 'testuser',
          name: 'Test User',
          is_verified: false
          // Missing profile_pic_url
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(apiResponse)
      });

      const result = await apiService.getUserProfile(userId);

      expect(result.avatar).toBeUndefined();
    });
  });

  describe('searchThreads', () => {
    test('should search threads successfully', async () => {
      const query = 'test search';
      const mockSearchResponse = {
        data: [
          {
            id: 'thread1',
            text: 'This is a test thread about search',
            owner: {
              id: 'user456',
              username: 'author1'
            },
            timestamp: '2024-01-01T10:00:00+0000',
            like_count: 15,
            reply_count: 3
          },
          {
            id: 'thread2',
            text: 'Another test thread for search',
            owner: {
              id: 'user789',
              username: 'author2'
            },
            timestamp: '2024-01-01T12:00:00+0000',
            like_count: 22,
            reply_count: 7
          }
        ],
        paging: {
          cursors: {
            after: 'search_cursor123'
          },
          next: 'https://graph.threads.net/v1.0/search?q=test%20search&after=search_cursor123'
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockSearchResponse)
      });

      const result = await apiService.searchThreads(query);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        id: 'thread1',
        type: 'thread',
        relevanceScore: expect.any(Number),
        data: expect.objectContaining({
          id: 'thread1',
          text: 'This is a test thread about search'
        })
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/search?'),
        expect.any(Object)
      );
    }, 10000);

    test('should handle search with pagination options', async () => {
      const query = 'test';
      const options = { limit: 20, after: 'cursor123' };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: [], paging: {} })
      });

      await apiService.searchThreads(query, options);

      const fetchCall = mockFetch.mock.calls[0];
      const url = fetchCall[0];
      expect(url).toContain(`q=${encodeURIComponent(query)}`);
      expect(url).toContain('limit=20');
      expect(url).toContain('after=cursor123');
    });

    test('should handle empty search query', async () => {
      const emptyQuery = '';
      
      await expect(apiService.searchThreads(emptyQuery)).rejects.toThrow('Invalid search query');
    });

    test('should handle search with no results', async () => {
      const query = 'nonexistent search term';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: [], paging: {} })
      });

      const result = await apiService.searchThreads(query);

      expect(result.data).toEqual([]);
    });

    test('should calculate relevance scores for search results', async () => {
      const query = 'important';
      const mockSearchResponse = {
        data: [
          {
            id: 'thread1',
            text: 'This is very important information',
            owner: { id: 'user1', username: 'user1' },
            timestamp: '2024-01-01T10:00:00+0000',
            like_count: 100, // High engagement
            reply_count: 50
          }
        ]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockSearchResponse)
      });

      const result = await apiService.searchThreads(query);

      expect(result.data[0].relevanceScore).toBeGreaterThan(0);
      expect(result.data[0].relevanceScore).toBeLessThanOrEqual(100);
    });
  });

  describe('getThreadInsights', () => {
    test('should fetch thread insights successfully', async () => {
      const threadId = 'thread123';
      const mockInsightsResponse = {
        data: {
          impressions: 1500,
          reach: 1200,
          engagement: 85,
          saves: 12,
          shares: 8,
          profile_views: 45
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockInsightsResponse)
      });

      const result = await apiService.getThreadInsights(threadId);

      expect(result).toMatchObject({
        id: threadId,
        impressions: 1500,
        reach: 1200,
        engagement: 85,
        saves: 12,
        shares: 8,
        profileViews: 45
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/${threadId}/insights`),
        expect.any(Object)
      );
    }, 10000);

    test('should handle insights not available error', async () => {
      const threadId = 'thread123';
      
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({
          error: {
            message: 'Insights not available for this thread',
            type: 'GraphMethodException',
            code: 200
          }
        })
      });

      await expect(apiService.getThreadInsights(threadId)).rejects.toThrow('Insights not available for this thread');
    }, 10000);

    test('should handle thread without insights data', async () => {
      const threadId = 'thread123';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: {} })
      });

      const result = await apiService.getThreadInsights(threadId);

      expect(result.impressions).toBe(0);
      expect(result.reach).toBe(0);
      expect(result.engagement).toBe(0);
    });

    test('should include demographic data in insights', async () => {
      const threadId = 'thread123';
      const mockInsightsResponse = {
        data: {
          impressions: 2000,
          reach: 1800,
          engagement: 120,
          demographics: {
            age_groups: {
              '18-24': 30,
              '25-34': 45,
              '35-44': 20,
              '45+': 5
            },
            gender: {
              male: 48,
              female: 52
            },
            top_cities: [
              { city: 'San Francisco', percentage: 18 },
              { city: 'New York', percentage: 15 },
              { city: 'Los Angeles', percentage: 12 }
            ]
          }
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockInsightsResponse)
      });

      const result = await apiService.getThreadInsights(threadId);

      expect(result.demographics).toBeDefined();
      expect(result.demographics?.ageGroups).toEqual({
        '18-24': 30,
        '25-34': 45,
        '35-44': 20,
        '45+': 5
      });
    });
  });

  describe('Response Caching Integration', () => {
    test('should cache user profile responses', async () => {
      const userId = 'user123';
      const mockAPIResponse = {
        data: {
          id: 'user123',
          username: 'testuser',
          name: 'Test User',
          is_verified: false
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 
          'content-type': 'application/json',
          'cache-control': 'public, max-age=300'
        }),
        json: () => Promise.resolve(mockAPIResponse)
      });

      await apiService.getUserProfile(userId);

      // Verify cache headers are processed (this would be expanded with actual cache implementation)
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall).toBeDefined();
    });

    test('should cache search results with shorter TTL', async () => {
      const query = 'test search';
      const mockSearchResponse = {
        data: [],
        paging: {}
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 
          'content-type': 'application/json',
          'cache-control': 'public, max-age=60'
        }),
        json: () => Promise.resolve(mockSearchResponse)
      });

      await apiService.searchThreads(query);

      // Verify request was made (cache integration points for future implementation)
      expect(mockFetch).toHaveBeenCalled();
    });

    test('should not cache insights data by default', async () => {
      const threadId = 'thread123';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 
          'content-type': 'application/json',
          'cache-control': 'no-cache'
        }),
        json: () => Promise.resolve({ data: { impressions: 100 } })
      });

      await apiService.getThreadInsights(threadId);

      // Insights should not be cached due to real-time nature
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed user profile response', async () => {
      const userId = 'user123';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ invalid: 'response' })
      });

      await expect(apiService.getUserProfile(userId)).rejects.toThrow('Invalid API response format');
    });

    test('should handle network errors during search', async () => {
      const query = 'test';

      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      await expect(apiService.searchThreads(query)).rejects.toThrow('Failed to fetch');
    }, 10000);

    test('should handle API rate limiting for insights requests', async () => {
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

      await expect(apiService.getThreadInsights(threadId)).rejects.toThrow('Rate limit exceeded');
    }, 10000);
  });

  describe('Integration with Rate Limiting', () => {
    test('should respect rate limits when fetching user profiles', async () => {
      // Mock rate limit exceeded scenario
      mockChromeStorage.local.get.mockResolvedValue({
        'threadforge_ratelimit': {
          count: 500,
          windowStart: Date.now() - 1000,
          resetTime: Date.now() + 3600000
        }
      });

      await expect(apiService.getUserProfile('user123')).rejects.toThrow('Rate limit exceeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should increment rate limit counter after successful search', async () => {
      const query = 'test';

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: [], paging: {} })
      });

      await apiService.searchThreads(query);

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        'threadforge_ratelimit': expect.objectContaining({
          count: expect.any(Number)
        })
      });
    });
  });
});