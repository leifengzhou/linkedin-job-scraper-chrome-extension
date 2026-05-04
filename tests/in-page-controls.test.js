const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildControlsViewModel,
  createControlsDom,
  getStatusText,
  renderControls,
  showChip,
  showModal
} = require("../in_page_controls.js");

test("idle state enables only Start", () => {
  const viewModel = buildControlsViewModel({
    status: "idle",
    page: 1,
    currentPageTotal: 0,
    savedCount: 0,
    failedCount: 0,
    currentJobLabel: "",
    events: []
  });

  assert.equal(viewModel.primaryLabel, "Start");
  assert.equal(viewModel.primaryAction, "start");
  assert.equal(viewModel.primaryDisabled, false);
  assert.equal(viewModel.downloadDisabled, true);
});

test("paused state turns the primary control into Resume and enables Download", () => {
  const viewModel = buildControlsViewModel({
    status: "paused",
    page: 2,
    currentPageTotal: 25,
    savedCount: 7,
    failedCount: 1,
    currentJobLabel: "Acme - Engineer",
    events: []
  });

  assert.equal(viewModel.primaryLabel, "Resume");
  assert.equal(viewModel.primaryAction, "resume");
  assert.equal(viewModel.primaryDisabled, false);
  assert.equal(viewModel.downloadDisabled, false);
  assert.match(viewModel.statusText, /Paused/);
});

test("running state turns the primary control into Pause while keeping Download disabled", () => {
  const viewModel = buildControlsViewModel({
    status: "running",
    page: 2,
    currentPageTotal: 25,
    savedCount: 7,
    failedCount: 1,
    currentJobLabel: "Acme - Engineer",
    events: []
  });

  assert.equal(viewModel.primaryLabel, "Pause");
  assert.equal(viewModel.primaryAction, "pause");
  assert.equal(viewModel.primaryDisabled, false);
  assert.equal(viewModel.downloadDisabled, true);
  assert.equal(viewModel.statusTone, "warning");
  assert.match(viewModel.statusText, /must remain visible/i);
  assert.match(viewModel.statusText, /new Chrome window/i);
});

test("pauseRequested state explains deferred pause", () => {
  const statusText = getStatusText({
    status: "pauseRequested",
    page: 1,
    currentPageTotal: 25,
    savedCount: 3,
    failedCount: 0,
    currentJobLabel: "Beta - PM",
    events: []
  });

  assert.match(statusText, /Pausing after current job/);
});

test("running state includes page and page total summary", () => {
  const viewModel = buildControlsViewModel({
    status: "running",
    page: 3,
    currentPageTotal: 25,
    savedCount: 9,
    failedCount: 2,
    targetCount: 25,
    activeTargetCount: 25,
    currentJobLabel: "Delta - Analyst",
    detailText: "",
    events: []
  });

  assert.equal(viewModel.pageSummary, "Page 3 · 25 jobs on this page");
  assert.equal(viewModel.savedSummary, "Saved 9");
  assert.equal(viewModel.failedSummary, "Failed 2");
});

test("running state disables download and locks the target input", () => {
  const viewModel = buildControlsViewModel({
    status: "running",
    page: 1,
    currentPageTotal: 25,
    savedCount: 4,
    failedCount: 1,
    exportMode: "single-json",
    targetCount: 25,
    activeTargetCount: 25,
    currentJobLabel: "Acme - Engineer",
    detailText: "",
    events: []
  });

  assert.equal(viewModel.downloadDisabled, true);
  assert.equal(viewModel.targetDisabled, true);
  assert.equal(viewModel.exportModeDisabled, true);
  assert.equal(viewModel.targetValue, 25);
});

test("paused state enables download and unlocks the target input", () => {
  const viewModel = buildControlsViewModel({
    status: "paused",
    page: 2,
    currentPageTotal: 25,
    savedCount: 8,
    failedCount: 0,
    exportMode: "json-per-job",
    targetCount: 50,
    activeTargetCount: 50,
    currentJobLabel: "Beta - PM",
    detailText: "",
    events: []
  });

  assert.equal(viewModel.downloadDisabled, false);
  assert.equal(viewModel.targetDisabled, false);
  assert.equal(viewModel.exportModeDisabled, false);
  assert.equal(viewModel.exportModeValue, "json-per-job");
  assert.equal(viewModel.primaryLabel, "Resume");
});

