const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildControlsViewModel,
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

  assert.equal(viewModel.startLabel, "Start");
  assert.equal(viewModel.startDisabled, false);
  assert.equal(viewModel.pauseDisabled, true);
  assert.equal(viewModel.stopDisabled, true);
});

test("paused state turns Start into Resume and keeps Stop enabled", () => {
  const viewModel = buildControlsViewModel({
    status: "paused",
    page: 2,
    currentPageTotal: 25,
    savedCount: 7,
    failedCount: 1,
    currentJobLabel: "Acme - Engineer",
    events: []
  });

  assert.equal(viewModel.startLabel, "Resume");
  assert.equal(viewModel.startDisabled, false);
  assert.equal(viewModel.pauseDisabled, true);
  assert.equal(viewModel.stopDisabled, false);
  assert.match(viewModel.statusText, /Paused/);
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
  assert.equal(viewModel.currentJobText, "Current job: Delta - Analyst");
});

test("running state disables download and locks the target input", () => {
  const viewModel = buildControlsViewModel({
    status: "running",
    page: 1,
    currentPageTotal: 25,
    savedCount: 4,
    failedCount: 1,
    targetCount: 25,
    activeTargetCount: 25,
    currentJobLabel: "Acme - Engineer",
    detailText: "",
    events: []
  });

  assert.equal(viewModel.downloadDisabled, true);
  assert.equal(viewModel.targetDisabled, true);
  assert.equal(viewModel.targetValue, 25);
});

test("paused state enables download and unlocks the target input", () => {
  const viewModel = buildControlsViewModel({
    status: "paused",
    page: 2,
    currentPageTotal: 25,
    savedCount: 8,
    failedCount: 0,
    targetCount: 50,
    activeTargetCount: 50,
    currentJobLabel: "Beta - PM",
    detailText: "",
    events: []
  });

  assert.equal(viewModel.downloadDisabled, false);
  assert.equal(viewModel.targetDisabled, false);
  assert.equal(viewModel.startLabel, "Resume");
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
  assert.match(viewModel.statusText, /Target reached/);
});

test("renderControls updates the download button and target input state", () => {
  const domRefs = {
    statusEl: { textContent: "" },
    pageSummaryEl: { textContent: "" },
    savedSummaryEl: { textContent: "" },
    failedSummaryEl: { textContent: "" },
    currentJobEl: { textContent: "" },
    eventsEl: {
      textContent: "",
      appendChild() {},
      ownerDocument: {
        createElement() {
          return { textContent: "" };
        }
      }
    },
    startButtonEl: { textContent: "", disabled: false },
    pauseButtonEl: { disabled: false },
    stopButtonEl: { disabled: false },
    downloadButtonEl: { disabled: false },
    targetInputEl: { value: "", disabled: false, min: "", max: "", step: "" },
    chipEl: { textContent: "" }
  };

  renderControls(domRefs, {
    startLabel: "Resume",
    startDisabled: false,
    pauseDisabled: true,
    stopDisabled: false,
    downloadDisabled: false,
    targetDisabled: false,
    targetValue: 50,
    targetMin: 1,
    targetMax: 500,
    statusText: "Paused. Ready to resume.",
    pageSummary: "Page 2 · 25 jobs on this page",
    savedSummary: "Saved 8",
    failedSummary: "Failed 0",
    currentJobText: "Current job: Beta - PM"
  }, { events: [] });

  assert.equal(domRefs.downloadButtonEl.disabled, false);
  assert.equal(domRefs.targetInputEl.value, "50");
  assert.equal(domRefs.targetInputEl.min, "1");
  assert.equal(domRefs.targetInputEl.max, "500");
  assert.equal(domRefs.targetInputEl.step, "1");
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
