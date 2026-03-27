(function (root) {
  function getStatusText(session) {
    const detailText = session.detailText ? String(session.detailText).trim() : "";

    switch (session.status) {
      case "running":
        return "Scraping in progress. This tab must remain visible. Open a new Chrome window if you need to keep browsing.";
      case "pauseRequested":
        return "Pausing after current job. This tab must remain visible. Open a new Chrome window if you need to keep browsing.";
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
    let primaryLabel = "Start";
    let primaryAction = "start";

    if (isPaused) {
      primaryLabel = "Resume";
      primaryAction = "resume";
    } else if (isRunning || isPauseRequested) {
      primaryLabel = "Pause";
      primaryAction = "pause";
    }

    return {
      primaryLabel,
      primaryAction,
      primaryDisabled: isPauseRequested,
      downloadDisabled: !canDownload,
      statusTone: isRunning || isPauseRequested ? "warning" : "default",
      targetDisabled: !canEditTarget,
      targetValue: session.targetCount ?? 25,
      targetMin: 1,
      targetMax: 500,
      statusText: getStatusText(session),
      pageSummary: `Page ${session.page} · ${session.currentPageTotal} jobs on this page`,
      savedSummary: `Saved ${session.savedCount}`,
      failedSummary: `Failed ${session.failedCount}`
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
        border: 1px solid #dbe4ee;
        border-radius: 16px;
        box-shadow: 0 20px 44px rgba(15, 23, 42, 0.16);
        padding: 16px;
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
        width: auto;
        height: auto;
        line-height: 1.1;
        text-align: center;
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
        margin: 8px 0 14px;
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
        margin: 8px 0 0;
        justify-content: flex-start;
        width: 100%;
      }

      #linked-in-scraper-controls-root button {
        border: none;
        border-radius: 12px;
        min-width: 0;
        height: 44px;
        padding: 0 14px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 700;
      }

      #linked-in-scraper-controls-root button svg {
        flex: 0 0 auto;
      }

      #linked-in-scraper-controls-root button[data-role="primary-action"] {
        background: #0a66c2;
        color: white;
        flex: 1 1 0;
      }

      #linked-in-scraper-controls-root button[data-role="primary-action"][data-action="pause"] {
        background: #f59e0b;
        color: #111827;
      }

      #linked-in-scraper-controls-root button[data-action="download"] {
        background: #0f766e;
        color: white;
        flex: 1 1 0;
      }

      #linked-in-scraper-controls-root button[data-action="close"] {
        background: #eef2f7;
        color: #374151;
        border-radius: 8px;
        width: auto;
        height: auto;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 500;
        flex: 0 0 auto;
      }

      #linked-in-scraper-controls-root button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      #linked-in-scraper-controls-root [data-role="status"],
      #linked-in-scraper-controls-root [data-role="page-summary"] {
        margin: 0 0 8px;
        font-size: 12px;
        line-height: 1.45;
      }

      #linked-in-scraper-controls-root [data-role="status"].warning {
        color: #b91c1c;
        font-weight: 700;
      }

      #linked-in-scraper-controls-root [data-role="target-row"] {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin: 10px 0 0;
        font-size: 12px;
        flex-wrap: nowrap;
      }

      #linked-in-scraper-controls-root [data-role="target-label"] {
        font-weight: 600;
        white-space: nowrap;
      }

      #linked-in-scraper-controls-root [data-role="target-input"] {
        width: 64px;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
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
        <div data-role="target-row">
          <label data-role="target-label" for="linked-in-scraper-target-input">Jobs to scrape (max 500)</label>
          <input id="linked-in-scraper-target-input" type="number" data-role="target-input" min="1" max="500" step="1" inputmode="numeric">
        </div>
        <div data-role="actions">
          <button type="button" data-role="primary-action" data-action="start">Start</button>
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
      eventsEl: rootEl.querySelector('[data-role="events"]'),
      primaryButtonEl: rootEl.querySelector('[data-role="primary-action"]'),
      downloadButtonEl: rootEl.querySelector('[data-action="download"]'),
      targetInputEl: rootEl.querySelector('[data-role="target-input"]'),
      closeButtonEl: rootEl.querySelector('[data-action="close"]')
    };
  }

  function getButtonIconMarkup(action) {
    if (action === "download") {
      return [
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
        '<path d="M8 2.5v7"></path>',
        '<path d="M5 7.5 8 10.5 11 7.5"></path>',
        '<path d="M3 12.5h10"></path>',
        "</svg>"
      ].join("");
    }

    if (action === "pause") {
      return [
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">',
        '<rect x="3" y="2.5" width="3.5" height="11" rx="1"></rect>',
        '<rect x="9.5" y="2.5" width="3.5" height="11" rx="1"></rect>',
        "</svg>"
      ].join("");
    }

    return [
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">',
      '<path d="M4 2.5v11l8-5.5-8-5.5z"></path>',
      "</svg>"
    ].join("");
  }

  function renderActionButton(buttonEl, action, label) {
    buttonEl.dataset = buttonEl.dataset || {};
    buttonEl.dataset.action = action;
    buttonEl.textContent = label;
    if (typeof buttonEl.innerHTML === "string") {
      buttonEl.innerHTML = `${getButtonIconMarkup(action)}<span>${label}</span>`;
    }
    if (typeof buttonEl.setAttribute === "function") {
      buttonEl.setAttribute("aria-label", label);
      buttonEl.setAttribute("title", label);
    }
  }

  function renderControls(domRefs, viewModel, session) {
    domRefs.statusEl.textContent = viewModel.statusText;
    if (domRefs.statusEl.classList && typeof domRefs.statusEl.classList.toggle === "function") {
      domRefs.statusEl.classList.toggle("warning", viewModel.statusTone === "warning");
    }
    domRefs.pageSummaryEl.textContent = viewModel.pageSummary;
    domRefs.savedSummaryEl.textContent = viewModel.savedSummary;
    domRefs.failedSummaryEl.textContent = viewModel.failedSummary;
    renderActionButton(domRefs.primaryButtonEl, viewModel.primaryAction, viewModel.primaryLabel);
    domRefs.primaryButtonEl.disabled = viewModel.primaryDisabled;
    renderActionButton(domRefs.downloadButtonEl, "download", "Download");
    domRefs.downloadButtonEl.disabled = viewModel.downloadDisabled;
    domRefs.targetInputEl.disabled = viewModel.targetDisabled;
    domRefs.targetInputEl.value = String(viewModel.targetValue);
    domRefs.targetInputEl.min = String(viewModel.targetMin);
    domRefs.targetInputEl.max = String(viewModel.targetMax);
    domRefs.targetInputEl.step = "1";
    domRefs.chipEl.textContent = `${viewModel.primaryLabel === "Resume" ? "Resume" : "Show"} scraper progress`;

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