test("done state keeps download enabled and explains target completion", () => {
  const viewModel = buildControlsViewModel({
    status: "done",
    page: 1,
    currentPageTotal: 25,
    savedCount: 25,
    failedCount: 0,
    targetCount: 25,
    activeTargetCount: 25,
    currentJobLabel: "",
    detailText: "Target reached.",
    events: []
  });

  assert.equal(viewModel.downloadDisabled, false);
  assert.equal(viewModel.targetDisabled, false);
  assert.equal(viewModel.primaryLabel, "Start");
  assert.equal(viewModel.primaryAction, "start");
  assert.match(viewModel.statusText, /Target reached/);
});

test("renderControls updates the primary button, download button, and target input state", () => {
  const domRefs = {
    statusEl: {
      textContent: "",
      classList: {
        toggle() {}
      }
    },
    pageSummaryEl: { textContent: "" },
    savedSummaryEl: { textContent: "" },
    failedSummaryEl: { textContent: "" },
    eventsEl: {
      textContent: "",
      appendChild() {},
      ownerDocument: {
        createElement() {
          return { textContent: "" };
        }
      }
    },
    primaryButtonEl: { textContent: "", disabled: false, dataset: {} },
    downloadButtonEl: { disabled: false },
    exportModeSelectEl: { value: "", disabled: false },
    targetInputEl: { value: "", disabled: false, min: "", max: "", step: "" },
    chipEl: { textContent: "" }
  };

  renderControls(domRefs, {
    primaryLabel: "Resume",
    primaryAction: "resume",
    primaryDisabled: false,
    downloadDisabled: false,
    targetDisabled: false,
    exportModeDisabled: false,
    exportModeValue: "json-per-job",
    targetValue: 50,
    targetMin: 1,
    targetMax: 500,
    statusTone: "default",
    statusText: "Paused. Ready to resume.",
    pageSummary: "Page 2 · 25 jobs on this page",
    savedSummary: "Saved 8",
    failedSummary: "Failed 0"
  }, { events: [] });

  assert.equal(domRefs.primaryButtonEl.textContent, "Resume");
  assert.equal(domRefs.primaryButtonEl.dataset.action, "resume");
  assert.equal(domRefs.downloadButtonEl.disabled, false);
  assert.equal(domRefs.exportModeSelectEl.disabled, false);
  assert.equal(domRefs.exportModeSelectEl.value, "json-per-job");
  assert.equal(domRefs.targetInputEl.value, "50");
  assert.equal(domRefs.targetInputEl.min, "1");
  assert.equal(domRefs.targetInputEl.max, "500");
  assert.equal(domRefs.targetInputEl.step, "1");
});

test("renderControls writes icon markup when real DOM buttons are present", () => {
  const domRefs = {
    statusEl: {
      textContent: "",
      classList: {
        toggle() {}
      }
    },
    pageSummaryEl: { textContent: "" },
    savedSummaryEl: { textContent: "" },
    failedSummaryEl: { textContent: "" },
    eventsEl: {
      textContent: "",
      appendChild() {},
      ownerDocument: {
        createElement() {
          return { textContent: "" };
        }
      }
    },
    primaryButtonEl: {
      textContent: "",
      disabled: false,
      dataset: {},
      innerHTML: "",
      setAttribute() {}
    },
    downloadButtonEl: {
      disabled: false,
      dataset: {},
      innerHTML: "",
      setAttribute() {}
    },
    exportModeSelectEl: { value: "", disabled: false },
    targetInputEl: { value: "", disabled: false, min: "", max: "", step: "" },
    chipEl: { textContent: "" }
  };

  renderControls(domRefs, {
    primaryLabel: "Pause",
    primaryAction: "pause",
    primaryDisabled: false,
    downloadDisabled: true,
    targetDisabled: true,
    exportModeDisabled: true,
    exportModeValue: "single-json",
    targetValue: 25,
    targetMin: 1,
    targetMax: 500,
    statusTone: "warning",
    statusText: "Scraping in progress...",
    pageSummary: "Page 1 · 25 jobs on this page",
    savedSummary: "Saved 5",
    failedSummary: "Failed 0"
  }, { events: [] });

  assert.match(domRefs.primaryButtonEl.innerHTML, /<svg/);
  assert.match(domRefs.downloadButtonEl.innerHTML, /<svg/);
});

