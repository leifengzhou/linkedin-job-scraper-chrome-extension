# Repository Guidelines

## Project Structure & Module Organization

This repository is a source-only Chrome Extension (Manifest V3); there is no build output or `src/` directory. Keep the top-level layout stable:

- `manifest.json`: extension entry point, permissions, content script registration
- `popup.html` / `popup.js`: popup UI and start/stop controls
- `content_script.js`: LinkedIn scraping logic and DOM interaction
- `background.js`: service worker handling `chrome.downloads`
- `icons/`: packaged extension icons
- `README.md`: install, usage, and architecture notes

## Build, Test, and Development Commands

There is no `npm`/bundler workflow. Develop by loading the repository directly in Chrome:

- `chrome://extensions` -> enable Developer Mode -> `Load unpacked`
- After any code change, click reload on the extension card
- Refresh the active LinkedIn Jobs tab after reloading, or the old content script context will remain stale

Use `git status` before and after edits to avoid mixing unrelated changes.

## Coding Style & Naming Conventions

Match the existing plain JavaScript style:

- 2-space indentation
- semicolons required
- double quotes for strings unless template literals improve clarity
- `camelCase` for variables and functions, descriptive names like `activeTabId` and `setScrapingState`

Prefer stable LinkedIn selectors (`data-testid`, `aria-label`, `role`, `componentkey`) over hashed class names. Keep popup/background/content-script responsibilities separated instead of cross-loading logic.

## Testing Guidelines

There is no automated test suite yet. Verify changes manually in Chrome on `https://www.linkedin.com/jobs/*`.

- Reload the unpacked extension
- Refresh the LinkedIn tab
- Start a scrape from the popup
- Confirm progress updates, pagination behavior, and Markdown downloads in `~/Downloads/scraped-jobs/YYYY-MM-DD/`

When fixing scraper behavior, test against multiple job cards to catch stale right-panel data and selector regressions.

## Commit & Pull Request Guidelines

Recent commits use short, imperative subjects such as `Fix stale right-panel data causing description cross-contamination`. Follow that pattern.

Pull requests should include:

- a brief problem/solution summary
- manual test steps and results
- screenshots or short recordings for popup UI changes
- linked issue or context when the change is not self-explanatory
