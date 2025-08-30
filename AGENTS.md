# Repository Guidelines

## Project Structure & Module Organization
- src/: TypeScript sources. Entry points: content.ts (content script), popup.ts (extension UI), types.ts (shared types). Popup markup: src/popup.html.
- dist/: Webpack build output (content.js, popup.js, copied assets). Load this folder when testing the extension.
- manifest.json: Chrome MV3 config for permissions, content scripts, and action popup.
- icons/: Extension icons bundled via webpack copy.
- tsconfig.json, webpack.config.js: TypeScript and bundling configuration.

## Build, Test, and Development Commands
- npm run dev: Development build with watch; outputs to dist/.
- npm run build: Production build; cleans dist/ and copies manifest, popup.html, icons.
- npm run type-check: Runs tsc with no emit for strict typing.
Example local test: build, then load “dist/” via Chrome → Extensions → Developer mode → Load unpacked.

## Coding Style & Naming Conventions
- TypeScript: strict mode enabled. Prefer const, explicit types at boundaries, narrow types early.
- Indentation: 2 spaces; use semicolons; single quotes in TS/JS.
- Naming: camelCase for variables/functions, PascalCase for types/interfaces, UPPER_CASE for const enums if added.
- Files: lowercase; use hyphens for multi‑word files (e.g., comment-utils.ts).
- Keep content script DOM selectors resilient; avoid site‑fragile assumptions where possible.

## Testing Guidelines
- No test framework configured yet. For new logic, add Jest with ts-jest or provide lightweight unit tests under src/__tests__/ with *.spec.ts.
- Aim for meaningful coverage of parsing/extraction utilities; mock DOM where feasible.
- Validate type safety via npm run type-check in CI or before PRs.

## Commit & Pull Request Guidelines
- Commit style follows Conventional Commits seen in history (feat, fix, docs, chore, build). Example: feat: implement inline comment expansion content script.
- PRs should include: clear description, linked issues, before/after notes or screenshots (popup UI), and testing notes (how verified in Chrome).
- Ensure builds pass and no unused permissions are introduced in manifest.json.

## Security & Configuration Tips
- Keep host_permissions minimal (threads.com only). Avoid adding remote code execution or eval.
- Be mindful of user data; do not persist personally identifiable information.
- When adding new entry points, update webpack.config.js entries and copy patterns as needed.

