# LinkedIn Job Scraper - Chrome Extension

A Chrome Extension (Manifest V3) that scrapes LinkedIn job search results and exports the run as one structured JSON file. Built for collecting job postings to feed into an LLM-assisted application pipeline.

## Features

- Scrapes all jobs from LinkedIn search results, page by page
- Extracts title, company, location, salary, date posted, apply type, and full description
- Unwraps LinkedIn redirect URLs to get direct company apply links
- Buffers extracted jobs in memory and downloads one JSON export only when the user clicks `Download`
- Opens a guidance popup from the extension icon on every page
- Launches the existing in-page scraper modal from the popup on supported LinkedIn Jobs `search-results/*` pages
- Supports `Start`, `Pause`, `Resume`, `Stop`, and `Download` directly in the page
- Lets the user set a per-run target count from `1` to `500`, defaulting to `25`
- Keeps a persistent reopen chip when the modal is closed mid-run
- Shows run-local saved/failed counts and a rolling event log in the page
- Automatically retries an interrupted final export download for up to 5 seconds
- Logs unrecoverable final export download failures to extension storage for inspection
- Handles pagination automatically
- Supports the current LinkedIn Jobs `search-results/*` results layout

## Installation

No build step required — the extension loads directly from source.

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer Mode** (toggle in top-right)
4. Click **Load Unpacked** and select the cloned directory
5. Sign in to LinkedIn
6. Navigate to a LinkedIn Jobs search-results page (e.g. `linkedin.com/jobs/search-results/...`)
7. Search for a specific role and apply filters such as location and date posted
8. Click the extension icon to open the popup
9. Click **Ready to Scrape** on the `search-results/*` page to open the in-page controls
10. Set **Jobs to scrape** if you want something other than `25`
11. Click **Start** in the in-page modal

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
popup.html / .js    → Extension icon popup with LinkedIn Jobs guidance and Ready-to-Scrape action
popup_state.js      → Supported-page detection for the popup
content_script.js   → Core scraper; runs in LinkedIn tab; DOM interaction + in-page control wiring
background.js       → Service worker; handles final JSON export downloads and retry recovery
scrape_session.js   → Run-local session state helpers for pause/resume/progress tracking
in_page_controls.js → In-page modal/chip rendering helpers
json_export.js      → Run-local JSON export buffer and payload helpers
```

### How It Works

1. Clicking the **extension icon** always opens the popup
2. The popup tells the user to sign in, search for a specific role, and apply filters before scraping
3. On supported LinkedIn Jobs `search-results/*` pages, clicking **Ready to Scrape** opens the existing in-page scraper controls
4. **Start** begins a scrape in the current tab; **Pause** finishes the current job then halts before the next one
5. The **content script** iterates through job cards in the left panel, clicking each one
6. For each card, it snapshots the URL and description *before* clicking, then waits for both to change — this prevents reading stale data from the previous job
7. Job metadata (title, company, location, salary) is extracted from the left panel card; the full description and apply link come from the right panel
8. Each usable job is normalized into a structured record and added to an in-memory export buffer in the content script
9. Partial jobs are still kept in the export buffer with `missingFields` and `exhaustedRetries` annotations
10. The run is considered **done** when the requested processed-job target is reached, where `processed = saved + failed`
11. If LinkedIn runs out of results before the target is reached, the run stops with the collected partial buffer still available
12. Clicking **Download** after `Pause`, `Stop`, or `done` serializes the current buffer and downloads one JSON file via `chrome.downloads`
13. The **background service worker** retries an interrupted final download with a fresh download for up to 5 seconds total
14. If recovery still fails, the worker logs the failure to `chrome.storage.local.failedDownloads` for debugging, but the run-local saved/failed counts continue to reflect extraction outcomes only
15. Closing the modal leaves behind a small reopen chip in the page
16. After all cards on a page, it clicks the next-page button and repeats until the target is met, the results end, or the user stops the run

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
- Open a LinkedIn Jobs `search-results/*` page and refresh the tab
- Click the extension icon on a non-LinkedIn page and confirm the popup opens with **Ready to Scrape** disabled
- Click the extension icon on a LinkedIn Jobs `/jobs/search/` page and confirm **Ready to Scrape** stays disabled
- Click the extension icon on a supported LinkedIn Jobs `search-results/*` page and confirm **Ready to Scrape** becomes enabled
- Click **Ready to Scrape** and confirm the in-page modal appears
- Confirm the scraper enumerates cards from the left `SearchResultsMainContent` results column
- Start a scrape and confirm title, company, location, date posted, salary, and apply type export correctly
- Confirm `About the job` expands from the dedicated `JobDetails_AboutTheJob_*` section and exports correctly
- Confirm `About the company` expands from the dedicated `JobDetails_AboutTheCompany_*` section and exports correctly
- Confirm external company apply links export when present, otherwise the LinkedIn job permalink is used
- Confirm the visible next-page button advances pagination
- Confirm progress updates while no file downloads during the active run
- Pause mid-run and confirm the current job finishes before the scraper halts
- Confirm `Download` is disabled while the scraper is still running and enabled after pause/stop/done
- Click `Download` and confirm a JSON file appears in `~/Downloads/`
- Open the JSON file and confirm partial jobs still appear in `jobs` with `missingFields`
- Confirm unrecoverable extraction failures appear under `failures`
- Confirm interrupted final export downloads retry automatically for up to 5 seconds
- Confirm unrecoverable final export failures are stored in `chrome.storage.local.failedDownloads`

## Limitations

- LinkedIn's DOM structure changes frequently. The scraper uses stable attributes (`data-testid`, `aria-label`, `role`, `componentkey`) rather than CSS class names, but may still need updates if LinkedIn restructures their markup.
- Requires an active LinkedIn session (you must be logged in).
- Designed for the current LinkedIn Jobs `search-results/*` two-pane results layout.

## License

MIT
