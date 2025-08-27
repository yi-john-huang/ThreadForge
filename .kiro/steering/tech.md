# ThreadForge Technology Stack

## Architecture Overview
ThreadForge is built as a Chrome Extension using Manifest V3 architecture. The extension operates through a content script injected into Threads pages and a popup interface for user control. The architecture emphasizes client-side processing with no backend dependencies.

### Extension Components
- **Content Script**: Injected into Threads pages for DOM manipulation and data extraction
- **Popup Interface**: User control panel activated via browser extension icon
- **Message Passing**: Chrome runtime messaging for communication between components
- **Storage**: Chrome storage API for potential future settings persistence

## Frontend Technology

### Core Languages & Frameworks
- **TypeScript 5.4.5**: Primary development language for type safety and modern JavaScript features
- **Chrome Extensions API**: Manifest V3 with modern security and performance standards
- **HTML5**: Popup interface structure
- **Native DOM APIs**: Direct DOM manipulation for comment extraction and button clicking

### Build Tools & Bundling
- **Webpack 5.91.0**: Module bundler for compiling TypeScript and managing assets
  - Entry points: `content.ts` and `popup.ts`
  - Output: Optimized JavaScript bundles in `dist/` directory
  - Source maps enabled for development debugging
- **ts-loader 9.5.1**: TypeScript compilation within Webpack pipeline
- **copy-webpack-plugin 12.0.2**: Asset management for manifest and icons

### Development Dependencies
```json
{
  "@types/chrome": "0.0.268",  // Chrome API type definitions
  "typescript": "5.4.5",        // TypeScript compiler
  "webpack": "5.91.0",          // Module bundler
  "webpack-cli": "5.1.4",       // Webpack command line interface
  "ts-loader": "9.5.1",         // TypeScript loader for Webpack
  "copy-webpack-plugin": "12.0.2" // Asset copying plugin
}
```

### Code Quality Tools
- **Prettier 3.5.3**: Code formatting (recently added)
- **TypeScript Strict Mode**: Enabled for maximum type safety
- **ESLint**: Planned addition for linting

## Development Environment

### Required Tools
- **Node.js**: Runtime for build tools and package management
- **npm/yarn**: Package manager for dependencies
- **Chrome Browser**: Testing environment with Developer Mode enabled
- **Code Editor**: VS Code recommended with TypeScript extensions

### Environment Setup
```bash
# Install dependencies
npm install

# Development build with watch mode
npm run watch

# Production build
npm run build

# Load extension in Chrome
1. Navigate to chrome://extensions/
2. Enable Developer Mode
3. Load unpacked from dist/ directory
```

## Common Commands

### Build Commands
- `npm run build`: Production build with optimizations
- `npm run watch`: Development build with file watching
- `npm test`: Test runner (not yet configured)

### Development Workflow
1. Make changes to TypeScript source files
2. Webpack automatically rebuilds (in watch mode)
3. Reload extension in Chrome
4. Test on threads.net

## Environment Variables
Currently, no environment variables are required. The extension operates entirely client-side with no external service dependencies.

## Port Configuration
No ports are used as this is a browser extension without a server component. All processing happens within the browser sandbox.

## Chrome Extension Manifest Configuration

### Permissions
- **storage**: For future settings persistence
- **activeTab**: Access to current tab when popup is opened
- **scripting**: Programmatic script injection capabilities

### Content Script Injection
- **Match Pattern**: `https://www.threads.net/*`
- **Run At**: Document idle (default)
- **Execution Context**: Isolated world for security

### Security Considerations
- **Content Security Policy**: Default Manifest V3 CSP
- **Host Permissions**: Limited to threads.net domain
- **Sandboxed Execution**: Content scripts run in isolated context

## Technical Constraints & Considerations

### Browser Compatibility
- **Target**: Chrome/Chromium browsers
- **Manifest Version**: V3 (latest security standards)
- **Minimum Chrome Version**: 88+ (for full Manifest V3 support)

### Performance Optimization
- **Iteration Limits**: Maximum 30 expansion iterations to prevent infinite loops
- **Delay Management**: 800ms between expansions for stability
- **Element Visibility Checks**: Prevents clicking invisible elements
- **Memory Management**: Cleanup of data attributes after processing

### DOM Interaction Strategy
- **Multiple Selector Strategies**: Handles various Threads UI variations
- **Aria Label Detection**: Accessibility-aware element finding
- **Text-based Fallbacks**: Multilingual text pattern matching
- **Recursive Traversal**: Handles deeply nested comment structures

## Development Best Practices

### Code Organization
- **Separation of Concerns**: Content script handles DOM, popup handles UI
- **Type Safety**: Full TypeScript with strict mode
- **Async/Await**: Modern asynchronous patterns for better readability
- **Error Handling**: Try-catch blocks around DOM operations

### Testing Strategy (Future Implementation)
- **Unit Tests**: For data extraction logic
- **Integration Tests**: Chrome extension testing framework
- **Manual Testing**: Regular testing on live Threads pages
- **Cross-browser Testing**: Future support for Edge/Brave

## Deployment & Distribution

### Build Output
- **Distribution Directory**: `dist/`
- **Minification**: Production builds are optimized
- **Source Maps**: Available for debugging
- **Asset Management**: Icons and manifest copied automatically

### Release Process (Future)
1. Version bump in manifest.json and package.json
2. Production build generation
3. Chrome Web Store submission
4. GitHub release with source code

## Monitoring & Debugging

### Development Tools
- **Chrome DevTools**: Console logging for content script
- **Extension DevTools**: Background page inspection
- **Source Maps**: TypeScript debugging support
- **Performance Profiling**: Chrome Performance tab

### Logging Strategy
- **Console Logging**: Extensive logging in development
- **Error Tracking**: Try-catch with detailed error messages
- **State Tracking**: Data attributes for processed elements
- **Progress Indicators**: Visual feedback in popup UI