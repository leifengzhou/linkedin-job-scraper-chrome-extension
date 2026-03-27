# In-Page Scrape Controls Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the popup-driven scraper controls with an in-page LinkedIn modal that supports start, pause, stop, progress visibility, and chip-based reopen while keeping per-run counts isolated.

**Architecture:** Move the action entry point to `chrome.action.onClicked` in `background.js`, then open an in-page control surface owned by the content script. Extract a small run-session helper and a view-model helper so pause/resume transitions, button states, and run-local counts can be tested with `node --test` before wiring the DOM and scrape loop integration.

**Tech Stack:** Chrome Extension Manifest V3, plain JavaScript, `chrome.action`, `chrome.scripting`, content-script DOM injection, `chrome.downloads`, `node:test`

---

## File Structure

- Modify: `manifest.json`
  Remove `action.default_popup` and keep the action icon available for click-to-open behavior.
- Modify: `background.js`
  Add `chrome.action.onClicked` handling, guard for LinkedIn Jobs URLs, script-injection fallback, and `openControls` messaging while preserving download recovery behavior.
- Modify: `content_script.js`
  Replace popup-oriented start/stop handling with in-page modal lifecycle, pause/resume/stop flow, run-local progress state, and chip reopen behavior.
- Create: `scrape_session.js`
  Hold testable run-session state helpers for status transitions, counts, modal visibility, and event-log updates.
- Create: `in_page_controls.js`
  Hold in-page modal/chip rendering helpers plus a pure `buildControlsViewModel()` function the tests can exercise.
- Create: `tests/scrape-session.test.js`
  Cover run reset, pause/resume transitions, event-log capping, and per-run failure isolation.
- Create: `tests/in-page-controls.test.js`
  Cover control-button enablement, labels, and status text derived from session state.
- Modify: `README.md`
  Replace popup-first usage and verification guidance with action-click launcher plus in-page modal/chip behavior.

## Chunk 1: Extract Testable Run State Helpers

### Task 1: Add a run-session helper with pause/resume semantics

**Files:**
- Create: `scrape_session.js`
- Create: `tests/scrape-session.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createScrapeSession,
  startRun,
  requestPause,
  recordJobResult,
  markPaused,
  resumeRun,
  stopRun
} = require("../scrape_session.js");

test("startRun resets stale counts and events for a new run", () => {
  const session = createScrapeSession();
  session.savedCount = 3;
  session.failedCount = 2;
  session.events = [{ kind: "failure", label: "Old job" }];

  startRun(session);

  assert.equal(session.status, "running");
  assert.equal(session.savedCount, 0);
  assert.equal(session.failedCount, 0);
  assert.deepEqual(session.events, []);
});

test("pause waits for the current job to finish before paused state", () => {
  const session = createScrapeSession();
  startRun(session);

  requestPause(session);
  assert.equal(session.status, "pauseRequested");

  recordJobResult(session, { ok: true, label: "Acme - Engineer" });
  markPaused(session);

  assert.equal(session.status, "paused");
  assert.equal(session.savedCount, 1);
});

test("resume keeps prior progress and continues the same run", () => {
  const session = createScrapeSession();
  startRun(session);
  session.currentCardIndex = 5;
  requestPause(session);
  markPaused(session);

  resumeRun(session);

  assert.equal(session.status, "running");
  assert.equal(session.currentCardIndex, 5);
});

test("stop clears resumable state without deleting completed counts", () => {
  const session = createScrapeSession();
  startRun(session);
  recordJobResult(session, { ok: false, label: "Beta - PM", error: "Download failed" });

  stopRun(session);

  assert.equal(session.status, "stopped");
  assert.equal(session.failedCount, 1);
  assert.equal(session.resumeFromIndex, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scrape-session.test.js`

Expected: FAIL with `Cannot find module '../scrape_session.js'`

- [ ] **Step 3: Write the minimal implementation**

Create `scrape_session.js` in the same UMD style as `download_recovery.js` and `retry_policy.js`:

