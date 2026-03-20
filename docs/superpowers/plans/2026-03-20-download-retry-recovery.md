# Download Retry Recovery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Markdown downloads resilient by automatically retrying interrupted downloads, only pausing scraping when a download actually enters recovery, and persisting final failures for inspection.

**Architecture:** Move download lifecycle ownership into `background.js`, where each download request can be tracked from `chrome.downloads.download()` through `chrome.downloads.onChanged`. The content script will switch from fire-and-forget downloads to an awaited request that only blocks when the background worker detects an interrupted download and spends up to 5 seconds attempting recovery. Final unrecoverable failures will be written to `chrome.storage.local`, and the popup will expose a lightweight failed-download count so the user can find the stored records.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript, `chrome.downloads`, `chrome.storage.local`, popup/content-script/background message passing

---

## File Structure

- Modify: `background.js`
  Own the download manager, retry bookkeeping, timeout budget, persisted failure records, and popup-facing status helpers.
- Modify: `content_script.js`
  Await download results per job and only pause the scrape when the background worker reports an active retry or terminal failure.
- Modify: `popup.js`
  Read and render failed-download summary state from storage and refresh it during the scrape.
- Modify: `popup.html`
  Add a small status area for failed download visibility without changing the primary start/stop workflow.
- Modify: `README.md`
  Document the new retry behavior, failure logging location, and manual verification steps.

## Chunk 1: Define Download Manager Contract

### Task 1: Specify message and storage shape

**Files:**
- Modify: `background.js`
- Modify: `content_script.js`
- Modify: `popup.js`

- [ ] **Step 1: Write the failing test plan as executable manual cases**

Document these expected behaviors inside the code comments or plan notes before implementation:

```text
1. Healthy download returns { ok: true, recovered: false } without waiting 5 seconds.
2. Interrupted download retries automatically and returns { ok: true, recovered: true } if recovery succeeds within 5 seconds.
3. Interrupted download that exceeds 5 seconds returns { ok: false, error: "...timeout..." } and appends an entry to failedDownloads.
4. Popup can read failedDownloads and show the current count.
```

- [ ] **Step 2: Define the request/response contract**

Use this shape for the content-script to background message:

```js
{
  action: "download",
  filename: "scraped-jobs/2026-03-20/Company_Title_123.md",
  content: "# Markdown...",
  timeoutMs: 5000
}
```

Return this shape from the background worker:

```js
{
  ok: true,
  recovered: false,
  attempts: 1
}
```

or

```js
{
  ok: false,
  attempts: 3,
  error: "Download recovery timed out after 5000ms"
}
```

- [ ] **Step 3: Define persistent failure record structure**

Store final failures in `chrome.storage.local` under `failedDownloads`:

```js
[
  {
    filename: "scraped-jobs/2026-03-20/Company_Title_123.md",
    error: "Download recovery timed out after 5000ms",
    attempts: 3,
    failedAt: "2026-03-20T14:35:12.000Z"
  }
]
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-03-20-download-retry-recovery.md
git commit -m "Add download retry recovery implementation plan"
```

## Chunk 2: Build Background Download Recovery

### Task 2: Add a tracked download lifecycle in `background.js`

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Write the failing test case as a manual reproduction**

Run the extension, start a scrape, then simulate a broken download environment. Expected current behavior: Chrome shows interrupted downloads, native "Try again" remains unreliable, and the extension has no record of the failure.

- [ ] **Step 2: Run the manual reproduction to verify the current failure**

Run:

```text
1. Reload the unpacked extension
2. Refresh the LinkedIn Jobs tab
3. Start scraping
4. Force or observe an interrupted download
```

Expected: FAIL because `background.js` never tracks download completion or interruption.

- [ ] **Step 3: Implement a pending-download map**

Add in-memory bookkeeping in `background.js`:

```js
const pendingDownloads = new Map();
const FAILED_DOWNLOADS_KEY = "failedDownloads";
```

Each pending entry should keep:

```js
{
  requestId,
  filename,
  content,
  attempts,
  startedAt,
  timeoutMs,
  sendResponse,
  settled
}
```

- [ ] **Step 4: Extract a helper that starts one download attempt**

Create a focused helper in `background.js`:

```js
async function startDownloadAttempt(entry) {
  const downloadId = await chrome.downloads.download({
    url: buildMarkdownDataUrl(entry.content),
    filename: entry.filename,
    saveAs: false
  });

  entry.downloadId = downloadId;
  pendingDownloads.set(downloadId, entry);
}
```

Keep the existing base64 generation logic, but isolate it in `buildMarkdownDataUrl(content)` so retries create a fresh URL each time.

- [ ] **Step 5: Listen for download completion and interruption**

Use `chrome.downloads.onChanged.addListener` to:

```js
if (delta.state?.current === "complete") {
  settleSuccess(downloadId, { recovered: entry.attempts > 1 });
}

if (delta.state?.current === "interrupted") {
  scheduleRetryOrFail(downloadId);
}
```

Treat `"interrupted"` as the only path that consumes the 5-second recovery budget.

- [ ] **Step 6: Implement bounded automatic retry**

Retry policy:

```js
const RETRY_BACKOFF_MS = 500;
```

Algorithm:
- Increment `attempts`
- If `Date.now() - startedAt >= timeoutMs`, settle failure and persist the record
- Otherwise wait `RETRY_BACKOFF_MS`, start a fresh attempt, and rebind the new `downloadId`

Do not pause healthy downloads artificially. The 5-second budget applies only after the first interruption.

