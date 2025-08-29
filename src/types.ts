// Type definitions for ThreadForge UI Improver

export interface CommentData {
  id: string;
  author: string | null;
  text: string | null;
  timestamp: string | null;
  url?: string;
  replies?: CommentData[];
}

export interface ExtensionSettings {
  enableInlineExpansion: boolean;
  autoExpandReplies: boolean;
  maxReplyDepth: number;
}

export interface ClickInterceptionResult {
  intercepted: boolean;
  commentUrl?: string;
  element?: HTMLElement;
}

export interface CommentExtractorOptions {
  maxDepth: number;
  includeReplies: boolean;
}