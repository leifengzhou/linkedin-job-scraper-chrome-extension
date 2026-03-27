(function (root) {
  const MAX_EVENT_COUNT = 20;
  const DEFAULT_TARGET_COUNT = 25;
  const MIN_TARGET_COUNT = 1;
  const MAX_TARGET_COUNT = 500;

  function normalizeTargetCount(value) {
    const text = String(value).trim();

    if (!/^\d+$/.test(text)) {
      return MIN_TARGET_COUNT;
    }

    const parsed = Number(text);

    if (!Number.isInteger(parsed)) {
      return MIN_TARGET_COUNT;
    }

    return Math.max(MIN_TARGET_COUNT, Math.min(MAX_TARGET_COUNT, parsed));
  }

  function createScrapeSession() {
    return {
      status: "idle",
      page: 1,
      currentPageTotal: 0,
      currentCardIndex: 0,
      resumeFromIndex: null,
      resumeCardKey: null,
      savedCount: 0,
      failedCount: 0,
      currentJobLabel: "",
      detailText: "",
      targetCount: DEFAULT_TARGET_COUNT,
      activeTargetCount: null,
      events: [],
      isModalOpen: true
    };
  }

  function startRun(session) {
    const activeTargetCount = normalizeTargetCount(session.targetCount);

    session.status = "running";
    session.page = 1;
    session.currentPageTotal = 0;
    session.currentCardIndex = 0;
    session.resumeFromIndex = 0;
    session.resumeCardKey = null;
    session.savedCount = 0;
    session.failedCount = 0;
    session.currentJobLabel = "";
    session.detailText = "";
    session.activeTargetCount = activeTargetCount;
    session.events = [];
    session.isModalOpen = true;
    return session;
  }

  function markPageContext(session, context) {
    session.page = context.page;
    session.currentPageTotal = context.currentPageTotal;
    session.currentCardIndex = context.currentCardIndex;
    if (Object.prototype.hasOwnProperty.call(context, "resumeFromIndex")) {
      session.resumeFromIndex = context.resumeFromIndex;
    }
    if (Object.prototype.hasOwnProperty.call(context, "resumeCardKey")) {
      session.resumeCardKey = context.resumeCardKey;
    }
    return session;
  }

  function requestPause(session) {
    if (session.status === "running") {
      session.status = "pauseRequested";
    }
    return session;
  }

  function recordJobResult(session, result) {
    session.currentJobLabel = result.label || "";

    if (result.ok) {
      session.savedCount += 1;
    } else {
      session.failedCount += 1;
    }

    session.events = session.events.concat({
      ok: result.ok,
      label: result.label || "",
      error: result.error || ""
    }).slice(-MAX_EVENT_COUNT);

    return session;
  }

  function markPaused(session) {
    session.status = "paused";
    return session;
  }

  function resumeRun(session) {
    session.status = "running";
    return session;
  }

  function setTargetCount(session, value) {
    session.targetCount = normalizeTargetCount(value);
    return session;
  }

  function getProcessedCount(session) {
    return session.savedCount + session.failedCount;
  }

  function hasReachedTarget(session) {
    return session.activeTargetCount != null && getProcessedCount(session) >= session.activeTargetCount;
  }

  function getPendingTerminalState(session, options = {}) {
    if (hasReachedTarget(session)) {
      return "done";
    }

    if (options.stopRequested) {
      return "stopped";
    }

    if (session.status === "pauseRequested") {
      return "paused";
    }

    return null;
  }

  function setDetailText(session, text) {
    session.detailText = text == null ? "" : String(text);
    return session;
  }

  function clearDetailText(session) {
    session.detailText = "";
    return session;
  }

  function stopRun(session) {
    session.status = "stopped";
    session.resumeFromIndex = null;
    session.resumeCardKey = null;
    return session;
  }

  function finishRun(session) {
    session.status = "done";
    session.resumeFromIndex = null;
    session.resumeCardKey = null;
    return session;
  }

  function resolveResumeIndex(cardKeys, session) {
    if (session.resumeCardKey) {
      const matchedIndex = cardKeys.indexOf(session.resumeCardKey);
      if (matchedIndex !== -1) {
        return matchedIndex;
      }
    }

    if (typeof session.resumeFromIndex === "number") {
      return Math.max(0, Math.min(session.resumeFromIndex, cardKeys.length));
    }

    return 0;
  }

  function setModalOpen(session, isOpen) {
    session.isModalOpen = Boolean(isOpen);
    return session;
  }

  const api = {
    DEFAULT_TARGET_COUNT,
    MAX_TARGET_COUNT,
    MIN_TARGET_COUNT,
    createScrapeSession,
    clearDetailText,
    finishRun,
    getPendingTerminalState,
    getProcessedCount,
    hasReachedTarget,
    markPageContext,
    markPaused,
    recordJobResult,
    requestPause,
    resolveResumeIndex,
    resumeRun,
    normalizeTargetCount,
    setDetailText,
    setTargetCount,
    setModalOpen,
    startRun,
    stopRun
  };

  root.LinkedInScraperSession = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
