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