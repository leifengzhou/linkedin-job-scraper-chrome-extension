# LinkedIn Job Scraper - Chrome Extension

A Chrome Extension (Manifest V3) that scrapes LinkedIn job search results and saves each posting as a structured Markdown file. Built for collecting job postings to feed into an LLM-assisted application pipeline.

## Features

- Scrapes all jobs from LinkedIn search results, page by page
- Extracts title, company, location, salary, date posted, apply type, and full description
- Unwraps LinkedIn redirect URLs to get direct company apply links
- Saves each job as a clean Markdown file organized by date
- Start/stop control via extension popup with live progress updates
- Handles pagination automatically

## Installation

No build step required — the extension loads directly from source.

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer Mode** (toggle in top-right)
4. Click **Load Unpacked** and select the cloned directory
5. Navigate to a LinkedIn job search page (e.g. `linkedin.com/jobs/search/...`)
6. Click the extension icon and hit **Start Scraping**

## Output

Files are saved to:

```
~/Downloads/scraped-jobs/{YYYY-MM-DD}/{Company}_{Title}_{JobID}.md
```

Each file contains:

```markdown
# Senior Software Engineer
**Company:** Acme Corp
**Location:** San Francisco, CA (Remote)
**Salary:** $150K/yr - $200K/yr
**Date Posted:** March 15, 2026
**Apply:** [Apply on company website](https://acme.com/careers/123)
**Job ID:** 4384082246

---

## About the Job

Full job description text...
```

## Architecture

```
manifest.json       → MV3 config; permissions: downloads, tabs, storage, scripting
popup.html/js       → Extension popup UI; start/stop control; progress display
content_script.js   → Core scraper; runs in LinkedIn tab; DOM interaction + data extraction
background.js       → Service worker; handles chrome.downloads API (required by MV3)
```

### How It Works

1. **Popup** injects the content script and sends a `start` message
2. **Content script** iterates through job cards in the left panel, clicking each one
3. For each card, it snapshots the URL and description *before* clicking, then waits for both to change — this prevents reading stale data from the previous job
4. Job metadata (title, company, location, salary) is extracted from the left panel card; the full description and apply link come from the right panel
5. Each job is formatted as Markdown and sent to the **background service worker**, which saves it via `chrome.downloads`
6. After all cards on a page, it clicks the next-page button and repeats

## Limitations

- LinkedIn's DOM structure changes frequently. The scraper uses stable attributes (`data-testid`, `aria-label`, `role`, `componentkey`) rather than CSS class names, but may still need updates if LinkedIn restructures their markup.
- Requires an active LinkedIn session (you must be logged in).
- Designed for the `/jobs/search/` results page layout.

## License

MIT
