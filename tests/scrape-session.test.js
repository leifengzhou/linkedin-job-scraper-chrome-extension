const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_EXPORT_MODE,
  DEFAULT_TARGET_COUNT,
  MAX_TARGET_COUNT,
  MIN_TARGET_COUNT,
  createScrapeSession,
  finishRun,
  getPendingTerminalState,
  getProcessedCount,
  hasReachedTarget,
  markPageContext,
  recordJobResult,
  resolveResumeIndex,
  requestPause,
  resumeRun,
  setDetailText,
  setExportMode,
  setTargetCount,
  setModalOpen,
  startRun,
  stopRun
} = require("../scrape_session.js");

test("startRun resets stale counts and event log for a new run", () => {
  const session = createScrapeSession();
  session.savedCount = 3;
  session.failedCount = 2;
  session.events = [{ ok: false, label: "Old job" }];

  startRun(session);

  assert.equal(session.status, "running");
  assert.equal(session.savedCount, 0);
  assert.equal(session.failedCount, 0);
  assert.deepEqual(session.events, []);
  assert.equal(session.resumeFromIndex, 0);
});

test("requestPause keeps the run active until the current job settles", () => {
  const session = createScrapeSession();
  startRun(session);

  requestPause(session);

  assert.equal(session.status, "pauseRequested");

  recordJobResult(session, { ok: true, label: "Acme - Engineer" });

  assert.equal(session.savedCount, 1);
  assert.equal(session.status, "pauseRequested");
});

test("resumeRun continues the same run from the saved index", () => {
  const session = createScrapeSession();
  startRun(session);
  markPageContext(session, { page: 2, currentPageTotal: 25, currentCardIndex: 5, resumeFromIndex: 5 });
  requestPause(session);
  session.status = "paused";

  resumeRun(session);

  assert.equal(session.status, "running");
  assert.equal(session.page, 2);
  assert.equal(session.resumeFromIndex, 5);
});

test("stopRun clears resumable cursor without deleting completed counts", () => {
  const session = createScrapeSession();
  startRun(session);
  recordJobResult(session, { ok: false, label: "Beta - PM", error: "Download failed" });
  markPageContext(session, { page: 1, currentPageTotal: 25, currentCardIndex: 3, resumeFromIndex: 4 });

  stopRun(session);

  assert.equal(session.status, "stopped");
  assert.equal(session.failedCount, 1);
  assert.equal(session.resumeFromIndex, null);
});

test("finishRun keeps final totals but clears resumable cursor", () => {
  const session = createScrapeSession();
  startRun(session);
  recordJobResult(session, { ok: true, label: "Gamma - Designer" });

  finishRun(session);

  assert.equal(session.status, "done");
  assert.equal(session.savedCount, 1);
  assert.equal(session.resumeFromIndex, null);
});

test("startRun after a prior failure clears previous run failures and events", () => {
  const session = createScrapeSession();
  startRun(session);
  recordJobResult(session, { ok: false, label: "Old failure", error: "Download failed" });
  setModalOpen(session, false);

  startRun(session);

  assert.equal(session.failedCount, 0);
  assert.deepEqual(session.events, []);
  assert.equal(session.isModalOpen, true);
});

test("createScrapeSession starts with the default editable target", () => {
  const session = createScrapeSession();

  assert.equal(DEFAULT_TARGET_COUNT, 25);
  assert.equal(session.targetCount, DEFAULT_TARGET_COUNT);
  assert.equal(session.activeTargetCount, null);
  assert.equal(DEFAULT_EXPORT_MODE, "json-per-job");
  assert.equal(session.exportMode, DEFAULT_EXPORT_MODE);
});

test("setExportMode accepts supported values and rejects unknown ones", () => {
  const session = createScrapeSession();

  setExportMode(session, "json-per-job");
  assert.equal(session.exportMode, "json-per-job");

  setExportMode(session, "not-a-real-mode");
  assert.equal(session.exportMode, DEFAULT_EXPORT_MODE);
});

