# ThreadForge Project Structure

## Root Directory Organization

```
ThreadForge/
├── src/                    # Source code directory
├── dist/                   # Build output (gitignored)
├── icons/                  # Extension icons
├── node_modules/           # Dependencies (gitignored)
├── .claude/                # Claude AI assistant configuration
├── .kiro/                  # Kiro spec-driven development
│   ├── steering/           # Project steering documents
│   └── specs/              # Feature specifications
├── manifest.json           # Chrome extension manifest
├── webpack.config.js       # Webpack bundler configuration
├── tsconfig.json           # TypeScript configuration
├── package.json            # Node.js project configuration
├── package-lock.json       # Dependency lock file
├── README.md              # Project documentation
├── CLAUDE.md              # AI assistant instructions
└── LICENSE                # Project license
```

## Subdirectory Structures

### Source Directory (`src/`)
```
src/
├── content.ts             # Content script for Threads pages
├── popup.ts               # Popup interface logic
└── popup.html             # Popup interface markup
```

#### Purpose & Responsibility
- **content.ts**: Core functionality for comment expansion and data extraction
- **popup.ts**: User interface control and message coordination
- **popup.html**: Minimal HTML structure for extension popup

### Build Directory (`dist/`)
```
dist/
├── content.js             # Compiled content script
├── popup.js               # Compiled popup script
├── src/
│   └── popup.html         # Copied popup HTML
├── icons/                 # Copied icon assets
└── manifest.json          # Copied manifest file
```

Generated during build process, not tracked in version control.

### Configuration Directory (`.kiro/`)
```
.kiro/
├── steering/              # Project-wide AI guidance
│   ├── product.md         # Product vision and features
│   ├── tech.md            # Technology decisions
│   └── structure.md       # This file
└── specs/                 # Feature specifications
    └── [feature-name]/    # Individual feature specs
```

### Icons Directory (`icons/`)
```
icons/
├── icon16.png             # Toolbar icon (16x16)
├── icon48.png             # Extensions page icon (48x48)
└── icon128.png            # Web store icon (128x128)
```

## Code Organization Patterns

### Module Structure

#### Content Script Pattern
```typescript
// 1. Constants and Configuration
const MAX_EXPAND_ITERATIONS = 30;
const EXPAND_DELAY_MS = 800;

// 2. Type Definitions
interface CommentData { ... }

// 3. Utility Functions
function sleep(ms: number): Promise<void> { ... }
function isElementVisible(el: HTMLElement): boolean { ... }

// 4. Core Business Logic
async function runExpansionLoop(): Promise<void> { ... }
function scrapeCommentData(): CommentData[] { ... }

// 5. Message Handlers
chrome.runtime.onMessage.addListener(...);

// 6. Initialization
console.log("ThreadForge Content Script initialized");
```

#### Popup Script Pattern
```typescript
// 1. DOM Ready Handler
document.addEventListener("DOMContentLoaded", () => {
  // 2. Element References
  const showButton = document.getElementById(...);
  
  // 3. Helper Functions
  function updateUI(...) { ... }
  
  // 4. Event Handlers
  showButton.addEventListener("click", ...);
  
  // 5. Initialization Logic
  chrome.tabs.query(...);
});
```

### Async Pattern Architecture
- **Promise-based**: All asynchronous operations use Promises
- **Async/Await**: Modern syntax for cleaner async code
- **Message Passing**: Chrome runtime messaging for IPC
- **Error Boundaries**: Try-catch blocks around async operations

## File Naming Conventions

### TypeScript Files
- **Format**: `camelCase.ts`
- **Examples**: `content.ts`, `popup.ts`
- **Future**: `commentPanel.ts`, `dataExporter.ts`

### HTML Files
- **Format**: `lowercase.html`
- **Examples**: `popup.html`
- **Future**: `options.html`, `panel.html`

### Configuration Files
- **Format**: `lowercase.extension` or `lowercase.config.js`
- **Examples**: `manifest.json`, `webpack.config.js`, `tsconfig.json`

