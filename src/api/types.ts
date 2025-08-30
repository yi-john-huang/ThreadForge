/**
 * API Type Definitions for Threads API Integration
 * Based on Meta's Threads API data model and design specification
 */

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  isVerified: boolean;
}

export interface MediaAttachment {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  altText?: string;
}

export interface ThreadData {
  id: string;
  author: UserProfile;
  text: string;
  media?: MediaAttachment[];
  replyCount: number;
  likeCount: number;
  repostCount: number;
  timestamp: Date;
  replies?: ReplyData[];
  parentThread?: string;
}

export interface ReplyData {
  id: string;
  author: UserProfile;
  text: string;
  timestamp: Date;
  likeCount: number;
  parentReply?: string;
  nestedReplies?: ReplyData[];
  depth: number;
}

export interface SearchResult {
  id: string;
  type: 'thread' | 'user';
  relevanceScore: number;
  data: ThreadData | UserProfile;
}

export interface ThreadsAPIResponse<T> {
  data: T;
  paging?: {
    cursors: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
}

export interface APIError {
  code: number;
  message: string;
  type: string;
  error_subcode?: number;
  fbtrace_id?: string;
}

export interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  retries?: number;
}

export interface APIRequestInterceptor {
  (config: RequestConfig): Promise<RequestConfig> | RequestConfig;
}

export interface APIResponseInterceptor {
  (response: Response, data: any): Promise<any> | any;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
  windowStart: Date;
}

export interface APIServiceConfig {
  baseURL: string;
  timeout: number;
  maxRetries: number;
  rateLimitWindow: number; // 7 days in milliseconds
  rateLimitQueries: number; // 500 queries per window
}