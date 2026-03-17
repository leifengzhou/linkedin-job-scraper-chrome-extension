# LinkedIn Job Scraper Chrome Extension — Design Spec

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

A Chrome extension that scrapes LinkedIn job search results pages. When triggered, it clicks each job card, extracts structured data, expands the full job description, and saves each job as a Markdown file to the Downloads folder. It automatically paginates through all result pages until no more jobs remain.

**Goal:** Build a personal job-scraping tool to collect job postings for manual review and future LLM-assisted application workflows.

---

## Architecture

```
manifest.json          — Extension config (MV3), permissions declaration
popup.html             — Extension popup UI
popup.js               — Popup logic: start/stop, progress display
content_script.js      — Core scraper: DOM interaction and data extraction
background.js          — Service worker: handles chrome.downloads API calls
```

### Message Flow

```
popup.js
  → chrome.tabs.sendMessage({action: "start"})
      → content_script.js scrapes jobs
          → chrome.runtime.sendMessage({action: "download", filename, content})
              → background.js calls chrome.downloads.download()
          → chrome.runtime.sendMessage({action: "progress", scraped, total, page})
              → popup.js updates UI
  → chrome.tabs.sendMessage({action: "stop"})  [if user clicks Stop]
```

---

## File Structure

```
linkedin-job-scraper-chrome-extension/
├── manifest.json
├── popup.html
├── popup.js
├── content_script.js
├── background.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Permissions (manifest.json)

```json
{
  "manifest_version": 3,
  "name": "LinkedIn Job Scraper",
  "version": "1.0.0",
  "permissions": ["downloads", "tabs"],
  "host_permissions": ["https://www.linkedin.com/*"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" },
  "content_scripts": [{
    "matches": ["https://www.linkedin.com/jobs/*"],
    "js": ["content_script.js"]
  }]
}
```

Content script is injected declaratively via `content_scripts` — `scripting` permission is not needed. `activeTab` is redundant given `tabs` + `host_permissions`.

---

## Scraping Logic (content_script.js)

### Main Loop

```
1. Find all job cards in left panel (.jobs-search-results__list-item)
2. For each card:
   a. Click the card
   b. Wait for right panel to fully load: use MutationObserver on the panel container, watching for `childList`/`subtree` mutations, and consider the panel "ready" when an `h1` element is present within it (not just any mutation, which fires too early on partial renders). Fall back to 3s timeout if observer doesn't fire.
   c. Extract fields from right panel (see Fields section)
   d. Find and click "...see more" / "more" button in "About the job" section
   e. Wait for description to expand
   f. Extract full job description text
   g. Format as Markdown
   h. Send download message to background.js
   i. Send progress update to popup.js
   j. Wait 1.5s before next card (anti-bot delay)
3. After all cards: look for pagination "Next ›" button
   - If found: click it, then use MutationObserver on the job list container (`childList: true`). LinkedIn clears and repopulates the list — wait for `<li>` elements to be present again (list.querySelectorAll('li').length > 0 after a clear cycle), not just any `childList` mutation (which would fire on the clear itself). Fall back to 3s timeout. Then repeat from step 1.
   - If not found: send "done" message to popup.js
```

### Waiting Strategy

Use `MutationObserver` (not `setTimeout`) to detect when the right panel updates after a card click. Fall back to a 3s timeout if the observer doesn't fire.

### Stop Handling

A module-level `isStopped` flag is set when the popup sends `{action: "stop"}`. The loop checks this flag before each card and exits cleanly.

### Fields Extracted

LinkedIn uses stable `data-testid` attributes and structural anchors. Prefer these over hashed class names (e.g. `_1b69bc9e`), which change on every deploy.

| Field | Selector strategy |
|---|---|
| Right panel container | `[data-testid="lazy-column"]` — watch this with MutationObserver |
| Job title | `a[href*="/jobs/view/"]` inside the right panel — text content |
| Job ID | Regex `/jobs\/view\/(\d+)/` on the job title `href` |
| Company | `a[href*="/company/"]` inside the right panel — text content |
| Location | First `span` in the header `<p>` that contains location/date/stats (siblings separated by `·`) |
| Date posted | Second `span` in the same `<p>` as location |
| Apply link (external) | `a[aria-label="Apply on company website"]` — extract `href`, then decode the `url` query param from LinkedIn's redirect wrapper (`/redir/redirect/?url=...`) |
| Apply link (Easy Apply) | `button[aria-label*="Easy Apply"]` — no external URL; use LinkedIn job permalink constructed from Job ID: `https://www.linkedin.com/jobs/view/{jobId}/` |
| Salary | Not reliably available in the panel; skip for now, set to `"Not listed"` |
| Job description (full) | `[data-testid="expandable-text-box"]` — after clicking "more" button |
| "more" button | `[data-testid="expandable-text-button"]` — click to expand description |

**Panel ready signal for MutationObserver:** After clicking a job card, observe `[data-testid="lazy-column"]` with `{ childList: true, subtree: true }`. Consider the panel ready when `a[href*="/jobs/view/"]` is present within it (not just any mutation, which fires too early on partial renders). Fall back to 3s timeout.

---

## Output Format

### File Path

```
Downloads/scraped-jobs/{YYYY-MM-DD}/{company}_{job-title}_{jobId}.md
```

Example: `Downloads/scraped-jobs/2026-03-17/Microsoft_Senior-Product-Manager-AI_4371413114.md`

**Filename sanitization:**
- Replace invalid filename chars (`/ \ : * ? " < > |`) with `-`
- Collapse whitespace to single hyphens
- Truncate company+title portion to 80 chars max, then append `_{jobId}` (ensures uniqueness even when two jobs at the same company have similar titles)
- Date folder uses today's date in `YYYY-MM-DD` format (set at scrape start, not per-file)

Chrome's `downloads.download()` API creates subdirectories automatically from the `filename` path.

### File Content

```markdown
# {Job Title}
**Company:** {Company}
**Location:** {Location}
**Salary:** {Salary or "Not listed"}
**Date Posted:** {Date Posted}
**Apply:** [{Apply Type}]({Apply URL})
**Job ID:** {Job ID}

---

## About the Job

{Full job description text}
```

---

## Popup UI (popup.html / popup.js)

### States

| State | UI |
|---|---|
| Idle (on LinkedIn Jobs page) | "▶ Start Scraping" button enabled |
| Idle (wrong page) | "Open a LinkedIn Jobs search page first" — button disabled |
| Scraping | "⏹ Stop" button; status text: "Scraping... 7 / 25 jobs · Page 2" |
| Done | "✓ Complete — 47 jobs saved to scraped-jobs/2026-03-17/" |
| Error | Red error message describing what went wrong |

### Communication

- Popup queries active tab on open to check if it's a LinkedIn Jobs URL
- Sends `{action: "start"}` to content script on button click
- Listens for `{action: "progress", scraped, page}` messages from content script
- Listens for `{action: "done", total, folder}` to show completion state
- Sends `{action: "stop"}` to content script on Stop click

**Popup re-open during active scrape:** The content script stores last-known progress in `chrome.storage.session` (e.g. `{running: true, scraped: 7, page: 2}`). When the popup opens, it reads this value first and restores the in-progress state before waiting for the next progress event. The session key must be explicitly cleared when the scrape finishes ("done") or is stopped ("stop") — otherwise the next popup open will incorrectly show stale in-progress state.

**All `chrome.runtime.sendMessage` calls from the content script are fire-and-forget** (no callback, no `await`). The popup may be closed at any time, and expecting a response would produce "no receiver" console errors.

---

## Background Service Worker (background.js)

Handles download requests from the content script (MV3 requires downloads API to be called from background, not content scripts):

```js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "download") {
    // MV3 service workers don't support Blob/URL.createObjectURL.
    // Use a base64 data URI. Use TextEncoder (not deprecated unescape) for Unicode safety.
    const bytes = new TextEncoder().encode(msg.content);
    const dataUrl = "data:text/markdown;base64," + btoa(String.fromCharCode(...bytes));
    chrome.downloads.download({
      url: dataUrl,
      filename: msg.filename,  // e.g. "scraped-jobs/2026-03-17/Microsoft_Senior-PM_4371413114.md"
      saveAs: false
    });
    // Fire-and-forget — no response sent back to content script.
  }
});
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Right panel doesn't load in 3s | Skip job, log warning, continue |
| "More" button not found | Save description as-is (truncated) with a note |
| No job cards found on page | Show error: "No job listings found on this page" |
| Network/DOM error mid-scrape | Show error in popup, stop cleanly |
| User navigates away during scrape | `isStopped` flag + visibility change listener stops the loop |

---

## Known Limitations

1. **LinkedIn DOM changes:** `data-testid` selectors are more stable than hashed class names but can still change if LinkedIn redesigns the page.
2. **Rate limiting:** 1.5s delay per job means ~40 jobs/minute. 99+ results = ~2.5 minutes.
3. **Dynamic content:** Some jobs load lazily; MutationObserver approach handles most cases.
4. **Login required:** Extension only works when the user is logged in to LinkedIn (by design).
5. **Salary availability:** LinkedIn often doesn't show salary — field will say "Not listed".
6. **Location/date positional extraction:** Location and date are extracted by span index within a shared `<p>`. If LinkedIn inserts a new metadata span before them (e.g. a "Remote" badge), the index shifts and wrong values may be silently extracted.
7. **Silent download failures:** `chrome.downloads.download()` can fail silently (invalid filename, download blocked by browser settings). Failures are not surfaced to the popup UI.
8. **Navigation during scrape:** The stop handler uses `pagehide` to detect tab navigation, and `visibilitychange` to detect tab switching (pause/resume is not implemented — the scraper continues until the current job finishes, then stops when `isStopped` is checked).

---

## Verification

1. Load the extension in Chrome (`chrome://extensions` → Developer Mode → Load unpacked)
2. Navigate to a LinkedIn Jobs search with active results
3. Open the extension popup — verify "Start Scraping" is enabled
4. Click Start — verify the right panel begins updating through each job
5. Check Downloads folder for `scraped-jobs/{today}/` directory with `.md` files
6. Open a few `.md` files and verify: title, company, location, description all present
7. Verify pagination: let it run past page 1 and confirm it clicks Next and continues
8. Test Stop button: click Stop mid-scrape, confirm it stops cleanly after current job
9. Test on a non-Jobs page: confirm popup shows disabled state with helpful message
