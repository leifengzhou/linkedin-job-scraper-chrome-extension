// Idempotency guard — safe to re-inject via chrome.scripting.executeScript
const {
  cleanupStaleControls,
  createBootstrapMarker,
  shouldBootstrapContentScript
} = globalThis.LinkedInScraperBootstrap;
const currentRuntimeId = chrome.runtime.id;

if (!shouldBootstrapContentScript(window.__linkedInScraperLoaded, currentRuntimeId)) {
  console.log("[LinkedInScraper] Already loaded, skipping re-init");
} else {
  cleanupStaleControls(document);
  window.__linkedInScraperLoaded = createBootstrapMarker(currentRuntimeId);

  let isRunning = false;
  let stopRequested = false;
  let runDate = null;
  let controls = null;
  let exportBuffer = null;

  const {
    appendExportFailure,
    appendExportJob,
    buildExportJobRecord,
    buildJsonExportPayload,
    createJsonExportBuffer
  } = globalThis.LinkedInScraperJsonExport;
  const {
    collectJobDataWithRetries
  } = globalThis.LinkedInScraperRetryPolicy;
  const {
    buildControlsViewModel,
    createControlsDom,
    renderControls,
    showChip,
    showModal
  } = globalThis.LinkedInScraperInPageControls;
  const {
    createScrapeSession,
    getPendingTerminalState,
    getProcessedCount,
    finishRun,
    markPageContext,
    markPaused,
    recordJobResult,
    requestPause,
    resolveResumeIndex,
    resumeRun,
    setDetailText,
    setTargetCount,
    setModalOpen,
    startRun,
    stopRun
  } = globalThis.LinkedInScraperSession;
  const {
    extractApplyAction,
    extractCardData: extractCardDataFromDom,
    extractDetailData,
    findAboutCompanySection,
    findAboutJobSection,
    findDetailRoot,
    findJobListContainer,
    findNextPageButton,
    getCardKey,
    getDetailSnapshot,
    getJobCards
  } = globalThis.LinkedInScraperJobDomAdapters;
  const session = createScrapeSession();
  exportBuffer = createJsonExportBuffer();

  console.log("[LinkedInScraper] Content script loaded on", location.href);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("[LinkedInScraper] Message received:", msg.action);

    if (msg.action === "ping") {
      sendResponse({ ok: true });
      return;
    }

    if (msg.action === "openControls") {
      openControls();
      return;
    }

    if (msg.action === "start") {
      openControls();
      handleStartResumeClick();
      return;
    }

    if (msg.action === "stop") {
      handleStopClick();
    }
  });

  window.addEventListener("pagehide", () => {
    stopRequested = true;
  });

  function ensureControls() {
    if (controls) {
      return controls;
    }

    controls = createControlsDom(document);
    const mountTarget = document.body || document.documentElement;
    mountTarget.appendChild(controls.rootEl);

    controls.primaryButtonEl.addEventListener("click", () => {
      handlePrimaryActionClick();
    });
    controls.downloadButtonEl.addEventListener("click", () => {
      void handleDownloadClick();
    });
    controls.targetInputEl.addEventListener("change", () => {
      handleTargetChange();
    });
    controls.closeButtonEl.addEventListener("click", () => {
      closeControlsToChip();
    });
    controls.chipEl.addEventListener("click", () => {
      openControls();
    });

    renderSession();
    return controls;
  }

  function openControls() {
    ensureControls();
    setModalOpen(session, true);
    renderSession();
  }

  function closeControlsToChip() {
    if (!controls) {
      return;
    }

    setModalOpen(session, false);
    renderSession();
  }

  function renderSession() {
    if (!controls) {
      return;
    }

    const viewModel = buildControlsViewModel(session);
    renderControls(controls, viewModel, session);

    if (session.isModalOpen) {
      showModal(controls);
    } else {
      showChip(controls);
    }
  }

  function handleStartResumeClick() {
    openControls();

    if (isRunning) {
      return;
    }

    stopRequested = false;

    if (session.status === "paused") {
      resumeRun(session);
    } else {
      runDate = new Date().toISOString().slice(0, 10);
      exportBuffer = createJsonExportBuffer();
      startRun(session);
    }

    renderSession();
    void scrapeAllPages();
  }

  function handlePrimaryActionClick() {
    if (session.status === "running") {
      handlePauseClick();
      return;
    }

    if (session.status === "pauseRequested") {
      renderSession();
      return;
    }

    handleStartResumeClick();
  }

  function handlePauseClick() {
    requestPause(session);
    renderSession();
  }

  function handleStopClick() {
    if (isRunning) {
      stopRequested = true;
    } else {
      stopRun(session);
      setDetailText(session, "Run stopped.");
    }
    renderSession();
  }

  function handleTargetChange() {
    setTargetCount(session, controls?.targetInputEl?.value || session.targetCount);
    renderSession();
  }

  async function scrapeAllPages() {
    if (isRunning) {
      return;
    }

    isRunning = true;
    let pageNum = session.page || 1;

    try {
      while (!stopRequested) {
        const leftPanel = findJobListContainer(document);
        if (!leftPanel) {
          setRunError("Job list panel not found on this page.");
          return;
        }

        const cards = await collectPageCards(leftPanel);

        console.log("[LinkedInScraper] Found", cards.length, "cards on page", pageNum);

        if (cards.length === 0) {
          setRunError("No job listings found on this page.");
          return;
        }

        const startIndex = pageNum === session.page
          ? resolveResumeIndex(cards.map(getCardKey), session)
          : 0;
        markPageContext(session, {
          page: pageNum,
          currentPageTotal: cards.length,
          currentCardIndex: startIndex,
          resumeFromIndex: startIndex,
          resumeCardKey: getCardKey(cards[startIndex]) || null
        });
        renderSession();

        const pageResult = await scrapeCurrentPage(cards, pageNum, startIndex);
        if (pageResult === "paused" || pageResult === "error") {
          return;
        }

        if (pageResult === "stopped" || pageResult === "done") {
          return;
        }

        const boundaryState = applyPostJobState();
        if (boundaryState) {
          return;
        }

        const nextBtn = findNextPageButton(document);
        if (!nextBtn || nextBtn.disabled) {
          stopRun(session);
          setDetailText(session, "Reached end of results before target.");
          renderSession();
          return;
        }

        nextBtn.click();
        await waitForNewCards(leftPanel);
        pageNum += 1;
        markPageContext(session, {
          page: pageNum,
          currentPageTotal: 0,
          currentCardIndex: 0,
          resumeFromIndex: 0
        });
        renderSession();
      }

      stopRun(session);
      setDetailText(session, "Run stopped.");
      renderSession();
    } catch (error) {
      console.error("[LinkedInScraper] Unexpected scrape error:", error);
      setRunError(error.message || "Unexpected scrape error.");
    } finally {
      isRunning = false;
    }
  }

  async function scrapeCurrentPage(cards, pageNum, startIndex) {
    for (let cardIndex = startIndex; cardIndex < cards.length; cardIndex += 1) {
      if (stopRequested) {
        return "stopped";
      }

      const card = cards[cardIndex];
      const cardData = extractCardDataFromDom(card);
      const jobLabel = formatJobLabel(cardData);
      session.currentJobLabel = jobLabel;
      markPageContext(session, {
        page: pageNum,
        currentPageTotal: cards.length,
        currentCardIndex: cardIndex,
        resumeFromIndex: cardIndex,
        resumeCardKey: getCardKey(card)
      });
      renderSession();
      console.log(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] Card: "${cardData.title}" @ ${cardData.company}`);

      const prevJobId = new URLSearchParams(window.location.search).get("currentJobId") || "";
      const prevDetailSnapshot = getCurrentDetailSnapshot();

      card.click();

      const newJobId = await waitForJobIdChange(prevJobId, 3000);
      if (newJobId) {
        await waitForDetailChange(prevDetailSnapshot, 5000);
        console.log(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] URL: ${prevJobId} → ${newJobId}`);
      } else {
        await waitForDetailChange(prevDetailSnapshot, 3000);
        console.log(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] URL unchanged (job may already be selected)`);
      }

      const jobId = new URLSearchParams(window.location.search).get("currentJobId") || "";
      if (!jobId) {
        console.warn(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] No currentJobId — skipping`);
        recordExtractionFailure(jobLabel, "No currentJobId");
        markPageContext(session, {
          page: pageNum,
          currentPageTotal: cards.length,
          currentCardIndex: cardIndex,
          resumeFromIndex: cardIndex + 1,
          resumeCardKey: getCardKey(cards[cardIndex + 1]) || null
        });
        renderSession();

        const terminalState = applyPostJobState();
        if (terminalState) {
          return terminalState;
        }

        continue;
      }

      let retryResult;
      try {
        retryResult = await collectJobDataWithRetries({
          maxRetries: 10,
          collect: async (attemptNumber) => {
            if (attemptNumber > 1) {
              console.warn(
                `[LinkedInScraper] [${cardIndex + 1}/${cards.length}] Missing critical fields on attempt ${attemptNumber - 1} — retrying after ${attemptNumber - 1}s`
              );
              card.click();
              await sleep(300);
            }

            return collectCurrentJobData(card, jobId);
          },
          sleep
        });
      } catch (error) {
        console.error(
          `[LinkedInScraper] [${cardIndex + 1}/${cards.length}] Extraction failed for ${jobLabel}: ${error.message || "Unknown error"}`
        );
        recordExtractionFailure(jobLabel, error.message || "Job extraction failed");
        markPageContext(session, {
          page: pageNum,
          currentPageTotal: cards.length,
          currentCardIndex: cardIndex,
          resumeFromIndex: cardIndex + 1,
          resumeCardKey: getCardKey(cards[cardIndex + 1]) || null
        });
        renderSession();

        const terminalState = applyPostJobState();
        if (terminalState) {
          return terminalState;
        }

        await sleep(500);
        continue;
      }

      const { jobData, missingFields, exhaustedRetries } = retryResult;
      if (!jobData) {
        console.error(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] No usable job object produced`);
        recordExtractionFailure(jobLabel, "No usable job object");
      } else {
        const descSnippet = (jobData.description || "").slice(0, 80);
        if (
          jobData.company &&
          jobData.description &&
          !jobData.description.slice(0, 200).toLowerCase().includes(jobData.company.toLowerCase())
        ) {
          console.warn(
            `[LinkedInScraper] [${cardIndex + 1}/${cards.length}] Company "${jobData.company}" not in description start — possible stale panel`
          );
        }
        console.log(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] Desc: "${descSnippet}..."`);

        if (missingFields.length > 0) {
          console.warn(
            `[LinkedInScraper] [${cardIndex + 1}/${cards.length}] Missing fields: ${missingFields.join(", ")} — storing partial job`
          );
        }

        appendExportJob(exportBuffer, buildExportJobRecord(normalizeJobForExport(jobData), {
          missingFields,
          exhaustedRetries
        }));
        recordJobResult(session, {
          ok: true,
          label: jobLabel
        });
      }

      markPageContext(session, {
        page: pageNum,
        currentPageTotal: cards.length,
        currentCardIndex: cardIndex,
        resumeFromIndex: cardIndex + 1,
        resumeCardKey: getCardKey(cards[cardIndex + 1]) || null
      });
      renderSession();

      const terminalState = applyPostJobState();
      if (terminalState) {
        return terminalState;
      }

      await sleep(500);
    }

    markPageContext(session, {
      page: pageNum,
      currentPageTotal: cards.length,
      currentCardIndex: cards.length,
      resumeFromIndex: 0,
      resumeCardKey: null
    });
    renderSession();
    return "complete";
  }

  function setRunError(message) {
    stopRun(session);
    session.currentJobLabel = message;
    setDetailText(session, `Stopped with an error. ${message}`);
    session.events = session.events.concat({
      ok: false,
      label: message,
      error: ""
    }).slice(-20);
    renderSession();
  }

  function applyPostJobState() {
    const terminalState = getPendingTerminalState(session, { stopRequested });

    if (terminalState === "done") {
      finishRun(session);
      setDetailText(session, `Target reached at ${getProcessedCount(session)} processed jobs.`);
      renderSession();
      return "done";
    }

    if (terminalState === "stopped") {
      stopRun(session);
      setDetailText(session, "Run stopped.");
      renderSession();
      return "stopped";
    }

    if (terminalState === "paused") {
      markPaused(session);
      setDetailText(session, "");
      renderSession();
      return "paused";
    }

    return null;
  }

  async function handleDownloadClick() {
    if (!["paused", "stopped", "done"].includes(session.status)) {
      return false;
    }

    const exportDate = runDate || new Date().toISOString().slice(0, 10);
    const payload = buildJsonExportPayload({
      runDate: exportDate,
      buffer: exportBuffer
    });
    let exportResult;

    try {
      exportResult = await chrome.runtime.sendMessage({
        action: "downloadJsonExport",
        filename: `scraped-jobs-${exportDate}.json`,
        payload,
        timeoutMs: 5000
      });
    } catch (error) {
      exportResult = {
        ok: false,
        error: error.message || "Export request failed"
      };
    }

    if (!exportResult?.ok) {
      setDetailText(session, `Export failed: ${exportResult?.error || "Unknown error"}`);
      renderSession();
      return false;
    }

    setDetailText(
      session,
      [
        "Download started.",
        `Saved ${session.savedCount}.`,
        `Failed ${session.failedCount}.`,
        exportBuffer.partialCount > 0 ? `Partial ${exportBuffer.partialCount}.` : ""
      ].filter(Boolean).join(" ")
    );
    renderSession();
    return true;
  }

  function recordExtractionFailure(label, error) {
    appendExportFailure(exportBuffer, {
      label,
      error
    });
    recordJobResult(session, {
      ok: false,
      label,
      error
    });
  }

  function formatJobLabel(cardData) {
    const company = cardData.company || "Unknown company";
    const title = cardData.title || "Unknown title";
    return `${company} - ${title}`;
  }

  function normalizeJobForExport(jobData) {
    return {
      title: jobData.title || "",
      company: jobData.company || "",
      location: jobData.location || "",
      salary: jobData.salary || "",
      datePosted: jobData.datePosted || "",
      applyType: jobData.applyType || "",
      applyUrl: jobData.applyUrl || "",
      linkedinUrl: jobData.linkedinUrl || "",
      jobId: jobData.jobId || "",
      description: jobData.description || "",
      aboutCompany: jobData.aboutCompany || ""
    };
  }

  async function collectCurrentJobData(card, jobId) {
    const cardData = extractCardDataFromDom(card);
    const detailRoot = findDetailRoot(document);
    const detailData = extractDetailData(detailRoot);
    const linkedinUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;
    let aboutJobSection = findAboutJobSection(detailRoot);
    let aboutCompanySection = findAboutCompanySection(detailRoot);

    await expandDetailSection(aboutJobSection);
    await expandDetailSection(aboutCompanySection);

    const rereadDetailRoot = findDetailRoot(document) || detailRoot;
    const applyAction = extractApplyAction(rereadDetailRoot);
    aboutJobSection = findAboutJobSection(rereadDetailRoot);
    aboutCompanySection = findAboutCompanySection(rereadDetailRoot);

    const description = readDetailSectionText(aboutJobSection) ||
      detailData.description ||
      "(Description not available)";
    const aboutCompany = readDetailSectionText(aboutCompanySection) ||
      detailData.aboutCompany ||
      "";
    const applyUrl = applyAction.href || linkedinUrl;
    const applyType = applyAction.applyType || cardData.applyType;

    return {
      ...cardData,
      title: detailData.title || cardData.title,
      company: detailData.company || cardData.company,
      location: detailData.location || cardData.location,
      datePosted: detailData.datePosted || cardData.datePosted,
      jobId,
      linkedinUrl,
      applyUrl,
      applyType,
      description,
      aboutCompany
    };
  }

  async function expandDetailSection(sectionContext) {
    if (!sectionContext?.expandButtonEl) {
      return;
    }

    sectionContext.expandButtonEl.click();
    await sleep(300);
  }

  function readDetailSectionText(sectionContext) {
    if (!sectionContext?.textEl) {
      return "";
    }

    return getTextWithoutExpandButtons(sectionContext.textEl, ['[data-testid="expandable-text-button"]']);
  }

  function getTextWithoutExpandButtons(textEl, expandButtonSelectors) {
    if (!textEl) {
      return "";
    }

    if (typeof textEl.cloneNode === "function") {
      const clone = textEl.cloneNode(true);
      if (typeof clone.querySelectorAll === "function") {
        for (const selector of expandButtonSelectors) {
          for (const button of clone.querySelectorAll(selector)) {
            button.remove();
          }
        }
      }

      return (clone.innerText || clone.textContent || "").trim();
    }

    return (textEl.innerText || textEl.textContent || "").trim();
  }

  function waitForNewCards(leftPanel) {
    return new Promise((resolve) => {
      const firstCard = getJobCards(leftPanel)[0] || null;
      const firstKey = getCardKey(firstCard);

      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 5000);
      const observer = new MutationObserver(() => {
        const newFirst = getJobCards(leftPanel)[0] || null;
        const newKey = getCardKey(newFirst);
        if (newFirst && newKey !== firstKey) {
          clearTimeout(timeout);
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(leftPanel, { childList: true, subtree: true });
    });
  }

  async function collectPageCards(leftPanel) {
    const cards = getJobCards(leftPanel);
    const cardMap = new Map(cards.map((card) => [getCardKey(card), card]));
    const scroller = findScrollableContainer(leftPanel);

    if (!scroller) {
      return cards;
    }

    let stablePasses = 0;
    let previousCount = cardMap.size;
    let previousScrollTop = scroller.scrollTop;

    while (stablePasses < 2) {
      const nextScrollTop = Math.min(
        scroller.scrollTop + Math.max(Math.floor(scroller.clientHeight * 0.9), 320),
        Math.max(scroller.scrollHeight - scroller.clientHeight, 0)
      );

      if (nextScrollTop === scroller.scrollTop) {
        stablePasses += 1;
      } else {
        scroller.scrollTop = nextScrollTop;
        scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(250);
      }

      for (const card of getJobCards(leftPanel)) {
        cardMap.set(getCardKey(card), card);
      }

      if (cardMap.size === previousCount && scroller.scrollTop === previousScrollTop) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
      }

      previousCount = cardMap.size;
      previousScrollTop = scroller.scrollTop;
    }

    if (scroller.scrollTop !== 0) {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(150);
    }

    return Array.from(cardMap.values()).filter(Boolean);
  }

  function findScrollableContainer(leftPanel) {
    let current = leftPanel;

    while (current && current !== document.body) {
      if (typeof current.scrollHeight === "number" && typeof current.clientHeight === "number" && current.scrollHeight > current.clientHeight) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  function waitForJobIdChange(prevJobId, timeoutMs = 5000) {
    return new Promise((resolve) => {
      const check = () => new URLSearchParams(window.location.search).get("currentJobId");
      const currentId = check();
      if (currentId && currentId !== prevJobId) {
        resolve(currentId);
        return;
      }

      const interval = setInterval(() => {
        const nextId = check();
        if (nextId && nextId !== prevJobId) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve(nextId);
        }
      }, 100);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        resolve(null);
      }, timeoutMs);
    });
  }

  function waitForDetailChange(prevSnapshot, timeoutMs = 5000) {
    const observedDetailRoot = findDetailRoot(document);
    if (!observedDetailRoot) {
      return Promise.resolve("");
    }

    return new Promise((resolve) => {
      const check = () => {
        const detailRoot = findDetailRoot(document);
        if (!detailRoot) {
          return null;
        }

        const snapshot = getDetailSnapshot(detailRoot);
        if (!snapshot) {
          return null;
        }

        return snapshot !== prevSnapshot ? snapshot : null;
      };

      const initialResult = check();
      if (initialResult !== null) {
        resolve(initialResult);
        return;
      }

      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve(getCurrentDetailSnapshot());
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        const result = check();
        if (result !== null) {
          clearTimeout(timeout);
          observer.disconnect();
          resolve(result);
        }
      });

      observer.observe(observedDetailRoot, { childList: true, subtree: true, characterData: true });
    });
  }

  function getCurrentDetailSnapshot() {
    const detailRoot = findDetailRoot(document);
    if (!detailRoot) {
      return "";
    }

    return getDetailSnapshot(detailRoot);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
