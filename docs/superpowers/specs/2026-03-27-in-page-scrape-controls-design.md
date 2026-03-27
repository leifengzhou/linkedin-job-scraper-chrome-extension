# In-Page Scrape Controls Design

**Date:** 2026-03-27
**Status:** Draft

## Overview

Replace the toolbar popup as the primary scraper UI with a persistent in-page modal rendered inside LinkedIn Jobs pages. Clicking the extension icon should open the in-page controls on the active `linkedin.com/jobs/*` tab. The modal becomes the main control surface for `Start`, `Pause`, `Stop`, and run progress.

The modal must persist for the full scrape session unless the user closes it manually. Closing it should collapse the UI into a small in-page chip. Clicking the chip should reopen the modal without losing the current run state.

## Goals

- Make progress visible without relying on Chrome's ephemeral action popup.
- Keep the scraper controllable while the user remains on the LinkedIn Jobs page.
- Show run-local progress and failures so stale failures do not leak into the next run.
- Support `Pause` as "finish the current job, then halt before the next card."
- Support resume from the next unscraped job in the current run.

## Non-Goals

- Auto-opening controls on every LinkedIn Jobs page visit.
- Cross-tab or cross-window scrape coordination.
- Resume after a hard page reload or browser restart.
- A full job history browser inside the extension.

## User Experience

### Entry Point

- The extension action should no longer use `default_popup`.
- `background.js` should listen to `chrome.action.onClicked`.
- When the user clicks the extension icon on a LinkedIn Jobs page, the background worker should ensure the content script is available and send a message that opens or focuses the in-page controls.
- On non-LinkedIn Jobs pages, the extension should do nothing destructive. A minimal notification or logged warning is acceptable, but the core requirement is to avoid injecting the UI where it does not belong.

### Modal

The in-page modal should be a compact floating panel anchored to a page corner. It should visually separate itself from LinkedIn's UI while remaining small enough not to block job browsing.

Required controls:

- `Start`
- `Pause`
- `Stop`
- `Close`

Required status content:

- current run state: idle, running, paused, stopping, done, error
- current page number
- total jobs found on the current page
- saved count for the current run
- failed count for the current run
- current job summary
- rolling event log with recent success/failure entries

### Close/Reopen Chip

- Closing the modal must not stop the scrape.
- Closing the modal should replace it with a small in-page chip in the same corner.
- The chip should remain visible during the run and after pause until the run ends or the user dismisses it through the modal.
- Clicking the chip should reopen the modal with all run state intact.

### Pause Semantics

- `Pause` should not interrupt the active job mid-extraction or mid-download.
- Once pause is requested, the scraper should finish the current job, then halt before advancing to the next card.
- The UI should reflect this transitional state, for example `Pausing after current job...`.

### Resume Semantics

- Clicking `Start` from paused state should resume from the next unscraped job in the same run.
- The scraper should not restart the page or replay already processed cards in that run.

### Stop Semantics

- `Stop` should end the run cleanly and clear resumable run state.
- Stopping should not delete already downloaded files.
- After stop, the modal should remain visible with final counts until closed by the user.

## Architecture

### Manifest and Action Behavior

`manifest.json` should remove `action.default_popup`. The action click path should move to `background.js`.

Message flow:

1. User clicks extension icon.
2. `background.js` validates the active tab URL.
3. `background.js` injects required scripts if needed and sends `openControls`.
4. `content_script.js` creates the UI if absent, then opens or focuses it.
5. Modal button actions are handled in the content script and update local run state.

### UI Ownership

The in-page UI should live entirely in `content_script.js`, with helper extraction if the file becomes too large. The content script already owns scrape progression and is the right place to keep visual run state synchronized with job processing.

Recommended internal split:

- scrape engine state
- UI rendering and event binding
- message bridge for background/action communication

If the file grows materially, extract a dedicated helper such as `in_page_controls.js` rather than continuing to expand a single file.

### Run State Model

The scraper should track a single run-local session object in the content script. This state replaces the popup-dependent view state and should be the source of truth for modal rendering.

Suggested fields:

```js
{
  status: "idle" | "running" | "pauseRequested" | "paused" | "stopped" | "done" | "error",
  page: 1,
  currentPageTotal: 0,
  currentCardIndex: 0,
  savedCount: 0,
  failedCount: 0,
  currentJobLabel: "",
  events: [],
  isModalOpen: true
}
```

Event entries should be append-only for the active run and capped to a small recent window such as the latest 20 items.

### Failure Accounting

Failed downloads should no longer be presented as a global, cross-run popup count. The in-page modal should show failures for the active run only.

The background worker may still persist detailed failure records for debugging, but those records should be tied to the active run via an identifier or only surfaced to the modal through run-local updates. Starting a new run must reset the visible failure count and event log.

### Resume Tracking

To resume from the next unscraped job after pause, the content script should retain enough state to continue in the existing card loop without restarting from page top.

Practical approach:

- Keep the active cards collection and the current index for the current page.
- On pause request, let the current iteration settle, set status to `paused`, and return from the loop before incrementing to the next job.
- On resume, continue the same page loop from the stored next index.
- If the pause happened between pages, resume at the next page load boundary using the last stored page state.

The implementation should prefer explicit indices over trying to infer progress from DOM selection state.

## Data Flow

### Control Messages

Messages into the content script:

```js
{ action: "openControls" }
{ action: "startRun" }
{ action: "pauseRun" }
{ action: "stopRun" }
```

The background worker only needs to send `openControls` from the action click. If all button handlers live inside the content script, `startRun`, `pauseRun`, and `stopRun` can remain internal UI events instead of runtime messages.

### Download Results

The current awaited background download contract should remain. Each job should update run state after the download response settles:

- success increments `savedCount`
- terminal failure increments `failedCount`
- both outcomes append a log entry

The modal should render both the aggregate counts and the most recent per-job outcomes.

## UI States

### Idle

- Modal open after icon click
- `Start` enabled
- `Pause` and `Stop` disabled
- No stale failures from earlier runs

### Running

- `Start` disabled
- `Pause` enabled
- `Stop` enabled
- Progress and event log update live

### Pause Requested

- `Pause` disabled
- Status text indicates the current job is being finished

### Paused

- `Start` becomes the resume action
- `Stop` remains enabled
- Counts and event log remain visible

### Done / Stopped / Error

- Final counts remain visible
- User can close to chip or leave modal open
- Starting a new run resets run-local counts, current job, and log

## Error Handling

- If the icon is clicked on a non-LinkedIn Jobs page, do not inject controls.
- If the content script cannot be reached, `background.js` should inject the required scripts and retry once.
- If scraping encounters an unrecoverable page-state error, modal state should switch to `error` and preserve the latest event log.
- If the modal is closed while scraping, the scrape should continue unaffected.

## Testing

Manual verification should cover:

1. Click the extension icon on a LinkedIn Jobs page and confirm the in-page modal appears.
2. Confirm the modal does not appear automatically without the icon click.
3. Start a scrape from the modal and confirm live progress updates.
4. Close the modal mid-run and confirm the chip remains visible.
5. Click the chip and confirm the modal restores the same live state.
6. Pause mid-run and confirm the current job finishes before the scraper halts.
7. Resume and confirm scraping continues from the next unscraped job.
8. Stop mid-run and confirm the run ends cleanly.
9. Start a second run and confirm saved/failed counts and the rolling log reset for the new run.
10. Confirm download failures appear in the run-local failed count and event log.
