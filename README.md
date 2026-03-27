# LinkedIn Job Scraper - Chrome Extension

A Chrome Extension (Manifest V3) that scrapes LinkedIn job search results and exports the run as one structured JSON file. Built for collecting job postings to feed into an LLM-assisted application pipeline.

## Features

- Scrapes all jobs from LinkedIn search results, page by page
- Extracts title, company, location, salary, date posted, apply type, and full description
- Unwraps LinkedIn redirect URLs to get direct company apply links
- Buffers extracted jobs in memory and downloads one JSON export only when the user clicks `Download`
- Opens an in-page scraper modal from the extension icon on LinkedIn Jobs pages
- Supports `Start`, `Pause`, `Resume`, `Stop`, and `Download` directly in the page
- Lets the user set a per-run target count from `1` to `500`, defaulting to `25`
- Keeps a persistent reopen chip when the modal is closed mid-run
- Shows run-local saved/failed counts and a rolling event log in the page
- Automatically retries an interrupted final export download for up to 5 seconds
- Logs unrecoverable final export download failures to extension storage for inspection
- Handles pagination automatically
- Supports both the legacy LinkedIn jobs results layout and the newer `/jobs/search/` results layout

## Installation

No build step required — the extension loads directly from source.

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer Mode** (toggle in top-right)
4. Click **Load Unpacked** and select the cloned directory
5. Navigate to a LinkedIn job search page (e.g. `linkedin.com/jobs/search/...`)
6. Click the extension icon to open the in-page controls
7. Set **Jobs to scrape** if you want something other than `25`
8. Click **Start** in the in-page modal

## Output

The scraper downloads a single file only when the user clicks **Download** after pausing, stopping, or completing a run:

```
~/Downloads/scraped-jobs-YYYY-MM-DD.json
```

The JSON export contains run metadata, summary counts, successful jobs, and unrecoverable extraction failures:

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
      "title": "Senior Software Engineer",
      "company": "Acme Corp",
      "location": "San Francisco, CA (Remote)",
      "salary": "$150K/yr - $200K/yr",
      "datePosted": "March 15, 2026",
      "applyType": "Apply on company website",
      "applyUrl": "https://acme.com/careers/123",
      "linkedinUrl": "https://www.linkedin.com/jobs/view/4384082246/",
      "jobId": "4384082246",
      "description": "Full job description text...",
      "aboutCompany": "Company overview...",
      "missingFields": [],
      "exhaustedRetries": false
    }
  ],
  "failures": [
    {
      "label": "Acme Corp - Senior Software Engineer",
      "error": "No currentJobId"
    }
  ]
}
```

## Architecture

```
manifest.json       → MV3 config; permissions: downloads, tabs, storage, scripting
content_script.js   → Core scraper; runs in LinkedIn tab; DOM interaction + in-page control wiring
background.js       → Service worker; handles action clicks, final JSON export downloads, and retry recovery
scrape_session.js   → Run-local session state helpers for pause/resume/progress tracking
in_page_controls.js → In-page modal/chip rendering helpers
json_export.js      → Run-local JSON export buffer and payload helpers
```

### How It Works

1. Clicking the **extension icon** on a LinkedIn Jobs page opens the in-page scraper controls
2. **Start** begins a scrape in the current tab; **Pause** finishes the current job then halts before the next one
3. The **content script** iterates through job cards in the left panel, clicking each one
4. For each card, it snapshots the URL and description *before* clicking, then waits for both to change — this prevents reading stale data from the previous job
5. Job metadata (title, company, location, salary) is extracted from the left panel card; the full description and apply link come from the right panel
6. Each usable job is normalized into a structured record and added to an in-memory export buffer in the content script
7. Partial jobs are still kept in the export buffer with `missingFields` and `exhaustedRetries` annotations
8. The run is considered **done** when the requested processed-job target is reached, where `processed = saved + failed`
9. If LinkedIn runs out of results before the target is reached, the run stops with the collected partial buffer still available
10. Clicking **Download** after `Pause`, `Stop`, or `done` serializes the current buffer and downloads one JSON file via `chrome.downloads`
11. The **background service worker** retries an interrupted final download with a fresh download for up to 5 seconds total
12. If recovery still fails, the worker logs the failure to `chrome.storage.local.failedDownloads` for debugging, but the run-local saved/failed counts continue to reflect extraction outcomes only
13. Closing the modal leaves behind a small reopen chip in the page
14. After all cards on a page, it clicks the next-page button and repeats until the target is met, the results end, or the user stops the run

## Failed Download Logs

Unrecoverable download failures are stored in `chrome.storage.local` under the `failedDownloads` key.

These records are a debugging trail. The visible failed count in the in-page modal is run-local and resets when a new scrape starts.

To inspect them:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Find the extension and click the `service worker` link
4. In DevTools, open `Application` -> `Storage` -> `Extension storage` -> `chrome.storage.local`
5. Inspect `failedDownloads`

## Manual Verification

- Reload the unpacked extension
- Refresh the LinkedIn Jobs tab
- Test once on the newer `/jobs/search/` layout and once on a legacy results layout if LinkedIn serves both in your account
- Click the extension icon and confirm the in-page modal appears
- Confirm the target-count input defaults to `25`
- Start a scrape from the in-page modal
- Confirm progress updates and pagination behavior while no file downloads during the active run
- Close the modal and confirm the reopen chip remains visible
- Reopen from the chip and confirm progress is preserved
- Pause mid-run and confirm the current job finishes before the scraper halts
- Confirm `Download` is disabled while the scraper is still running
- Confirm `Download` becomes enabled after pause
- Click `Download` while paused and confirm a JSON file appears in `~/Downloads/`
- Resume and confirm scraping continues from the next unscraped job
- Stop mid-run and confirm the run ends cleanly without auto-downloading
- Click `Download` again after stop and confirm a partial JSON export downloads
- Start a second run and confirm the visible saved/failed counts reset for the new run
- Start a run with a small custom target such as `3` and confirm the run stops when `saved + failed` reaches `3`
- Confirm `Download` remains enabled after a target-reached run
- Click `Download` multiple times and confirm repeated exports work
- Use a search with fewer available results than the target and confirm the run stops with an end-of-results message
- Confirm healthy downloads do not incur a fixed 5-second delay
- Confirm no file downloads unless the user clicks `Download`
- Open the JSON file and confirm partial jobs still appear in `jobs` with `missingFields`
- Confirm unrecoverable extraction failures appear under `failures`
- Confirm interrupted final export downloads retry automatically for up to 5 seconds
- Confirm unrecoverable final export failures are stored in `chrome.storage.local.failedDownloads`

## Limitations

- LinkedIn's DOM structure changes frequently. The scraper uses stable attributes (`data-testid`, `aria-label`, `role`, `componentkey`) rather than CSS class names, but may still need updates if LinkedIn restructures their markup.
- Requires an active LinkedIn session (you must be logged in).
- Designed for LinkedIn jobs search/results layouts, including the current `/jobs/search/` experience and legacy two-pane variants.

## License

MIT
