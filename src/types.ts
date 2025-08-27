// TypeScript interfaces and data models for ThreadForge Enhanced Comment Expansion

// Core comment data structure with nested replies
export interface CommentData {
  id: string;                    // Unique identifier
  author: string | null;          // Comment author username
  text: string | null;           // Comment text content
  timestamp: string | null;      // ISO timestamp
  replies: CommentData[];        // Nested replies
  depth?: number;                // Nesting level (calculated)
  isExpanded?: boolean;          // UI state
  matchesSearch?: boolean;       // Search state
}

// Current state of the rendered overlay
export interface OverlayState {
  isVisible: boolean;           // Overlay visibility
  isLoading: boolean;          // Loading state
  comments: CommentData[];     // All comments
  expandedThreads: Set<string>; // Expanded thread IDs
  searchQuery: string;         // Current search
  theme: 'light' | 'dark';    // Active theme
}

// Expansion progress tracking
export interface ExpandState {
  iterationCount: number;        // Current iteration
  expandedCount: number;         // Total expanded elements
  startTime: number;            // Expansion start timestamp
  timeoutId?: number;           // Timeout reference
  status: 'idle' | 'expanding' | 'complete' | 'timeout';
}

// Performance monitoring data
export interface PerformanceMetrics {
  expansionDuration: number;    // Time to expand all
  renderDuration: number;       // Time to render overlay
  commentCount: number;        // Total comments
  memoryUsage: number;         // Estimated memory MB
  virtualScrollEnabled: boolean; // Performance mode active
}

// Virtual scroll viewport tracking
export interface ViewportState {
  startIndex: number;
  endIndex: number;
  scrollTop: number;
  itemHeight: number;
  containerHeight: number;
}

// Error categorization for better error handling
export enum ErrorType {
  EXPANSION_TIMEOUT = 'EXPANSION_TIMEOUT',
  DOM_NOT_FOUND = 'DOM_NOT_FOUND',
  PARSING_ERROR = 'PARSING_ERROR',
  MEMORY_LIMIT = 'MEMORY_LIMIT',
  NETWORK_ERROR = 'NETWORK_ERROR'
}