### Documentation Files
- **Format**: `UPPERCASE.md` for root, `lowercase.md` for subdirectories
- **Examples**: `README.md`, `CLAUDE.md`, `product.md`

## Import Organization

### TypeScript Import Order
```typescript
// 1. External type imports (if using external libraries)
// import type { SomeType } from 'external-lib';

// 2. Chrome API usage (global, no imports needed)
// chrome.runtime.onMessage...

// 3. Internal type definitions
interface CommentData { ... }

// 4. Constants
const MAX_ITERATIONS = 30;

// 5. Implementation
function implementation() { ... }
```

### Current Import Strategy
- **No external dependencies**: Pure TypeScript/JavaScript implementation
- **Chrome APIs**: Accessed via global `chrome` object
- **Type definitions**: Inline interfaces, no separate type files yet

### Future Import Structure
```
src/
├── types/              # Shared type definitions
├── utils/              # Shared utility functions
├── components/         # UI components
└── services/           # Business logic services
```

## Key Architectural Principles

### 1. Separation of Concerns
- **Content Script**: DOM manipulation and data extraction only
- **Popup Script**: User interface and coordination only
- **No shared state**: Communication via message passing

### 2. Progressive Enhancement
- **Graceful Degradation**: Features fail safely without breaking Threads
- **Feature Detection**: Multiple strategies for finding UI elements
- **Fallback Mechanisms**: Text-based search when selectors fail

### 3. Performance First
- **Iteration Limits**: Prevent infinite loops with MAX_ITERATIONS
- **Throttling**: Delays between operations to prevent overwhelming
- **Visibility Checks**: Skip processing of invisible elements
- **Memory Cleanup**: Remove temporary data attributes after use

### 4. User Control
- **Explicit Triggering**: Features only activate on user command
- **Visual Feedback**: Progress indicators and status messages
- **Non-destructive**: Original page functionality preserved

### 5. Defensive Programming
- **Null Checks**: Guard against missing DOM elements
- **Try-Catch Blocks**: Wrap risky operations
- **Validation**: Verify data before processing
- **Logging**: Extensive console logging for debugging

### 6. Extensibility
- **Modular Functions**: Single responsibility principle
- **Configuration Constants**: Easy adjustment of behavior
- **Message-based Architecture**: Loose coupling between components
- **Future-ready Structure**: Prepared for additional features

## Build & Deployment Structure

### Webpack Entry Points
```javascript
entry: {
  content: './src/content.ts',  // Content script entry
  popup: './src/popup.ts'        // Popup script entry
}
```

### Output Structure
```javascript
output: {
  filename: '[name].js',         // Preserves entry names
  path: path.resolve(__dirname, 'dist'),
  clean: true                    // Cleans before build
}
```

### Asset Management
- **Manifest**: Copied from root to dist
- **HTML**: Preserved in src/ subdirectory
- **Icons**: Copied to maintain structure
- **Source Maps**: Generated for debugging

## Testing Structure (Future Implementation)

### Proposed Test Organization
```
tests/
├── unit/
│   ├── content.test.ts    # Content script unit tests
│   └── popup.test.ts      # Popup script unit tests
├── integration/
│   └── extension.test.ts  # Full extension tests
└── fixtures/
    └── mockData.ts        # Test data
```

### Test Patterns
- **Unit Tests**: Pure function testing
- **Integration Tests**: Chrome API mocking
- **E2E Tests**: Actual browser automation

## Documentation Structure

### User Documentation
- **README.md**: Installation and usage guide
- **LICENSE**: MIT license terms

### Developer Documentation
- **CLAUDE.md**: AI assistant instructions
- **.kiro/steering/**: Project context and decisions
- **Code Comments**: Inline implementation details

### Specification Documents
- **.kiro/specs/**: Feature specifications
- **requirements.md**: Feature requirements
- **design.md**: Technical design
- **tasks.md**: Implementation tasks

This structure supports rapid development while maintaining code quality and preparing for future scaling.