/**
 * Thread Utilities - Task 15
 * Utilities for parsing Threads URLs and extracting thread IDs
 */

export interface ThreadUrlInfo {
  threadId: string | null;
  username?: string;
  isValid: boolean;
  source: 'direct' | 'post' | 'user-post' | 'unknown';
}

/**
 * Extracts thread ID from various Threads URL formats
 */
export function extractThreadId(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Remove query parameters and fragments
  const cleanUrl = url.split('?')[0].split('#')[0];

  // Pattern 1: Direct thread URL - https://threads.net/t/THREAD_ID/
  const directPattern = /threads\.(?:net|com)\/t\/([A-Za-z0-9_-]+)/;
  const directMatch = cleanUrl.match(directPattern);
  if (directMatch) {
    return directMatch[1];
  }

  // Pattern 2: User post URL - https://threads.net/@username/post/THREAD_ID
  const userPostPattern = /threads\.(?:net|com)\/@[^/]+\/post\/([A-Za-z0-9_-]+)/;
  const userPostMatch = cleanUrl.match(userPostPattern);
  if (userPostMatch) {
    return userPostMatch[1];
  }

  // Pattern 3: Alternative format - https://www.threads.net/@username/post/THREAD_ID
  const altUserPostPattern = /www\.threads\.(?:net|com)\/@[^/]+\/post\/([A-Za-z0-9_-]+)/;
  const altMatch = cleanUrl.match(altUserPostPattern);
  if (altMatch) {
    return altMatch[1];
  }

  return null;
}

/**
 * Parses a Threads URL and extracts comprehensive information
 */
export function parseThreadsUrl(url: string): ThreadUrlInfo {
  if (!url || typeof url !== 'string') {
    return { threadId: null, isValid: false, source: 'unknown' };
  }

  const cleanUrl = url.split('?')[0].split('#')[0];

  // Check if it's a valid threads domain
  if (!cleanUrl.match(/threads\.(?:net|com)/)) {
    return { threadId: null, isValid: false, source: 'unknown' };
  }

  // Direct thread URL
  const directMatch = cleanUrl.match(/threads\.(?:net|com)\/t\/([A-Za-z0-9_-]+)/);
  if (directMatch) {
    return {
      threadId: directMatch[1],
      isValid: true,
      source: 'direct'
    };
  }

  // User post URL with username extraction
  const userPostMatch = cleanUrl.match(/threads\.(?:net|com)\/@([^/]+)\/post\/([A-Za-z0-9_-]+)/);
  if (userPostMatch) {
    return {
      threadId: userPostMatch[2],
      username: userPostMatch[1],
      isValid: true,
      source: 'user-post'
    };
  }

  // General post pattern
  const postMatch = cleanUrl.match(/threads\.(?:net|com)\/.*\/post\/([A-Za-z0-9_-]+)/);
  if (postMatch) {
    return {
      threadId: postMatch[1],
      isValid: true,
      source: 'post'
    };
  }

  return { threadId: null, isValid: false, source: 'unknown' };
}

/**
 * Validates if a URL is a valid Threads comment/thread URL
 */
export function isValidThreadsUrl(url: string): boolean {
  const parsed = parseThreadsUrl(url);
  return parsed.isValid && parsed.threadId !== null;
}

/**
 * Generates API-friendly thread identifiers
 */
export function createThreadIdentifier(threadId: string, username?: string): string {
  if (username) {
    return `${username}:${threadId}`;
  }
  return threadId;
}

/**
 * Extracts username from Threads URL if available
 */
export function extractUsername(url: string): string | null {
  const parsed = parseThreadsUrl(url);
  return parsed.username || null;
}

/**
 * Creates a standardized thread URL from components
 */
export function createThreadUrl(threadId: string, username?: string): string {
  if (username) {
    return `https://threads.net/@${username}/post/${threadId}`;
  }
  return `https://threads.net/t/${threadId}/`;
}

/**
 * Normalizes various thread URL formats to a canonical form
 */
export function normalizeThreadUrl(url: string): string | null {
  const parsed = parseThreadsUrl(url);
  if (!parsed.isValid || !parsed.threadId) {
    return null;
  }
  
  return createThreadUrl(parsed.threadId, parsed.username);
}

/**
 * Checks if two thread URLs refer to the same thread
 */
export function isSameThread(url1: string, url2: string): boolean {
  const id1 = extractThreadId(url1);
  const id2 = extractThreadId(url2);
  
  return id1 !== null && id2 !== null && id1 === id2;
}

/**
 * Extracts thread metadata from URL context
 */
export interface ThreadMetadata {
  threadId: string;
  username?: string;
  source: string;
  timestamp?: number;
}

export function extractThreadMetadata(url: string, additionalContext?: any): ThreadMetadata | null {
  const parsed = parseThreadsUrl(url);
  if (!parsed.isValid || !parsed.threadId) {
    return null;
  }

  return {
    threadId: parsed.threadId,
    username: parsed.username,
    source: parsed.source,
    timestamp: additionalContext?.timestamp || Date.now()
  };
}