/**
 * Tests for Threads API Service
 * Requirements: 1.1 (API connection), 1.4 (error handling), 1.5 (rate limiting)
 */

import { ThreadsAPIService } from '../api/threadsApiService';
import { 
  APIServiceConfig, 
  RequestConfig, 
  APIError, 
  RateLimitInfo,
  ThreadsAPIResponse,
  ThreadData,
  UserProfile
} from '../api/types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Chrome storage for rate limiting
const mockChromeStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
};

(global as any).chrome = {
  storage: mockChromeStorage,
};

describe('ThreadsAPIService', () => {
  let apiService: ThreadsAPIService;
  let mockConfig: APIServiceConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    mockChromeStorage.local.get.mockClear();
    mockChromeStorage.local.set.mockClear();
    
    mockConfig = {
      baseURL: 'https://graph.threads.net/v1.0',
      timeout: 10000,
      maxRetries: 3,
      rateLimitWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
      rateLimitQueries: 500
    };
    
    apiService = new ThreadsAPIService(mockConfig);
  });

  describe('Constructor', () => {
    test('should initialize with provided configuration', () => {
      expect(apiService).toBeDefined();
      expect(apiService['config']).toEqual(mockConfig);
    });

    test('should use default configuration when not provided', () => {
      const defaultService = new ThreadsAPIService();
      expect(defaultService).toBeDefined();
      expect(defaultService['config'].baseURL).toBe('https://graph.threads.net/v1.0');
      expect(defaultService['config'].rateLimitQueries).toBe(500);
    });

    test('should initialize empty interceptor arrays', () => {
      expect(apiService['requestInterceptors']).toEqual([]);
      expect(apiService['responseInterceptors']).toEqual([]);
    });
  });

  describe('HTTP Client', () => {
    test('should make GET request successfully', async () => {
      const mockResponse = {
        id: 'thread123',
        text: 'Test thread',
        author: { id: 'user1', username: 'testuser' }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'x-ratelimit-remaining': '499',
          'x-ratelimit-limit': '500',
          'x-ratelimit-reset': String(Date.now() + 3600000)
        }),
        json: () => Promise.resolve(mockResponse)
      });

      const result = await apiService.request('/me/threads/thread123');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.threads.net/v1.0/me/threads/thread123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': expect.stringContaining('ThreadForge')
          }),
          signal: expect.any(AbortSignal)
        })
      );
    });

    test('should make POST request with body', async () => {
      const requestBody = { text: 'New thread content' };
      const mockResponse = { id: 'thread456', created: true };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers({
          'content-type': 'application/json',
          'x-ratelimit-remaining': '498'
        }),
        json: () => Promise.resolve(mockResponse)
      });

      const result = await apiService.request('/me/threads', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.threads.net/v1.0/me/threads',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    test('should handle request timeout', async () => {
      const timeoutConfig: APIServiceConfig = {
        ...mockConfig,
        timeout: 100
      };
      const timeoutService = new ThreadsAPIService(timeoutConfig);

      // Mock a slow response that will be aborted
      mockFetch.mockImplementation(() => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            const error = new Error('The operation was aborted.');
            error.name = 'AbortError';
            reject(error);
          }, 150);
        });
      });

      await expect(timeoutService.request('/slow-endpoint')).rejects.toThrow('Request timeout');
    }, 10000);

    test('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      await expect(apiService.request('/test')).rejects.toThrow('Failed to fetch');
    }, 10000);
  });

  describe('Request Interceptors', () => {
    test('should apply request interceptors in order', async () => {
      const interceptor1 = jest.fn((config) => ({
        ...config,
        headers: { ...config.headers, 'X-Custom-1': 'value1' }
      }));
      
      const interceptor2 = jest.fn((config) => ({
        ...config,
        headers: { ...config.headers, 'X-Custom-2': 'value2' }
      }));

      apiService.addRequestInterceptor(interceptor1);
      apiService.addRequestInterceptor(interceptor2);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: 'test' })
      });

      await apiService.request('/test');

      expect(interceptor1).toHaveBeenCalled();
      expect(interceptor2).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-1': 'value1',
            'X-Custom-2': 'value2'
          })
        })
      );
    });

    test('should handle async request interceptors', async () => {
      const asyncInterceptor = jest.fn(async (config) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          ...config,
          headers: { ...config.headers, 'X-Async': 'processed' }
        };
      });

      apiService.addRequestInterceptor(asyncInterceptor);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: 'test' })
      });

      await apiService.request('/test');

      expect(asyncInterceptor).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Async': 'processed'
          })
        })
      );
    });

    test('should add authentication header via interceptor', async () => {
      const authInterceptor = (config: RequestConfig) => ({
        ...config,
        headers: {
          ...config.headers,
          'Authorization': 'Bearer access_token_123'
        }
      });

      apiService.addRequestInterceptor(authInterceptor);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: 'authenticated' })
      });

      await apiService.request('/me');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer access_token_123'
          })
        })
      );
    });
  });

  describe('Response Interceptors', () => {
    test('should apply response interceptors in order', async () => {
      const interceptor1 = jest.fn((response, data) => ({
        ...data,
        intercepted1: true
      }));
      
      const interceptor2 = jest.fn((response, data) => ({
        ...data,
        intercepted2: true
      }));

      apiService.addResponseInterceptor(interceptor1);
      apiService.addResponseInterceptor(interceptor2);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ original: 'data' })
      });

      const result = await apiService.request('/test');

      expect(interceptor1).toHaveBeenCalled();
      expect(interceptor2).toHaveBeenCalled();
      expect(result).toEqual({
        original: 'data',
        intercepted1: true,
        intercepted2: true
      });
    });

    test('should handle async response interceptors', async () => {
      const asyncInterceptor = jest.fn(async (response, data) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          ...data,
          asyncProcessed: true
        };
      });

      apiService.addResponseInterceptor(asyncInterceptor);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: 'test' })
      });

      const result = await apiService.request('/test');

      expect(asyncInterceptor).toHaveBeenCalled();
      expect(result).toEqual({
        data: 'test',
        asyncProcessed: true
      });
    });

    test('should log requests and responses via interceptor', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const loggingInterceptor = (response: Response, data: any) => {
        console.log(`API Response: ${response.status} - ${JSON.stringify(data)}`);
        return data;
      };

      apiService.addResponseInterceptor(loggingInterceptor);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ logged: true })
      });

      await apiService.request('/test');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'API Response: 200 - {"logged":true}'
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('Rate Limiting', () => {
    test('should track rate limit from response headers', async () => {
      const resetTime = Math.floor((Date.now() + 3600000) / 1000); // Unix timestamp

      // Mock server rate limit data in storage
      mockChromeStorage.local.get.mockImplementation((keys) => {
        if (Array.isArray(keys) && keys.includes('threadforge_ratelimit_server')) {
          return Promise.resolve({
            'threadforge_ratelimit_server': {
              remaining: 450,
              limit: 500,
              resetTime: resetTime,
              lastUpdated: Date.now()
            }
          });
        }
        return Promise.resolve({});
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'x-ratelimit-remaining': '450',
          'x-ratelimit-limit': '500',
          'x-ratelimit-reset': String(resetTime)
        }),
        json: () => Promise.resolve({ data: 'test' })
      });

      await apiService.request('/test');

      const rateLimitInfo = await apiService.getRateLimitInfo();
      
      expect(rateLimitInfo.remaining).toBe(450);
      expect(rateLimitInfo.limit).toBe(500);
      expect(rateLimitInfo.resetTime.getTime()).toBe(resetTime * 1000);
    });

    test('should enforce local rate limiting', async () => {
      // Mock storage to return current usage at limit
      mockChromeStorage.local.get.mockResolvedValue({
        'threadforge_ratelimit': {
          count: 500,
          windowStart: Date.now() - 1000, // Recent window
          resetTime: Date.now() + 3600000
        }
      });

      await expect(apiService.request('/test')).rejects.toThrow('Rate limit exceeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('should reset rate limit after window expires', async () => {
      // Mock storage to return expired window first, then return updated data
      let callCount = 0;
      mockChromeStorage.local.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call - return expired data
          return Promise.resolve({
            'threadforge_ratelimit': {
              count: 500,
              windowStart: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago
              resetTime: Date.now() - 3600000 // 1 hour ago
            }
          });
        }
        // Subsequent calls - return empty (as if reset worked)
        return Promise.resolve({});
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'x-ratelimit-remaining': '499'
        }),
        json: () => Promise.resolve({ data: 'test' })
      });

      const result = await apiService.request('/test');

      expect(result).toEqual({ data: 'test' });
      expect(mockFetch).toHaveBeenCalled();
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        'threadforge_ratelimit': expect.objectContaining({
          count: 1,
          windowStart: expect.any(Number)
        })
      });
    });

    test('should increment local rate limit counter', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        'threadforge_ratelimit': {
          count: 100,
          windowStart: Date.now() - 1000,
          resetTime: Date.now() + 3600000
        }
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
          'x-ratelimit-remaining': '399'
        }),
        json: () => Promise.resolve({ data: 'test' })
      });

      await apiService.request('/test');

      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        'threadforge_ratelimit': expect.objectContaining({
          count: 101
        })
      });
    });

    test('should handle missing rate limit storage', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: 'test' })
      });

      const result = await apiService.request('/test');

      expect(result).toEqual({ data: 'test' });
      expect(mockChromeStorage.local.set).toHaveBeenCalledWith({
        'threadforge_ratelimit': expect.objectContaining({
          count: 1,
          windowStart: expect.any(Number)
        })
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle 400 Bad Request', async () => {
      const errorResponse = {
        error: {
          code: 100,
          message: 'Invalid request parameter',
          type: 'OAuthException'
        }
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(errorResponse)
      });

      await expect(apiService.request('/test')).rejects.toThrow('Invalid request parameter');
    }, 10000);

    test('should handle 401 Unauthorized', async () => {
      const errorResponse = {
        error: {
          code: 190,
          message: 'Invalid OAuth access token',
          type: 'OAuthException'
        }
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(errorResponse)
      });

      await expect(apiService.request('/test')).rejects.toThrow('Invalid OAuth access token');
    }, 10000);

    test('should handle 429 Rate Limited', async () => {
      const errorResponse = {
        error: {
          code: 32,
          message: 'Rate limit exceeded',
          type: 'OAuthException'
        }
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({
          'content-type': 'application/json',
          'retry-after': '3600'
        }),
        json: () => Promise.resolve(errorResponse)
      });

      await expect(apiService.request('/test')).rejects.toThrow('Rate limit exceeded');
    });

    test('should handle 500 Internal Server Error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({
          error: {
            code: 1,
            message: 'An unknown error occurred',
            type: 'GraphMethodException'
          }
        })
      });

      await expect(apiService.request('/test')).rejects.toThrow('An unknown error occurred');
    }, 10000);

    test('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: () => Promise.resolve('Service Unavailable')
      });

      await expect(apiService.request('/test')).rejects.toThrow('API request failed with status 503');
    }, 10000);

    test('should retry on network failures', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Failed to fetch'))
        .mockRejectedValueOnce(new Error('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ data: 'success after retry' })
        });

      const result = await apiService.request('/test');

      expect(result).toEqual({ data: 'success after retry' });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 10000);

    test('should fail after max retries exceeded', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      await expect(apiService.request('/test')).rejects.toThrow('Failed to fetch');
      expect(mockFetch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    }, 10000);
  });

  describe('Request Configuration', () => {
    test('should merge custom headers with default headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: 'test' })
      });

      await apiService.request('/test', {
        headers: {
          'X-Custom-Header': 'custom-value',
          'Authorization': 'Bearer custom-token'
        }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom-Header': 'custom-value',
            'Authorization': 'Bearer custom-token',
            'User-Agent': expect.stringContaining('ThreadForge')
          })
        })
      );
    });

    test('should handle different HTTP methods', async () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE'] as const;

      for (const method of methods) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: method === 'DELETE' ? 204 : 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ method, success: true })
        });

        await apiService.request('/test', { method });

        expect(mockFetch).toHaveBeenLastCalledWith(
          expect.any(String),
          expect.objectContaining({ method })
        );
      }
    });
  });

  describe('Utility Methods', () => {
    test('should clear rate limit data', async () => {
      await apiService.clearRateLimit();

      expect(mockChromeStorage.local.remove).toHaveBeenCalledWith(['threadforge_ratelimit']);
    });

    test('should get current rate limit status', async () => {
      const mockRateLimitData = {
        count: 150,
        limit: 500,
        windowStart: Date.now() - 3600000,
        resetTime: Date.now() + 3600000
      };

      mockChromeStorage.local.get.mockResolvedValue({
        'threadforge_ratelimit': mockRateLimitData
      });

      const rateLimitInfo = await apiService.getRateLimitInfo();

      expect(rateLimitInfo.remaining).toBe(350); // 500 - 150
      expect(rateLimitInfo.limit).toBe(500);
      expect(rateLimitInfo.resetTime.getTime()).toBe(mockRateLimitData.resetTime);
    });

    test('should check if request is allowed under rate limit', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        'threadforge_ratelimit': {
          count: 450,
          windowStart: Date.now() - 1000,
          resetTime: Date.now() + 3600000
        }
      });

      const isAllowed = await apiService.isRequestAllowed();
      expect(isAllowed).toBe(true);

      mockChromeStorage.local.get.mockResolvedValue({
        'threadforge_ratelimit': {
          count: 500,
          windowStart: Date.now() - 1000,
          resetTime: Date.now() + 3600000
        }
      });

      const isNotAllowed = await apiService.isRequestAllowed();
      expect(isNotAllowed).toBe(false);
    });
  });
});