```js
(function (root) {
  function createScrapeSession() {
    return {
      status: "idle",
      page: 1,
      currentPageTotal: 0,
      currentCardIndex: 0,
      resumeFromIndex: null,
      savedCount: 0,
      failedCount: 0,
      currentJobLabel: "",
      events: [],
      isModalOpen: true
    };
  }

  function startRun(session) {
    session.status = "running";
    session.page = 1;
    session.currentPageTotal = 0;
    session.currentCardIndex = 0;
    session.resumeFromIndex = 0;
    session.savedCount = 0;
    session.failedCount = 0;
    session.currentJobLabel = "";
    session.events = [];
  }

  function requestPause(session) {
    if (session.status === "running") {
      session.status = "pauseRequested";
    }
  }

  function recordJobResult(session, result) {
    session.currentJobLabel = result.label;
    if (result.ok) {
      session.savedCount += 1;
    } else {
      session.failedCount += 1;
    }
    session.events = [...session.events, result].slice(-20);
  }
```

Then finish the helper with:

- `markPageContext(session, { page, currentPageTotal, currentCardIndex })`
- `markPaused(session)`
- `resumeRun(session)`
- `stopRun(session)`
- `finishRun(session)`
- `setModalOpen(session, isOpen)`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/scrape-session.test.js`

Expected: PASS for all new run-session tests

- [ ] **Step 5: Commit**

```bash
git add scrape_session.js tests/scrape-session.test.js
git commit -m "Add scrape session state helpers"
```

### Task 2: Add a pure controls view-model helper

**Files:**
- Create: `in_page_controls.js`
- Create: `tests/in-page-controls.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildControlsViewModel } = require("../in_page_controls.js");

test("idle state enables only Start", () => {
  const vm = buildControlsViewModel({
    status: "idle",
    page: 1,
    currentPageTotal: 0,
    savedCount: 0,
    failedCount: 0,
    currentJobLabel: "",
    events: []
  });

  assert.equal(vm.startLabel, "Start");
  assert.equal(vm.startDisabled, false);
  assert.equal(vm.pauseDisabled, true);
  assert.equal(vm.stopDisabled, true);
});

test("paused state turns Start into Resume", () => {
  const vm = buildControlsViewModel({
    status: "paused",
    page: 2,
    currentPageTotal: 25,
    savedCount: 7,
    failedCount: 1,
    currentJobLabel: "Acme - Engineer",
    events: []
  });

  assert.equal(vm.startLabel, "Resume");
  assert.equal(vm.pauseDisabled, true);
  assert.equal(vm.stopDisabled, false);
  assert.match(vm.statusText, /Paused/);
});

