# Manual Export And Target Count Design

**Date:** 2026-03-27
**Status:** Draft

## Overview

Change the in-page scraper controls so export happens only when the user explicitly clicks a `Download` button. The scraper should keep collected jobs in memory while a run is paused, stopped, or completed, and allow repeated downloads of the current snapshot.

Add a per-run target count input to define what `done` means. Instead of treating `done` as "reached the end of LinkedIn results," a run should be considered complete once it reaches the requested number of processed jobs.

## Goals

- Require an explicit user click before exporting any file.
- Keep the current in-memory export buffer as the source of truth for scraped jobs.
- Enable download only when the run is paused, stopped, or complete.
- Support repeated downloads of the same snapshot without mutating run state.
- Add a bounded integer target count per run with a default of `25`.
- Redefine `done` to mean "target count reached."

## Non-Goals

- Persisting the export buffer across browser restarts or extension reloads.
- Allowing the active target count to change mid-run.
- Supporting export from the `error` state in this iteration.
- Adding popup-based export controls for this change.

## User Experience

### In-Page Controls

The in-page controls should contain four action buttons in a single row:

```text
Start / Resume | Pause | Stop | Download
```

The `Download` button must appear to the right of `Stop`.

### Download Availability

- `idle`: disabled
- `running`: disabled
- `pauseRequested`: disabled
- `paused`: enabled
- `stopped`: enabled
- `done`: enabled
- `error`: disabled

Clicking `Download` should export all jobs and failures collected so far. The button remains enabled after a successful export so the user can download the same snapshot again.

### Target Count Input

The in-page controls should include a numeric input for the requested number of jobs to process in the run.

- default: `25`
- minimum: `1`
- maximum: `500`
- integers only

The field is editable only when the session is `idle`, `paused`, `stopped`, or `done`. It is locked while the scraper is `running` or `pauseRequested`.

## Architecture

### Content Script Ownership

The content script remains the owner of:

- the scrape session state
- the in-memory export buffer
- the per-run target count

No background-owned scrape state is required for this change.

### Export Flow

The content script should stop auto-exporting when a run stops or completes. Instead:

1. the scraper continues appending job records and failures into the in-memory export buffer
2. terminal states leave the buffer intact
3. clicking `Download` builds a JSON snapshot from the current buffer
4. the content script sends that snapshot to the existing background `downloadJsonExport` action
5. the background worker performs the actual `chrome.downloads.download()` call

This keeps publishing risk low because export remains user-initiated and data stays local unless the user downloads it.

### Target Count Ownership

The target count should live in the content-script session layer. When a new run starts, the active run snapshots the current target value and keeps using that fixed value until the run ends.

Resuming from `paused` continues using the same active target because it is the same run. Starting a fresh run resets the export buffer and snapshots the current input value again.

## Session Model

The session model should keep its current status values and add target-related fields.

Recommended additions:

```js
{
  targetCount: 25,
  activeTargetCount: null
}
```

Semantics:

- `targetCount`: editable value shown in the controls when the run is not active
- `activeTargetCount`: the fixed target for the current run, set when the run starts

### Terminal States

- `paused`: pause requested and current job finished; buffer remains available
- `stopped`: user explicitly stopped the run; buffer remains available
- `done`: processed-job target reached; buffer remains available
- `error`: unexpected failure; no export button in this iteration

If LinkedIn runs out of results before the requested target is reached, the run should end with `stopped` status and a user-facing message indicating that the result list ended before the target.

## Processing Rules

The target should apply to processed jobs, where:

```text
processedCount = savedCount + failedCount
```

This is the most stable interpretation because each card ultimately becomes either:

- a saved job record, possibly partial
- a recorded extraction failure

The run should stop as soon as `processedCount >= activeTargetCount`.

Partial jobs still count as saved jobs, not failures.

## UI Behavior

### Controls View Model

The controls view model should expose:

- `downloadDisabled`
- `targetValue`
- `targetDisabled`
- `targetMin`
- `targetMax`

The status text should reflect the new terminal meaning for `done`, for example:

- `Complete. Target reached.`

If results end early, the current-job or status copy should explain the reason:

- `Reached end of results before target.`

### Validation

The target input should clamp invalid values into the allowed range and reject non-integer values. Since browser numeric inputs can still expose invalid intermediate strings, the control layer should normalize the value before storing it into session state.

## File Impact

Expected file changes:

- `in_page_controls.js`
  Add the target count input and `Download` button, plus state-dependent enablement.
- `scrape_session.js`
  Add target-related session fields and helpers.
- `content_script.js`
  Remove automatic final export, add explicit download handling, enforce target stop condition, and surface early-end messaging.
- tests in `tests/`
  Update control/session/content-script tests to cover manual export and target-count stopping behavior.

## Verification

Manual verification should cover:

1. Start a run with the default target `25` and confirm the scraper stops when `25` jobs have been processed.
2. Start a run with a custom target and confirm the field is locked while the run is active.
3. Confirm `Download` is disabled before start and while running.
4. Pause a run and confirm `Download` becomes enabled and exports the current snapshot.
5. Stop a run and confirm `Download` exports the current snapshot.
6. Complete a run by reaching the target and confirm `Download` remains enabled.
7. Click `Download` multiple times and confirm repeated exports succeed.
8. Use a search with fewer available results than the target and confirm the scraper stops with an end-of-results message rather than `done`.