test("createControlsDom uses a max-500 label and separate action row while omitting current job copy", () => {
  const createdNodes = [];
  const document = {
    head: {
      appendChild(node) {
        createdNodes.push(node);
      }
    },
    getElementById() {
      return null;
    },
    createElement(tagName) {
      return {
        tagName,
        textContent: "",
        innerHTML: "",
        querySelector() {
          return null;
        }
      };
    }
  };

  const domRefs = createControlsDom(document);
  const targetRowMarkup = domRefs.rootEl.innerHTML.match(/<div data-role="target-row">([\s\S]*?)<\/div>/);
  const actionsRowMarkup = domRefs.rootEl.innerHTML.match(/<div data-role="actions">([\s\S]*?)<\/div>/);

  assert.ok(domRefs.rootEl.innerHTML.includes('data-role="target-row"'));
  assert.ok(targetRowMarkup);
  assert.ok(targetRowMarkup[1].includes('(max 500)'));
  assert.ok(domRefs.rootEl.innerHTML.includes('data-role="export-mode-row"'));
  assert.ok(domRefs.rootEl.innerHTML.includes('data-role="export-mode-select"'));
  assert.ok(domRefs.rootEl.innerHTML.includes('One JSON file per job'));
  assert.ok(actionsRowMarkup);
  assert.ok(actionsRowMarkup[1].includes('data-action="download"'));
  assert.ok(!domRefs.rootEl.innerHTML.includes('data-role="current-job"'));
  assert.match(createdNodes[0].textContent, /\[data-role="chip"\]\s*\{/);
});

test("createControlsDom styles the action row as a balanced two-button section", () => {
  const createdNodes = [];
  const document = {
    head: {
      appendChild(node) {
        createdNodes.push(node);
      }
    },
    getElementById() {
      return null;
    },
    createElement(tagName) {
      return {
        tagName,
        textContent: "",
        innerHTML: "",
        querySelector() {
          return null;
        }
      };
    }
  };

  createControlsDom(document);

  assert.match(createdNodes[0].textContent, /\[data-role="actions"\][\s\S]*margin:\s*8px 0 0/);
  assert.match(createdNodes[0].textContent, /\[data-role="actions"\][\s\S]*width:\s*100%/);
  assert.match(createdNodes[0].textContent, /\[data-role="actions"\][\s\S]*button\[data-action="download"\][\s\S]*flex:\s*1 1 0/);
});

test("renderControls marks the running status as warning text", () => {
  const toggles = [];
  const domRefs = {
    statusEl: {
      textContent: "",
      classList: {
        toggle(name, value) {
          toggles.push([name, value]);
        }
      }
    },
    pageSummaryEl: { textContent: "" },
    savedSummaryEl: { textContent: "" },
    failedSummaryEl: { textContent: "" },
    eventsEl: {
      textContent: "",
      appendChild() {},
      ownerDocument: {
        createElement() {
          return { textContent: "" };
        }
      }
    },
    primaryButtonEl: { textContent: "", disabled: false, dataset: {} },
    downloadButtonEl: { disabled: false, dataset: {} },
    exportModeSelectEl: { value: "", disabled: false },
    targetInputEl: { value: "", disabled: false, min: "", max: "", step: "" },
    chipEl: { textContent: "" }
  };

  renderControls(domRefs, {
    primaryLabel: "Pause",
    primaryAction: "pause",
    primaryDisabled: false,
    downloadDisabled: true,
    targetDisabled: true,
    exportModeDisabled: true,
    exportModeValue: "single-json",
    targetValue: 25,
    targetMin: 1,
    targetMax: 500,
    statusTone: "warning",
    statusText: "Scraping in progress. This tab must remain visible. Open a new Chrome window if you need to keep browsing.",
    pageSummary: "Page 1 · 25 jobs on this page",
    savedSummary: "Saved 2",
    failedSummary: "Failed 0"
  }, { events: [] });

  assert.deepEqual(toggles, [["warning", true]]);
});

test("showChip explicitly hides the modal and shows the reopen chip", () => {
  const domRefs = {
    modalEl: { hidden: false, style: {} },
    chipEl: { hidden: true, style: {} }
  };

  showChip(domRefs);

  assert.equal(domRefs.modalEl.hidden, true);
  assert.equal(domRefs.modalEl.style.display, "none");
  assert.equal(domRefs.chipEl.hidden, false);
  assert.equal(domRefs.chipEl.style.display, "inline-flex");
});

test("showModal explicitly hides the chip and shows the modal", () => {
  const domRefs = {
    modalEl: { hidden: true, style: {} },
    chipEl: { hidden: false, style: {} }
  };

  showModal(domRefs);

  assert.equal(domRefs.modalEl.hidden, false);
  assert.equal(domRefs.modalEl.style.display, "block");
  assert.equal(domRefs.chipEl.hidden, true);
  assert.equal(domRefs.chipEl.style.display, "none");
});