test("pauseRequested state explains deferred pause", () => {
  const vm = buildControlsViewModel({
    status: "pauseRequested",
    page: 1,
    currentPageTotal: 25,
    savedCount: 3,
    failedCount: 0,
    currentJobLabel: "Beta - PM",
    events: []
  });

  assert.match(vm.statusText, /Pausing after current job/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/in-page-controls.test.js`

Expected: FAIL with `Cannot find module '../in_page_controls.js'`

- [ ] **Step 3: Write the minimal implementation**

Start `in_page_controls.js` with a pure formatter:

```js
(function (root) {
  function buildControlsViewModel(session) {
    const isRunning = session.status === "running";
    const isPaused = session.status === "paused";
    const isPauseRequested = session.status === "pauseRequested";

    return {
      startLabel: isPaused ? "Resume" : "Start",
      startDisabled: isRunning || isPauseRequested,
      pauseDisabled: !isRunning,
      stopDisabled: !["running", "pauseRequested", "paused"].includes(session.status),
      statusText: getStatusText(session)
    };
  }
```

Then add:

- `getStatusText(session)`
- `createControlsDom(document)`
- `renderControls(domRefs, viewModel, session)`
- `showChip(domRefs)`
- `showModal(domRefs)`

Keep DOM creation isolated so `content_script.js` only binds events and passes session data into the renderer.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/in-page-controls.test.js`

Expected: PASS for all control view-model tests

- [ ] **Step 5: Commit**

```bash
git add in_page_controls.js tests/in-page-controls.test.js
git commit -m "Add in-page controls view model"
```

## Chunk 2: Move the Extension Entry Point to the Action Click

### Task 3: Replace `default_popup` with `chrome.action.onClicked`

**Files:**
- Modify: `manifest.json`
- Modify: `background.js`

- [ ] **Step 1: Write the failing test plan as executable manual cases**

Document these manual red cases in the task notes before implementation:

```text
1. Clicking the extension icon on a LinkedIn Jobs page still opens the old popup.
2. Clicking the extension icon on a LinkedIn Jobs page does not open any in-page controls.
3. Clicking the extension icon on a non-LinkedIn Jobs page should not inject the scraper UI.
```

- [ ] **Step 2: Run the manual red case**

Run in Chrome:

```text
1. Reload the unpacked extension.
2. Open a LinkedIn Jobs search page.
3. Click the extension icon.
```

Expected: FAIL because the popup opens instead of an in-page control surface.

- [ ] **Step 3: Update the manifest**

Change `manifest.json`:

```json
"action": {
  "default_icon": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

Do not remove the icons. Remove only `default_popup`.

- [ ] **Step 4: Add action-click handling in `background.js`**

Add a new entry path ahead of the download handlers:

```js
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !tab.url.includes("linkedin.com/jobs")) {
    return;
  }

  await ensureScraperScripts(tab.id);
  await chrome.tabs.sendMessage(tab.id, { action: "openControls" });
});
```

Add `ensureScraperScripts(tabId)`:

```js
async function ensureScraperScripts(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["retry_policy.js", "description_utils.js", "scrape_session.js", "in_page_controls.js", "content_script.js"]
    });
  }
}
```

Keep the existing download recovery logic intact.

- [ ] **Step 5: Run the manual verification**

Run in Chrome:

```text
1. Reload the unpacked extension.
2. Open a LinkedIn Jobs page and click the icon.
3. Open a non-LinkedIn page and click the icon.
```

Expected:
- LinkedIn Jobs page: no popup; content script receives `openControls`
- Non-LinkedIn page: no popup and no injected controls

- [ ] **Step 6: Commit**

```bash
git add manifest.json background.js
git commit -m "Move scraper launch to extension action click"
```

## Chunk 3: Build the In-Page Modal and Chip

### Task 4: Render a persistent modal and reopen chip in the LinkedIn page

**Files:**
- Modify: `content_script.js`
- Modify: `in_page_controls.js`

- [ ] **Step 1: Write the failing manual reproduction**

Run in Chrome:

```text
1. Click the extension icon on a LinkedIn Jobs page.
2. Look for an in-page modal with Start, Pause, Stop, and Close.
3. Close the modal and look for a chip to reopen it.
```

Expected: FAIL because no in-page controls exist yet.

- [ ] **Step 2: Create DOM helpers before wiring the scrape engine**

In `in_page_controls.js`, add DOM creation with stable IDs and classes:

```js
function createControlsDom(document) {
  const root = document.createElement("div");
  root.id = "linked-in-scraper-controls-root";

  root.innerHTML = `
    <div data-role="chip" hidden></div>
    <section data-role="modal">
      <header>
        <strong>LinkedIn Job Scraper</strong>
        <button data-action="close">Close</button>
      </header>
      <p data-role="status"></p>
      <p data-role="summary"></p>
      <p data-role="current-job"></p>
      <div data-role="actions">
        <button data-action="start">Start</button>
        <button data-action="pause">Pause</button>
        <button data-action="stop">Stop</button>
      </div>
      <ul data-role="events"></ul>
    </section>
  `;
```

Return stable references for the chip, modal, buttons, and text nodes.

- [ ] **Step 3: Add modal/chip lifecycle to `content_script.js`**

Add content-script helpers:

```js
function ensureControls() {}
function openControls() {}
function closeControlsToChip() {}
function bindControlEvents() {}
function renderSession() {}
```

Required behavior:

- `openControls()` creates the UI on first use and shows the modal.
- `closeControlsToChip()` hides the modal and shows the chip.
- clicking the chip calls `openControls()`.
- clicking `Close` never stops the run.

- [ ] **Step 4: Run the manual verification**

Expected:
- icon click opens modal
- close converts to chip
- chip click restores modal

- [ ] **Step 5: Commit**

```bash
git add content_script.js in_page_controls.js
git commit -m "Add in-page scraper modal and reopen chip"
```

### Task 5: Wire modal buttons to run-local state before touching the scrape loop

**Files:**
- Modify: `content_script.js`
- Modify: `scrape_session.js`

- [ ] **Step 1: Write the failing manual reproduction**

Run in Chrome:

```text
1. Open the modal.
2. Click Start, Pause, and Stop.
3. Watch whether status text and button states change even before the scraper resumes full work.
```

Expected: FAIL because the buttons either do nothing or still depend on the removed popup flow.

- [ ] **Step 2: Add internal button event handlers**

Wire buttons directly in `content_script.js`:

```js
refs.startButton.addEventListener("click", () => {
  if (session.status === "paused") {
    resumeRequested = true;
  } else {
    beginRun();
  }
});

refs.pauseButton.addEventListener("click", () => {
  requestPause(session);
  renderSession();
});

refs.stopButton.addEventListener("click", () => {
  stopRequested = true;
  stopRun(session);
  renderSession();
});
```

Do not start scraping on modal open. Only start on `Start`.

- [ ] **Step 3: Run the manual verification**

Expected:
- idle modal shows `Start`
- paused modal shows `Resume`
- `Pause` becomes disabled while pause is pending
- `Stop` is available during running and paused states

- [ ] **Step 4: Commit**

```bash
git add content_script.js scrape_session.js
git commit -m "Wire modal controls to scraper session state"
```

## Chunk 4: Integrate the Scrape Engine with Pause, Resume, and Run-Local Counts

### Task 6: Refactor the scrape loop to use the run session instead of popup state

**Files:**
- Modify: `content_script.js`
- Modify: `scrape_session.js`

- [ ] **Step 1: Write the failing test case as a manual reproduction**

Run in Chrome:

```text
1. Start a scrape from the modal.
2. Pause during page 1.
3. Click Resume.
```

Expected current failure:
- pause does not defer correctly, or
- resume restarts at the top instead of the next unscraped job, or
- popup-only state is still referenced

- [ ] **Step 2: Remove popup-only state writes**

Delete popup coupling from `content_script.js`:

- remove `chrome.storage.local.set({ scrapeState: ... })`
- remove `chrome.storage.local.remove("scrapeState")`
- remove `progress` and `done` messages intended only for `popup.js`

All visible state should flow through `session` + `renderSession()`.

- [ ] **Step 3: Convert the loop to explicit page/card indices**

Refactor from "scrape everything immediately" to a resumable cursor:

```js
async function scrapeAllPages() {
  while (!stopRequested) {
    const pageContext = await loadCurrentPageContext();
    markPageContext(session, pageContext);
    renderSession();

    const nextIndex = session.resumeFromIndex ?? 0;
    const pageResult = await scrapeCurrentPage(pageContext.cards, today, session.page, nextIndex);

    if (pageResult === "paused" || pageResult === "stopped") {
      return;
    }

    session.resumeFromIndex = 0;
    // paginate...
  }
}
```

Update `scrapeCurrentPage()` signature:

```js
async function scrapeCurrentPage(cards, today, pageNum, startIndex) {
  for (let cardIndex = startIndex; cardIndex < cards.length; cardIndex += 1) {
    // set current index/job label
    // finish current job
    // if pause requested, store next index and return "paused"
  }
}
```

- [ ] **Step 4: Implement pause/resume semantics**

Exact rule:

- `requestPause(session)` sets `status = "pauseRequested"`
- current job finishes normally
- before the next iteration, store `resumeFromIndex = cardIndex + 1`
- call `markPaused(session)`
- `Resume` restarts `scrapeAllPages()` from the stored cursor without clearing counts

- [ ] **Step 5: Run the manual verification**

Expected:
- pause finishes current job only
- resume continues with the next unscraped card
- stop ends the run and does not resume

- [ ] **Step 6: Commit**

```bash
git add content_script.js scrape_session.js
git commit -m "Add resumable pause and stop flow to scraper"
```

### Task 7: Make success/failure counts strictly run-local

**Files:**
- Modify: `content_script.js`
- Modify: `background.js`
- Modify: `download_recovery.js` (only if a small helper change is needed)

- [ ] **Step 1: Write the failing test case**

Add one more unit test to `tests/scrape-session.test.js`:

```js
test("starting a new run clears previous run failures", () => {
  const session = createScrapeSession();
  startRun(session);
  recordJobResult(session, { ok: false, label: "Old failure", error: "Download failed" });

  startRun(session);

  assert.equal(session.failedCount, 0);
  assert.deepEqual(session.events, []);
});
```

- [ ] **Step 2: Run the test to verify the red case if needed**

Run: `node --test tests/scrape-session.test.js`

Expected:
- FAIL if `startRun()` does not fully reset failures/events
- PASS after the helper is corrected

- [ ] **Step 3: Update download result handling in `content_script.js`**

At the end of each job:

```js
if (!downloadResult?.ok) {
  recordJobResult(session, {
    ok: false,
    label: filenameBase,
    error: downloadResult?.error || "Unknown error"
  });
} else {
  recordJobResult(session, {
    ok: true,
    label: filenameBase
  });
}

renderSession();
```

Do not read `failedDownloads` from `chrome.storage.local` for UI display anymore.

- [ ] **Step 4: Keep background persistence only for diagnostics**

Leave `background.js` failure persistence in place so debugging records still exist, but remove any popup-facing status broadcast that is no longer consumed:

- delete `downloadStatusChanged` messaging
- remove `formatDownloadHealthMessage` usage if nothing else needs it

If `download_recovery.js` becomes dead code for popup formatting, delete only the unused formatter helper, not the retry helpers.

- [ ] **Step 5: Run automated and manual verification**

Run:

```bash
node --test tests/scrape-session.test.js tests/in-page-controls.test.js tests/download-recovery.test.js tests/retry-policy.test.js tests/description-utils.test.js
```

Expected: PASS

Manual checks:

```text
1. Run one scrape with at least one forced failure.
2. Stop or finish it.
3. Start a new run from the modal.
```

Expected:
- saved/failed counts reset to zero
- old event log entries are gone
- new failures count only against the new run

- [ ] **Step 6: Commit**

```bash
git add content_script.js background.js download_recovery.js scrape_session.js tests/scrape-session.test.js
git commit -m "Scope scraper progress and failures to each run"
```

## Chunk 5: Documentation and Final Verification

### Task 8: Update docs for the new control model

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the failing manual doc check**

Inspect `README.md` and note the stale instructions:

- it still says click the popup and press Start
- it still documents popup progress and failed-count behavior

- [ ] **Step 2: Update the docs**

Revise these sections:

- `Features`
- `Installation`
- `Architecture`
- `How It Works`
- `Manual Verification`

Required doc changes:

- clicking the extension icon opens in-page controls on LinkedIn Jobs pages
- the in-page modal provides `Start`, `Pause`, `Stop`, and close-to-chip behavior
- progress and failures are shown per run in the modal
- persisted `failedDownloads` remains a debugging store, not the visible run counter

- [ ] **Step 3: Run the final verification**

Automated:

```bash
node --test tests/scrape-session.test.js tests/in-page-controls.test.js tests/download-recovery.test.js tests/retry-policy.test.js tests/description-utils.test.js
```

Expected: PASS

Manual:

```text
1. Reload the unpacked extension.
2. Open a LinkedIn Jobs page.
3. Click the extension icon to open the modal.
4. Start a run.
5. Close to chip, reopen, pause, resume, and stop.
6. Start a second run and verify counts reset.
```

Expected: all behaviors match the spec.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document in-page scraper controls"
```
