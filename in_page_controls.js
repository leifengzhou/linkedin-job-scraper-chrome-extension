(function (root) {
  function getStatusText(session) {
    const detailText = session.detailText ? String(session.detailText).trim() : "";

    switch (session.status) {
      case "running":
        return "Scraping in progress...";
      case "pauseRequested":
        return "Pausing after current job...";
      case "paused":
        return detailText ? `Paused. Ready to resume. ${detailText}` : "Paused. Ready to resume.";
      case "stopped":
        return detailText ? `Stopped. ${detailText}` : "Stopped.";
      case "done":
        return detailText ? `Complete. ${detailText}` : "Complete. Target reached.";
      case "error":
        return "Stopped with an error.";
      default:
        return "Ready to start.";
    }
  }

  function buildControlsViewModel(session) {
    const isRunning = session.status === "running";
    const isPaused = session.status === "paused";
    const isPauseRequested = session.status === "pauseRequested";
    const canDownload = ["paused", "stopped", "done"].includes(session.status);
    const canEditTarget = ["idle", "paused", "stopped", "done"].includes(session.status);

    return {
      startLabel: isPaused ? "Resume" : "Start",
      startDisabled: isRunning || isPauseRequested,
      pauseDisabled: !isRunning,
      stopDisabled: !["running", "pauseRequested", "paused"].includes(session.status),
      downloadDisabled: !canDownload,
      targetDisabled: !canEditTarget,
      targetValue: session.targetCount ?? 25,
      targetMin: 1,
      targetMax: 500,
      statusText: getStatusText(session),
      pageSummary: `Page ${session.page} · ${session.currentPageTotal} jobs on this page`,
      savedSummary: `Saved ${session.savedCount}`,
      failedSummary: `Failed ${session.failedCount}`,
      currentJobText: session.currentJobLabel ? `Current job: ${session.currentJobLabel}` : "Current job: Waiting to start"
    };
  }

  function ensureControlsStyle(document) {
    if (document.getElementById("linked-in-scraper-controls-style")) {
      return;
    }

    const styleEl = document.createElement("style");
    styleEl.id = "linked-in-scraper-controls-style";
    styleEl.textContent = `
      #linked-in-scraper-controls-root {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #1f2937;
      }

      #linked-in-scraper-controls-root [data-role="modal"] {
        width: 320px;
        background: #fffefb;
        border: 1px solid #d9e1ea;
        border-radius: 14px;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
        padding: 14px;
      }

      #linked-in-scraper-controls-root [data-role="chip"] {
        border: none;
        border-radius: 999px;
        background: #0a66c2;
        color: white;
        font-size: 12px;
        font-weight: 600;
        padding: 10px 14px;
        cursor: pointer;
        box-shadow: 0 12px 28px rgba(10, 102, 194, 0.25);
      }

      #linked-in-scraper-controls-root [data-role="header"] {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }

      #linked-in-scraper-controls-root [data-role="title"] {
        font-size: 14px;
        font-weight: 700;
      }

      #linked-in-scraper-controls-root [data-role="summary-row"] {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 8px 0 10px;
      }

      #linked-in-scraper-controls-root [data-role="pill"] {
        background: #eef4fb;
        border-radius: 999px;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 600;
      }

      #linked-in-scraper-controls-root [data-role="actions"] {
        display: flex;
        gap: 8px;
        margin: 12px 0;
        flex-wrap: wrap;
      }

      #linked-in-scraper-controls-root button {
        border: none;
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
      }

      #linked-in-scraper-controls-root button[data-action="start"] {
        background: #0a66c2;
        color: white;
      }

      #linked-in-scraper-controls-root button[data-action="pause"] {
        background: #fbbf24;
        color: #1f2937;
      }

      #linked-in-scraper-controls-root button[data-action="stop"] {
        background: #dc2626;
        color: white;
      }

      #linked-in-scraper-controls-root button[data-action="download"] {
        background: #0f766e;
        color: white;
      }

      #linked-in-scraper-controls-root button[data-action="close"] {
        background: #eef2f7;
        color: #374151;
      }

      #linked-in-scraper-controls-root button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      #linked-in-scraper-controls-root [data-role="status"],
      #linked-in-scraper-controls-root [data-role="current-job"],
      #linked-in-scraper-controls-root [data-role="page-summary"] {
        margin: 0 0 8px;
        font-size: 12px;
      }

      #linked-in-scraper-controls-root [data-role="target-row"] {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 10px 0 4px;
        font-size: 12px;
      }

      #linked-in-scraper-controls-root [data-role="target-label"] {
        font-weight: 600;
      }

      #linked-in-scraper-controls-root [data-role="target-input"] {
        width: 88px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 6px 8px;
        font: inherit;
      }

      #linked-in-scraper-controls-root [data-role="events"] {
        margin: 10px 0 0;
        padding-left: 18px;
        max-height: 180px;
        overflow: auto;
        font-size: 12px;
      }

      #linked-in-scraper-controls-root [data-role="events"] li {
        margin-bottom: 6px;
      }
    `;
    document.head.appendChild(styleEl);
  }

  function createControlsDom(document) {
    ensureControlsStyle(document);

    const rootEl = document.createElement("div");
    rootEl.id = "linked-in-scraper-controls-root";
    rootEl.innerHTML = `
      <button type="button" data-role="chip" hidden>Show scraper progress</button>
      <section data-role="modal">
        <div data-role="header">
          <strong data-role="title">LinkedIn Job Scraper</strong>
          <button type="button" data-action="close">Close</button>
        </div>
        <p data-role="status"></p>
        <p data-role="page-summary"></p>
        <div data-role="summary-row">
          <span data-role="pill" data-summary="saved"></span>
          <span data-role="pill" data-summary="failed"></span>
        </div>
        <p data-role="current-job"></p>
        <label data-role="target-row">
          <span data-role="target-label">Jobs to scrape</span>
          <input type="number" data-role="target-input" min="1" max="500" step="1" inputmode="numeric">
        </label>
        <div data-role="actions">
          <button type="button" data-action="start">Start</button>
          <button type="button" data-action="pause">Pause</button>
          <button type="button" data-action="stop">Stop</button>
          <button type="button" data-action="download">Download</button>
        </div>
        <ul data-role="events"></ul>
      </section>
    `;

    return {
      rootEl,
      chipEl: rootEl.querySelector('[data-role="chip"]'),
      modalEl: rootEl.querySelector('[data-role="modal"]'),
      statusEl: rootEl.querySelector('[data-role="status"]'),
      pageSummaryEl: rootEl.querySelector('[data-role="page-summary"]'),
      savedSummaryEl: rootEl.querySelector('[data-summary="saved"]'),
      failedSummaryEl: rootEl.querySelector('[data-summary="failed"]'),
      currentJobEl: rootEl.querySelector('[data-role="current-job"]'),
      eventsEl: rootEl.querySelector('[data-role="events"]'),
      startButtonEl: rootEl.querySelector('[data-action="start"]'),
      pauseButtonEl: rootEl.querySelector('[data-action="pause"]'),
      stopButtonEl: rootEl.querySelector('[data-action="stop"]'),
      downloadButtonEl: rootEl.querySelector('[data-action="download"]'),
      targetInputEl: rootEl.querySelector('[data-role="target-input"]'),
      closeButtonEl: rootEl.querySelector('[data-action="close"]')
    };
  }

  function renderControls(domRefs, viewModel, session) {
    domRefs.statusEl.textContent = viewModel.statusText;
    domRefs.pageSummaryEl.textContent = viewModel.pageSummary;
    domRefs.savedSummaryEl.textContent = viewModel.savedSummary;
    domRefs.failedSummaryEl.textContent = viewModel.failedSummary;
    domRefs.currentJobEl.textContent = viewModel.currentJobText;
    domRefs.startButtonEl.textContent = viewModel.startLabel;
    domRefs.startButtonEl.disabled = viewModel.startDisabled;
    domRefs.pauseButtonEl.disabled = viewModel.pauseDisabled;
    domRefs.stopButtonEl.disabled = viewModel.stopDisabled;
    domRefs.downloadButtonEl.disabled = viewModel.downloadDisabled;
    domRefs.targetInputEl.disabled = viewModel.targetDisabled;
    domRefs.targetInputEl.value = String(viewModel.targetValue);
    domRefs.targetInputEl.min = String(viewModel.targetMin);
    domRefs.targetInputEl.max = String(viewModel.targetMax);
    domRefs.targetInputEl.step = "1";
    domRefs.chipEl.textContent = `${viewModel.startLabel === "Resume" ? "Resume" : "Show"} scraper progress`;

    domRefs.eventsEl.textContent = "";
    for (const event of session.events.slice().reverse()) {
      const itemEl = domRefs.eventsEl.ownerDocument.createElement("li");
      itemEl.textContent = event.ok
        ? `Saved: ${event.label}`
        : `Failed: ${event.label}${event.error ? ` (${event.error})` : ""}`;
      domRefs.eventsEl.appendChild(itemEl);
    }
  }

  function showChip(domRefs) {
    domRefs.modalEl.hidden = true;
    domRefs.modalEl.style.display = "none";
    domRefs.chipEl.hidden = false;
    domRefs.chipEl.style.display = "inline-flex";
  }

  function showModal(domRefs) {
    domRefs.modalEl.hidden = false;
    domRefs.modalEl.style.display = "block";
    domRefs.chipEl.hidden = true;
    domRefs.chipEl.style.display = "none";
  }

  const api = {
    buildControlsViewModel,
    createControlsDom,
    getStatusText,
    renderControls,
    showChip,
    showModal
  };

  root.LinkedInScraperInPageControls = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