- [ ] **Step 7: Persist final failures to storage**

Add helpers:

```js
async function appendFailedDownload(record) {}
async function getFailedDownloads() {}
```

Cap the stored list to a reasonable length such as the most recent 100 items to avoid unbounded growth.

- [ ] **Step 8: Respond to the content script exactly once**

Ensure every pending entry settles via one of:
- success on complete
- failure on timeout
- failure on `chrome.runtime.lastError` from `downloads.download`

Guard against duplicate `sendResponse` calls by marking `entry.settled = true`.

- [ ] **Step 9: Run the manual verification**

Expected:
- healthy downloads resolve quickly
- interrupted downloads retry automatically
- unrecoverable downloads create a `failedDownloads` record

- [ ] **Step 10: Commit**

```bash
git add background.js
git commit -m "Add tracked download retry recovery"
```

## Chunk 3: Integrate Download Results Into Scraping Flow

### Task 3: Await download outcomes in `content_script.js`

**Files:**
- Modify: `content_script.js`

- [ ] **Step 1: Write the failing test case as a manual scenario**

Expected current behavior: the scraper increments progress immediately after sending the download request, even if the actual file later interrupts or fails.

- [ ] **Step 2: Run the scenario to verify it fails**

Run a scrape and observe that progress advances before download success is known.

- [ ] **Step 3: Replace fire-and-forget with awaited message handling**

Change:

```js
chrome.runtime.sendMessage({ action: "download", filename, content: markdown });
```

to:

```js
const downloadResult = await chrome.runtime.sendMessage({
  action: "download",
  filename,
  content: markdown,
  timeoutMs: 5000
});
```

- [ ] **Step 4: Branch on result without stalling healthy downloads**

Behavior:
- `ok: true`: continue normally
- `ok: true, recovered: true`: optionally log a warning for observability
- `ok: false`: log the failure, send a popup progress/error update, and continue to the next job

Do not abort the whole scrape for one failed download in this pass.

- [ ] **Step 5: Keep progress truthful**

Only increment `scraped` after the background worker returns success or final failure handling is complete. If the product semantics should distinguish "scraped" from "saved", add a small comment clarifying that the counter means "processed jobs".

- [ ] **Step 6: Run the manual verification**

Expected:
- healthy downloads do not incur a fixed 5-second delay
- interrupted downloads pause only while being retried
- final failures are logged and scraping continues

- [ ] **Step 7: Commit**

```bash
git add content_script.js
git commit -m "Await download recovery results in scraper"
```

## Chunk 4: Surface Failure Visibility In Popup

### Task 4: Add a failed-download summary to the popup

**Files:**
- Modify: `popup.html`
- Modify: `popup.js`

- [ ] **Step 1: Write the failing test case as a manual scenario**

Expected current behavior: after a failed download, the popup shows no indication that failure records exist in `chrome.storage.local`.

- [ ] **Step 2: Run the scenario to verify it fails**

Cause one failed download, open the popup, and verify there is no visible failed count.

- [ ] **Step 3: Add a dedicated status element in `popup.html`**

Add a small line below progress:

```html
<p id="downloadHealth"></p>
```

Keep it visually secondary to the main start/stop state.

- [ ] **Step 4: Read failure records in `popup.js`**

On `DOMContentLoaded`, fetch:

```js
const { failedDownloads = [] } = await chrome.storage.local.get("failedDownloads");
```

Render:
- empty list: blank or "No failed downloads"
- non-empty list: `Failed downloads: N (see chrome.storage.local)`

- [ ] **Step 5: Refresh popup state during scraping**

Listen for a lightweight runtime message such as:

```js
{ action: "downloadStatusChanged", failedCount: 2 }
```

from the background worker whenever a failure record is added or cleared. This avoids stale popup state if it stays open during a run.

- [ ] **Step 6: Run the manual verification**

Expected:
- popup shows zero/no failures initially
- popup updates after a terminal download failure
- popup remains readable during a normal scrape

- [ ] **Step 7: Commit**

```bash
git add popup.html popup.js
git commit -m "Show failed download count in popup"
```

## Chunk 5: Document And Verify End To End

### Task 5: Update docs and run manual regression coverage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the failing doc/test expectation**

Current docs do not describe download recovery, the 5-second retry budget, or where failure logs are stored.

- [ ] **Step 2: Update the README**

Add:
- background worker now tracks download completion/interruption
- automatic retry applies to interrupted downloads only
- final failures are stored in `chrome.storage.local.failedDownloads`
- how to inspect them via `chrome://extensions` -> service worker -> Application -> Extension storage

- [ ] **Step 3: Run the manual regression checklist**

Run:

```text
1. Reload the unpacked extension
2. Refresh the LinkedIn Jobs tab
3. Start a scrape with normal connectivity
4. Confirm files still land in ~/Downloads/scraped-jobs/YYYY-MM-DD/
5. Confirm there is no fixed 5-second delay per healthy file
6. Trigger or simulate an interrupted download
7. Confirm automatic retry occurs for up to 5 seconds
8. Confirm unrecoverable failure is visible in popup and stored in chrome.storage.local.failedDownloads
9. Confirm scraping continues after a terminal download failure
```

- [ ] **Step 4: Capture verification notes**

Record the exact manual results in the commit message or PR description:
- normal-download speed
- retry observed or not observed
- failed record path confirmed

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Document download retry recovery behavior"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-20-download-retry-recovery.md`. Ready to execute?
