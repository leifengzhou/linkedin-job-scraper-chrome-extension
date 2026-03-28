# Action Popup Guidance Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-available extension popup with LinkedIn Jobs guidance and a supported-page-only `Ready to Scrape` action that opens the existing in-page scraper modal.

**Architecture:** Move the extension icon entry point to a real Chrome action popup and keep all scrape controls inside the existing in-page modal. Extract popup page-state logic into a small shared helper so the supported-URL rules and button enablement can be unit tested with `node:test`.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript, `node:test`

---

## Chunk 1: Popup State Logic

### Task 1: Add popup state regression tests

**Files:**
- Create: `tests/popup-state.test.js`
- Create: `popup_state.js`

- [ ] **Step 1: Write the failing test**

```js
test("buildPopupState enables scraping on supported LinkedIn Jobs search pages", () => {
  assert.equal(buildPopupState("https://www.linkedin.com/jobs/search/?keywords=engineer").canScrape, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/popup-state.test.js`
Expected: FAIL because `popup_state.js` does not exist yet

- [ ] **Step 3: Write minimal implementation**

```js
function isSupportedLinkedInJobsUrl(url) {
  // Return true only for /jobs/search/ and /jobs/search-results/
}

function buildPopupState(url) {
  return {
    canScrape: isSupportedLinkedInJobsUrl(url)
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/popup-state.test.js`
Expected: PASS

## Chunk 2: Popup UI Rewrite

### Task 2: Replace the old popup status UI with guidance + actions

**Files:**
- Modify: `popup.html`
- Modify: `popup.js`
- Modify: `manifest.json`

- [ ] **Step 1: Expand the failing test to cover unsupported pages and empty tabs**

```js
test("buildPopupState disables scraping on unsupported pages", () => {
  assert.equal(buildPopupState("https://www.linkedin.com/feed/").canScrape, false);
});
```

- [ ] **Step 2: Run test to verify the new case fails**

Run: `node --test tests/popup-state.test.js`
Expected: FAIL for the new unsupported-page expectation until logic is updated

- [ ] **Step 3: Implement the popup UI**

Key work:
- Add `action.default_popup` to `manifest.json`
- Rewrite `popup.html` to show:
  - `Go to LinkedIn Jobs`
  - sign-in/setup instructions
  - supported-page note
  - `Ready to Scrape`
- Rewrite `popup.js` to:
  - inspect the active tab
  - render popup state from `buildPopupState`
  - open LinkedIn Jobs from the link button
  - keep `Ready to Scrape` disabled off supported pages
  - ensure content scripts are present, then send `openControls` when `Ready to Scrape` is clicked

- [ ] **Step 4: Run tests to verify state logic still passes**

Run: `node --test tests/popup-state.test.js`
Expected: PASS

## Chunk 3: Action Wiring Cleanup and Verification

### Task 3: Remove obsolete action-click behavior and verify the final flow

**Files:**
- Modify: `background.js`
- Modify: `README.md`

- [ ] **Step 1: Write a failing expectation for the second supported route**

```js
test("buildPopupState enables scraping on search-results pages", () => {
  assert.equal(buildPopupState("https://www.linkedin.com/jobs/search-results/?keywords=design").canScrape, true);
});
```

- [ ] **Step 2: Run test to verify it fails if route matching is incomplete**

Run: `node --test tests/popup-state.test.js`
Expected: FAIL until both supported route families are covered

- [ ] **Step 3: Finish implementation and docs**

Key work:
- Remove `chrome.action.onClicked` auto-open behavior from `background.js`
- Update `README.md` installation/usage text to describe the popup-driven flow

- [ ] **Step 4: Run full targeted verification**

Run: `node --test tests/popup-state.test.js tests/content-script-files.test.js`
Expected: PASS

Run: `node --check popup.js`
Expected: PASS

Run: `node --check popup_state.js`
Expected: PASS
