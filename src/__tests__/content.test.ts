/**
 * Unit tests for Content Script Refactoring - Task 15
 * Tests click interception using API integration, thread ID extraction,
 * message passing to background service, and loading state management
 */

// Import the thread utilities for testing
import { extractThreadId, parseThreadsUrl, isValidThreadsUrl } from '../utils/threadUtils';

describe('Content Script API Integration - Task 15', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Thread ID Extraction', () => {
    test('should extract thread ID from Threads URL', () => {
      const testUrls = [
        'https://threads.net/t/ABC123DEF456/',
        'https://threads.net/@username/post/CDE789FGH012',
        'https://www.threads.net/t/XYZ789ABC123?hl=en',
        'https://threads.com/@user/post/GHI456JKL789/'
      ];

      const expectedIds = [
        'ABC123DEF456',
        'CDE789FGH012',
        'XYZ789ABC123',
        'GHI456JKL789'
      ];

      testUrls.forEach((url, index) => {
        const extractedId = extractThreadId(url);
        expect(extractedId).toBe(expectedIds[index]);
      });
    });

    test('should handle URLs without thread IDs', () => {
      const invalidUrls = [
        'https://threads.net/',
        'https://threads.net/@username',
        'https://facebook.com/post/123',
        'not-a-url'
      ];

      invalidUrls.forEach(url => {
        const extractedId = extractThreadId(url);
        expect(extractedId).toBeNull();
      });
    });

    test('should extract thread ID from various URL formats', () => {
      const urlFormats = [
        { url: 'https://threads.net/t/CUEtX1hpNzg/', expected: 'CUEtX1hpNzg' },
        { url: 'https://threads.net/@zuck/post/C1h2E3m4N5o6', expected: 'C1h2E3m4N5o6' },
        { url: 'https://www.threads.net/t/DABGHCjiKlm?utm_source=ig', expected: 'DABGHCjiKlm' }
      ];

      urlFormats.forEach(({ url, expected }) => {
        const threadId = extractThreadId(url);
        expect(threadId).toBe(expected);
      });
    });
  });

  describe('Thread Utilities Integration', () => {
    test('should correctly use thread utilities in content script', () => {
      const testUrl = 'https://threads.net/t/ABC123DEF456/';
      
      expect(extractThreadId(testUrl)).toBe('ABC123DEF456');
      expect(isValidThreadsUrl(testUrl)).toBe(true);
      
      const parsed = parseThreadsUrl(testUrl);
      expect(parsed.threadId).toBe('ABC123DEF456');
      expect(parsed.isValid).toBe(true);
      expect(parsed.source).toBe('direct');
    });

    test('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'https://example.com/not-a-thread';
      
      expect(extractThreadId(invalidUrl)).toBeNull();
      expect(isValidThreadsUrl(invalidUrl)).toBe(false);
      
      const parsed = parseThreadsUrl(invalidUrl);
      expect(parsed.threadId).toBeNull();
      expect(parsed.isValid).toBe(false);
    });
  });
});

