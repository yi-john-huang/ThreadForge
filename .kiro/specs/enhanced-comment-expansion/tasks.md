# Implementation Plan

## Core Infrastructure

- [x] 1. Create TypeScript interfaces and data models
  - Add CommentData interface with id, author, text, timestamp, replies fields to content.ts
  - Create OverlayState, ExpandState, and PerformanceMetrics interfaces
  - Add ViewportState interface for virtual scrolling support
  - Create ErrorType enum for error categorization
  - Write unit tests for data model validation
  - _Requirements: All requirements need foundational data structures_

- [x] 2. Implement CSS-in-JS styling system
  - Create getOverlayStyles() function returning template literal CSS
  - Define light and dark theme color variables
  - Add responsive breakpoints and z-index management
  - Create animation keyframes for overlay transitions
  - Test style injection and isolation from Threads page
  - _Requirements: 1.2, 1.3, 4.1, 4.2_

## Overlay Management

- [x] 3. Build OverlayManager class
  - Implement createOverlay() to generate DOM structure with backdrop and content panel
  - Add showOverlay() with fade-in animation and scroll position preservation
  - Create hideOverlay() with cleanup of event listeners and DOM elements
  - Implement setLoading() to toggle loading spinner visibility
  - Write tests for overlay lifecycle and DOM manipulation
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.8_

- [ ] 4. Implement overlay event handlers
  - Add Escape key listener for overlay closure
  - Implement click-outside-to-close functionality
  - Create close button (X) in top-right corner
  - Set up focus trap to keep keyboard navigation within overlay
  - Test all closing mechanisms and event propagation
  - _Requirements: 1.5, 1.6, 1.7_

## Expansion Engine Enhancement

- [ ] 5. Enhance ExpansionEngine with timeout and retry logic
  - Modify findExpandElements() to use multiple fallback selectors
  - Implement expandWithTimeout() with 60-second timeout mechanism
  - Add retryWithBackoff() for exponential backoff (1s, 2s, 4s delays)
  - Create progress tracking with iteration counter
  - Write tests for timeout scenarios and retry behavior
  - _Requirements: 2.1, 2.2, 2.5, 2.6, 5.5_

- [ ] 6. Optimize expansion iteration logic
  - Implement 500ms minimum delay between clicks
  - Add detection for newly loaded comment sections via MutationObserver
  - Limit expansion to 10 levels deep or 30 total iterations
  - Add 1500ms wait-and-retry for no new elements found
  - Test recursive expansion and iteration limits
  - _Requirements: 2.2, 2.3, 2.4, 2.5_

- [ ] 7. Enhance comment data extraction
  - Update scrapeCommentData() to handle nested div[role="article"] elements
  - Extract author, text, timestamp from comment elements
  - Build hierarchical reply structure with parent-child relationships
  - Add data validation to filter invalid/empty comments
  - Write tests for various comment structures and edge cases
  - _Requirements: 2.7, 3.4_

## Comment Rendering

- [ ] 8. Create CommentRenderer class
  - Implement renderComment() with indentation based on depth level
  - Build renderThread() to create hierarchical comment tree
  - Add distinct visual treatment for main post (larger font, border)
  - Implement 20-40px indentation per nesting level
  - Test rendering with various comment hierarchies
  - _Requirements: 3.1, 3.2, 3.8_

- [ ] 9. Implement comment collapsing and expansion
  - Add collapseThread() to hide replies with count indicator
  - Create expandThread() to show hidden replies
  - Auto-collapse threads with more than 20 replies initially
  - Add "Show more replies" button for comments beyond 5 levels deep
  - Test thread state management and UI updates
  - _Requirements: 3.3, 3.5, 3.6_

- [ ] 10. Add text truncation for long comments
  - Implement truncateText() for comments over 500 characters
  - Create "Read more" / "Read less" toggle functionality
  - Preserve formatting and line breaks in truncated text
  - Add smooth height transitions for expand/collapse
  - Test with various text lengths and formats
  - _Requirements: 3.7_

