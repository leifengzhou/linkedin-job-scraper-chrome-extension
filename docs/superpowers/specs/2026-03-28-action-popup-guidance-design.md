# Action Popup Guidance Design

**Date:** 2026-03-28
**Status:** Draft

## Overview

Add a real Chrome action popup so clicking the extension icon always opens a native extension menu. The popup should guide the user through the scraper setup flow, including signing in to LinkedIn, opening LinkedIn Jobs, searching for a specific role, and applying filters such as location and date posted before scraping.

The existing in-page scraper modal must remain unchanged. On supported LinkedIn Jobs search pages, the popup should enable a `Ready to Scrape` button that opens the existing in-page modal on demand. On all other pages, the popup should still open, show the same guidance, and keep `Ready to Scrape` disabled.

## Goals

- Make the extension icon respond consistently on every page.
- Teach the user where the scraper works without exposing internal URL pattern details.
- Keep setup instructions inside the extension popup only, not in the in-page modal.
- Preserve the current in-page scraper modal and its behavior once opened.
- Require an explicit user click on `Ready to Scrape` before opening the in-page modal.

## Non-Goals

- Redesigning the existing in-page scraper modal.
- Moving scrape controls or progress display back into the popup.
- Explaining the two supported LinkedIn URL variants directly to the user.
- Auto-opening the in-page modal when the popup appears.

## User Experience

### Popup Entry Point

- `manifest.json` should configure the action to use `popup.html` as `default_popup`.
- Clicking the extension icon should always open the popup, regardless of the active tab.

### Popup Content

The popup should always show:

- a primary button labeled `Go to LinkedIn Jobs` that opens `https://www.linkedin.com/jobs/search/`
- short instructions telling the user to:
  - sign in to LinkedIn first
  - search for a specific job title or role
  - apply filters such as location and date posted
  - click `Ready to Scrape` when the results page is ready

The popup should describe the supported context in user terms such as "LinkedIn Jobs search pages" rather than showing raw URL patterns.

### Supported vs Unsupported Pages

- On unsupported pages, `Ready to Scrape` remains disabled and the popup shows a concise note that scraping only works on LinkedIn Jobs search pages.
- On supported LinkedIn Jobs search pages, `Ready to Scrape` is enabled.
- Clicking `Ready to Scrape` sends a message to open the existing in-page scraper modal.

### In-Page Modal Trigger

- The popup must not automatically open the in-page modal.
- The in-page modal opens only when the user clicks `Ready to Scrape`.
- If the in-page modal is already open, clicking `Ready to Scrape` should not disrupt or reset it.

## Architecture

### Manifest and Action Behavior

`manifest.json` should add:

```json
"action": {
  "default_popup": "popup.html",
  "default_icon": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

This replaces the current action-click-only behavior as the primary extension entry point.

### Popup Ownership

`popup.html` and `popup.js` become the owner of the extension icon experience:

- render guidance and buttons
- inspect the active tab URL
- enable or disable `Ready to Scrape`
- request the in-page modal only when the user clicks `Ready to Scrape`

The popup should no longer try to show scraping progress or run-state messaging. That responsibility remains with the in-page modal.

### Supported URL Detection

Popup logic should treat these as supported pages:

- `https://www.linkedin.com/jobs/search/*`
- `https://www.linkedin.com/jobs/search-results/*`

Matching should be explicit enough to avoid enabling scrape actions on unrelated LinkedIn pages.

### Content Script Messaging

The content script already handles `openControls`. That message path should remain the trigger for opening the existing in-page modal.

Recommended behavior:

1. Popup checks whether the active tab is a supported LinkedIn Jobs search page.
2. If supported, popup enables `Ready to Scrape`.
3. On click, popup ensures the scraper scripts are present if needed.
4. Popup sends `openControls` to the content script.
5. Content script opens the existing in-page modal if needed and leaves current state intact if it is already visible.

### Background Worker

`background.js` no longer needs to listen to `chrome.action.onClicked` for opening controls. It should retain its download-related responsibilities and any reusable content-script injection helper needed by the popup pathway.

## UI States

### Unsupported Page

- Guidance visible
- `Go to LinkedIn Jobs` enabled
- `Ready to Scrape` disabled
- Short note explains that the scraper works on LinkedIn Jobs search pages only

### Supported Page

- Guidance visible
- `Go to LinkedIn Jobs` enabled
- `Ready to Scrape` enabled
- Short note can confirm the page is ready for the in-page controls

### Recovery State

If the popup cannot connect to the content script on a supported page after attempting injection, it should show a concise recovery message such as telling the user to refresh the LinkedIn tab and try again.

## Error Handling

- If there is no active tab, the popup should show a clear inactive-state message and keep `Ready to Scrape` disabled.
- If the user is on a non-LinkedIn page, the popup should still be usable for navigation and instructions.
- If the popup cannot message the content script on a supported page, it should fail gracefully without changing the in-page UI.
- The popup should not claim the user is signed in; it should only instruct them to sign in first.

## Testing

Manual verification should cover:

1. Click the extension icon on a non-LinkedIn page and confirm the popup opens.
2. Confirm the popup shows the LinkedIn Jobs button, sign-in guidance, setup instructions, and a disabled `Ready to Scrape` button on unsupported pages.
3. Click `Go to LinkedIn Jobs` and confirm it opens the LinkedIn Jobs search page.
4. Click the extension icon on `https://www.linkedin.com/jobs/search/*` and confirm `Ready to Scrape` is enabled.
5. Click the extension icon on `https://www.linkedin.com/jobs/search-results/*` and confirm `Ready to Scrape` is enabled.
6. Click `Ready to Scrape` on a supported page and confirm the existing in-page modal opens unchanged.
7. Click `Ready to Scrape` again while the in-page modal is already open and confirm the existing modal state is not reset or broken.
8. Refresh a supported LinkedIn Jobs tab, then use `Ready to Scrape` again to confirm injection/reconnect still works.