test("setTargetCount clamps out-of-range values and rejects decimals", () => {
  const session = createScrapeSession();

  setTargetCount(session, "700");
  assert.equal(session.targetCount, MAX_TARGET_COUNT);

  setTargetCount(session, "0");
  assert.equal(session.targetCount, MIN_TARGET_COUNT);

  setTargetCount(session, "12.5");
  assert.equal(session.targetCount, MIN_TARGET_COUNT);
});

test("startRun snapshots the editable target into the active run target", () => {
  const session = createScrapeSession();
  setTargetCount(session, "40");

  startRun(session);

  assert.equal(session.targetCount, 40);
  assert.equal(session.activeTargetCount, 40);
});

test("pause and resume keep the same active target for the same run", () => {
  const session = createScrapeSession();
  setTargetCount(session, "35");
  startRun(session);

  requestPause(session);
  session.status = "paused";
  resumeRun(session);

  assert.equal(session.activeTargetCount, 35);
});

test("processed count and target completion treat saved plus failed as progress", () => {
  const session = createScrapeSession();
  setTargetCount(session, "3");
  startRun(session);

  session.savedCount = 2;
  session.failedCount = 1;

  assert.equal(getProcessedCount(session), 3);
  assert.equal(hasReachedTarget(session), true);
});

test("getPendingTerminalState stops at the page boundary when stop was requested", () => {
  const session = createScrapeSession();
  startRun(session);

  assert.equal(getPendingTerminalState(session, { stopRequested: true }), "stopped");
});

test("getPendingTerminalState pauses at the page boundary when pause was requested", () => {
  const session = createScrapeSession();
  startRun(session);
  requestPause(session);

  assert.equal(getPendingTerminalState(session, { stopRequested: false }), "paused");
});

test("getPendingTerminalState prefers target completion over stop requests", () => {
  const session = createScrapeSession();
  setTargetCount(session, "2");
  startRun(session);
  session.savedCount = 2;

  assert.equal(getPendingTerminalState(session, { stopRequested: true }), "done");
});

test("startRun clears stale detail text from the prior run", () => {
  const session = createScrapeSession();
  setDetailText(session, "Reached end of results before target.");

  startRun(session);

  assert.equal(session.detailText, "");
});

test("setDetailText stores a terminal note without changing counters", () => {
  const session = createScrapeSession();
  startRun(session);

  setDetailText(session, "Export failed: Download interrupted");

  assert.equal(session.detailText, "Export failed: Download interrupted");
  assert.equal(session.savedCount, 0);
  assert.equal(session.failedCount, 0);
});

test("recordJobResult caps the event log to the latest 20 entries", () => {
  const session = createScrapeSession();
  startRun(session);

  for (let index = 0; index < 22; index += 1) {
    recordJobResult(session, { ok: true, label: `Job ${index}` });
  }

  assert.equal(session.events.length, 20);
  assert.equal(session.events[0].label, "Job 2");
  assert.equal(session.events.at(-1).label, "Job 21");
});

test("resolveResumeIndex prefers the saved card key over the stale numeric index", () => {
  const session = createScrapeSession();
  startRun(session);
  markPageContext(session, {
    page: 1,
    currentPageTotal: 25,
    currentCardIndex: 4,
    resumeFromIndex: 5,
    resumeCardKey: "job-6"
  });

  const resumeIndex = resolveResumeIndex(["job-1", "job-2", "job-6", "job-7"], session);

  assert.equal(resumeIndex, 2);
});

test("resolveResumeIndex falls back to the stored numeric index when the card key is gone", () => {
  const session = createScrapeSession();
  startRun(session);
  markPageContext(session, {
    page: 1,
    currentPageTotal: 25,
    currentCardIndex: 4,
    resumeFromIndex: 5,
    resumeCardKey: "missing-job"
  });

  const resumeIndex = resolveResumeIndex(["job-1", "job-2", "job-3", "job-4", "job-5", "job-6"], session);

  assert.equal(resumeIndex, 5);
});