## Theme and Visual Design

- [ ] 11. Build ThemeManager service
  - Implement detectColorScheme() using window.matchMedia
  - Create applyTheme() to inject appropriate CSS variables
  - Build getStyles() returning theme-specific CSS strings
  - Add formatTimestamp() for relative time display ("2 hours ago")
  - Test theme detection and switching behavior
  - _Requirements: 4.2, 4.4_

- [ ] 12. Enhance visual styling and typography
  - Set minimum 14px font size with system font stack
  - Style author names in bold with distinct color
  - Add subtle connecting lines for direct replies
  - Implement hover effects with background color changes
  - Test readability and visual hierarchy
  - _Requirements: 4.1, 4.3, 4.5, 4.6, 4.7_

## Performance Optimization

- [ ] 13. Implement PerformanceOptimizer class
  - Create initVirtualScroll() using IntersectionObserver API
  - Build viewport calculation for visible comment range
  - Implement lazy rendering for comments outside viewport
  - Add cleanupDOMReferences() to clear WeakMap entries
  - Test with 100+ comments for performance metrics
  - _Requirements: 5.1, 5.4_

- [ ] 14. Add memory management and error handling
  - Implement throttleFunction() utility for scroll events
  - Create batchDOMUpdates() using requestAnimationFrame
  - Add try-catch blocks with error logging and recovery
  - Implement fallback selectors for DOM structure changes
  - Test memory usage and error recovery scenarios
  - _Requirements: 5.2, 5.3, 5.6, 5.7_

## User Interactions

- [ ] 15. Build InteractionController class
  - Implement initSearch() with search input field
  - Create filterComments() for real-time filtering
  - Add highlightMatches() with yellow background highlighting
  - Build navigation buttons for jumping between matches
  - Test search performance and match highlighting
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 16. Add keyboard navigation support
  - Implement arrow key navigation between comments
  - Add Enter key to expand/collapse threads
  - Create Tab navigation for interactive elements
  - Ensure Escape key closes overlay from any focus state
  - Test keyboard accessibility and focus management
  - _Requirements: 6.8, 1.5_

- [ ] 17. Implement additional user controls
  - Add right-click context menu with "Copy text" option
  - Create comment count indicator for 50+ comments
  - Build "Collapse all" button functionality
  - Add placeholder for future export button (JSON/CSV)
  - Test all interactive controls and user feedback
  - _Requirements: 6.4, 6.5, 6.6, 6.7_

## Integration and Message Handling

- [ ] 18. Update content script message handling
  - Modify existing gatherComments handler to use enhanced ExpansionEngine
  - Integrate OverlayManager creation after expansion completes
  - Add progress updates via chrome.runtime.sendMessage
  - Implement overlay lifecycle messages (opened/closed)
  - Test complete message flow from popup to overlay display
  - _Requirements: 1.1, 2.1, 2.7_

- [ ] 19. Enhance popup script coordination
  - Update button click handler to show enhanced loading state
  - Add progress bar updates from content script messages
  - Implement error handling with user-friendly messages
  - Maintain backward compatibility with existing functionality
  - Test popup-content script communication scenarios
  - _Requirements: 1.8, 5.7_

## Testing and Validation

- [ ] 20. Create comprehensive integration tests
  - Write tests for complete expansion-to-display flow
  - Test overlay with various comment counts (0, 50, 100+)
  - Validate all keyboard shortcuts and mouse interactions
  - Test theme switching and responsive behavior
  - Verify memory cleanup and performance targets
  - _Requirements: All requirements need integration validation_

- [ ] 21. Add unit tests for all components
  - Test OverlayManager DOM manipulation methods
  - Validate ExpansionEngine timeout and retry logic
  - Test CommentRenderer hierarchy building
  - Verify ThemeManager style generation
  - Test PerformanceOptimizer virtual scrolling
  - _Requirements: All requirements need unit test coverage_