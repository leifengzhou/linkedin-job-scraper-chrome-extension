# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Chrome Extension (Manifest V3) that scrapes LinkedIn job search results and saves each posting as a Markdown file. Personal tool for job collection to feed a future LLM-assisted application pipeline.

## Loading / Reloading the Extension

There is no build step. The extension loads directly from source files.

1. `chrome://extensions` → Enable Developer Mode → Load Unpacked → select this directory
2. After any code change: click the ↺ reload button on the extension card
3. After reloading the extension, **also refresh the LinkedIn tab** — the old content script context is invalidated on reload

## Architecture

```
manifest.json       → MV3 config; permissions: downloads, tabs, storage, scripting
popup.html/js       → Extension popup UI; start/stop control; progress display
content_script.js   → Core scraper; runs in LinkedIn tab; DOM interaction + data extraction
background.js       → Service worker; handles chrome.downloads API (required by MV3)
```

### Message Flow

```
popup.js
  → chrome.scripting.executeScript (inject content_script.js if not yet loaded)
  → chrome.tabs.sendMessage({action: "start"})
      → content_script.js scrapes jobs
          → chrome.runtime.sendMessage({action: "download", filename, content})
              → background.js calls chrome.downloads.download()
          → chrome.runtime.sendMessage({action: "progress", scraped, total, page})
              → popup.js updates UI
  → chrome.tabs.sendMessage({action: "stop"})  [if user clicks Stop]
```

### Key Implementation Constraints

- **`chrome.storage.session` is unavailable in content scripts** — use `chrome.storage.local` throughout.
- **`btoa()` on large strings overflows the stack** — `background.js` encodes in 8192-byte chunks.
- **Content script re-injection safety** — `content_script.js` is guarded by `window.__linkedInScraperLoaded` to prevent re-declaration errors (`let isStopped already declared`) when `executeScript` is called on an already-loaded tab.
- **MV3 service workers can't use `Blob`/`URL.createObjectURL`** — downloads use base64 data URIs.
- **`chrome.runtime.sendMessage` calls from content script are fire-and-forget** — the popup may be closed; no `.then()` or `await` on these calls.

## LinkedIn DOM Selectors (as of 2026-03)

LinkedIn uses hashed class names that change on every deploy. The scraper avoids them.

| Purpose | Selector |
|---|---|
| Left panel (job list) | `[data-component-type="LazyColumn"]` |
| Job cards | `div[role="button"][componentkey]` filtered by presence of `button[aria-label^="Dismiss"]` |
| Job title (in card) | `button[aria-label^="Dismiss"]` aria-label → strip `"Dismiss "` prefix and `" job"` suffix |
| Company (in card) | `p` inside the div immediately after the title `<p>`'s parent |
| Location (in card) | Text of the element after the company div |
| Date posted (in card) | First `span` in the card whose text starts with `"Posted on"` |
| Salary (in card) | `<p>` matching `/\$[\d,.]+[KM]?\/yr/` |
| Apply type (in card) | Card text content includes `"Easy Apply"` |
| Expand description | `[data-testid="expandable-text-button"]` |
| Job description | `[data-testid="expandable-text-box"]` |
| External apply link | `a[aria-label="Apply on company website"]` |
| Next page button | `button[data-testid="pagination-controls-next-button-visible"]` |
| Job ID | `new URLSearchParams(window.location.search).get('currentJobId')` after clicking card |

Job ID is **not** available in the left panel card — it only appears in the URL after clicking.

## Output

Files saved to `~/Downloads/scraped-jobs/{YYYY-MM-DD}/{company}_{title}_{jobId}.md`.

The date folder is set once at scrape start (not per-file). Filename: company+title truncated to 80 chars + `_{jobId}.md`. Invalid filename chars replaced with `-`.

## Design Spec

Full original design spec: `docs/superpowers/specs/2026-03-17-linkedin-scraper-design.md`
