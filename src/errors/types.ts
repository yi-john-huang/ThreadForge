/**
 * Error Type Definitions for Error Handling System
 * Based on comprehensive error recovery requirements
 */

export enum ErrorType {
  AUTHENTICATION_FAILED = 'auth_failed',
  API_REQUEST_FAILED = 'api_failed',
  RATE_LIMIT_EXCEEDED = 'rate_limit',
  NETWORK_UNAVAILABLE = 'network_error',
  CACHE_CORRUPTION = 'cache_error',
  PARSING_ERROR = 'parse_error',
  PERMISSION_DENIED = 'permission_denied',
  QUOTA_EXCEEDED = 'quota_exceeded'
}

export interface ErrorContext {
  type: ErrorType;
  message: string;
  recoverable: boolean;
  retryAfter?: number;
  fallbackAvailable: boolean;
  debugInfo?: any;
  timestamp?: Date;
  userId?: string;
}

export interface UserMessage {
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'error';
  actions?: UserMessageAction[];
  dismissible: boolean;
}

export interface UserMessageAction {
  label: string;
  action: 'retry' | 'fallback' | 'settings' | 'dismiss' | 'external';
  url?: string;
  callback?: () => void;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffMultiplier: number;
  initialDelay: number;
  maxDelay: number;
}

export interface FallbackOption {
  type: 'dom_scraping' | 'cached_data' | 'offline_mode';
  available: boolean;
  description: string;
}