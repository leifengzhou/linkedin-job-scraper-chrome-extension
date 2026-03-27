# JSON Export Pivot Design

**Date:** 2026-03-27
**Status:** Draft

## Overview

Replace per-job Markdown downloads with a single final JSON export written at the end of the scrape. During the run, extracted jobs should be stored temporarily inside the extension runtime rather than downloaded one-by-one.

The scrape should continue to validate and retry job extraction per card, but file download should happen only once, after the run completes or stops cleanly with collected results ready to export.

## Goals

- Remove per-job file downloads from the hot path.
- Reduce download noise and browser interruption handling during the scrape.
- Preserve the existing extraction quality checks and retry behavior for job data.
- Include partially extracted jobs in the final result instead of dropping them.
- Download a single `.json` file containing structured scrape results at the end.

## Non-Goals

- Reintroducing per-job Markdown output in this iteration.
- Persisting unfinished scrape buffers across browser restart or hard extension reload.
- Exporting ZIP bundles or multi-file output in this iteration.

## User Experience

### During the Run

- The in-page modal continues to show run progress.
- Saved count should represent jobs successfully captured into the in-memory export buffer.
- Failed count should represent jobs that could not be represented as usable structured objects at all.
- Partial jobs should count as saved, not failed.

### At the End

- When the run completes, the extension downloads one JSON file.
- Recommended filename:

```text
scraped-jobs-YYYY-MM-DD.json
```

- If the run is stopped manually after collecting some results, the extension should still export the collected jobs gathered up to that point.

## Data Model

The final JSON file should contain a top-level object rather than a bare array.

Recommended shape:

```json
{
  "exportedAt": "2026-03-27T18:30:00.000Z",
  "source": "linkedin-job-scraper",
  "runDate": "2026-03-27",
  "summary": {
    "savedCount": 42,
    "failedCount": 3,
    "partialCount": 5
  },
  "jobs": [
    {
      "title": "AI Strategist",
      "company": "Distyl AI",
      "location": "San Francisco, CA",
      "salary": "Not listed",
      "datePosted": "March 27, 2026",
      "applyType": "Apply on company website",
      "applyUrl": "https://example.com/jobs/123",
      "linkedinUrl": "https://www.linkedin.com/jobs/view/123/",
      "jobId": "123",
      "description": "Role details...",
      "aboutCompany": "Company details...",
      "missingFields": [],
      "exhaustedRetries": false
    }
  ],
  "failures": [
    {
      "label": "Company - Title",
      "error": "No currentJobId"
    }
  ]
}
```

## Partial Job Handling

This pivot should preserve the existing behavior where a job is still accepted even when some critical fields remain missing after retries.

Rules:

- If a usable job object is available, append it to `jobs`.
- Add `missingFields` to each job record.
- Add `exhaustedRetries: true` when retries were exhausted and fields are still missing.
- Increment `partialCount` when `missingFields.length > 0`.
- Only append to `failures` when a usable job object cannot be produced at all.

Examples of terminal failure:

- no `currentJobId`
- unrecoverable collection exception before a job object exists

## Architecture

### Content Script

The content script should stop sending per-job `download` messages.

Instead it should:

1. collect and validate job data per card
2. normalize the job record for export
3. append the record to an in-memory run buffer
4. track whether the job is partial
5. continue scraping the next card

The content script should own a run-local export buffer such as:

```js
{
  jobs: [],
  failures: [],
  partialCount: 0
}
```

This buffer can live alongside the existing run session state.

### Background Worker

The background worker should no longer own a per-job tracked download lifecycle.

Instead it should provide one export action:

```js
{
  action: "downloadJsonExport",
  filename: "scraped-jobs-2026-03-27.json",
  payload: { ...final export object... },
  timeoutMs: 5000
}
```

The background worker should serialize the payload to JSON and use `chrome.downloads.download()` once.

## Retry Logic

### Keep

- per-job extraction retries in `collectJobDataWithRetries()`
- final single-file download retry in the background worker

### Remove

- per-job file download retry
- per-job failed-download logging as part of normal scrape progression

### Rationale

The scraper still needs extraction retries because LinkedIn panel state can be stale or incomplete. That is a data-quality concern and should remain.

Per-job download retry is no longer useful once jobs are buffered in memory. The only download operation that remains is the final JSON export, so only that one needs download recovery.

## Failure Accounting

With this pivot, failures split into two categories:

1. **Extraction failure**
   The scraper could not produce a usable structured object for a job. Record in `failures`.

2. **Final export download failure**
   The scrape buffer is good, but the final JSON file failed to download. This should use the existing background retry pattern and surface as an export failure, not as many per-job failures.

The visible modal counts should reflect extraction outcomes, not file-system outcomes.

## File and Code Impact

Likely changes:

- `content_script.js`
  Remove per-job download messages and append export records locally.
- `background.js`
  Replace per-job download message handling with final JSON export handling.
- `download_recovery.js`
  Keep generic data-url generation and final-download retry helpers; remove assumptions that every request is per-job Markdown.
- `README.md`
  Update output format and verification steps.
- tests
  Replace per-job download assumptions with final export payload and retry expectations.

Likely removable or significantly reduced:

- per-job `failedDownloads` logging used as scrape progress feedback
- filename-based partial-job warning convention such as `EMPTY_FIELD_DETECTED_...`

## Verification

Manual verification should cover:

1. Start a scrape and confirm jobs are not downloaded individually.
2. Finish a scrape and confirm exactly one JSON file downloads.
3. Open the JSON and confirm successful jobs appear in `jobs`.
4. Confirm partial jobs still appear in `jobs` with `missingFields` populated.
5. Confirm unrecoverable extraction failures appear in `failures`.
6. Stop a run mid-way and confirm a partial JSON export still downloads with collected jobs.
7. Confirm interrupted final export download retries automatically.
