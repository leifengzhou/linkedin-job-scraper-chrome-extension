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
    findSectionContext,
    readSectionText
  } = globalThis.LinkedInScraperDescriptionUtils;
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
        const leftPanel = document.querySelector('[data-component-type="LazyColumn"]');
        if (!leftPanel) {
          setRunError("Job list panel not found on this page.");
          return;
        }

        const allRoleButtons = Array.from(leftPanel.querySelectorAll('div[role="button"][componentkey]'));
        const cards = allRoleButtons.filter((el) => el.querySelector('button[aria-label^="Dismiss"]'));

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

        const nextBtn = document.querySelector('button[data-testid="pagination-controls-next-button-visible"]');
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
      const cardData = extractCardData(card);
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
      const prevDescText = document.querySelector('[data-testid="expandable-text-box"]')?.innerText || "";

      card.click();

      const newJobId = await waitForJobIdChange(prevJobId, 3000);
      if (newJobId) {
        await waitForDescriptionChange(prevDescText, 5000);
        console.log(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] URL: ${prevJobId} → ${newJobId}`);
      } else {
        await waitForDescriptionChange("", 3000);
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

  function getCardKey(card) {
    return card?.getAttribute("componentkey") || null;
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

  function extractCardData(card) {
    const dismissBtn = card.querySelector('button[aria-label^="Dismiss"]');
    let title = dismissBtn
      ? dismissBtn.getAttribute("aria-label").replace(/^Dismiss\s+/, "").replace(/\s+job$/, "").trim()
      : "";
    title = title.replace(/\s*\(Verified job\)\s*$/, "").trim();

    const titleP = title
      ? Array.from(card.querySelectorAll("p")).find((p) => p.textContent.includes(title))
      : null;
    const companyDiv = titleP?.nextElementSibling;
    const company = companyDiv?.querySelector("p")?.textContent.trim() || "";
    const location = companyDiv?.nextElementSibling?.textContent.trim() || "";

    const dateSpan = Array.from(card.querySelectorAll("span")).find((span) => span.textContent.trim().startsWith("Posted on"));
    const datePosted = dateSpan?.textContent.replace(/^Posted on\s*/, "").trim() || "";

    const allPs = card.querySelectorAll("p");
    const salaryP = Array.from(allPs).find((p) => /\$[\d,.]+[KM]?\/yr/.test(p.textContent));
    const salary = salaryP?.textContent.trim() || "Not listed";

    const applyType = card.textContent.includes("Easy Apply") ? "Easy Apply" : "Apply";

    return { title, company, location, datePosted, salary, applyType };
  }

  async function collectCurrentJobData(card, jobId) {
    const cardData = extractCardData(card);

    let aboutJobContext = findSectionContext(document, "About the job");
    let aboutCompanyContext = findSectionContext(document, "About the company");
    let description = await readSectionText({
      textEl: aboutJobContext.textEl,
      expandButtonEl: aboutJobContext.expandButtonEl,
      sleep
    });
    let aboutCompany = await readSectionText({
      textEl: aboutCompanyContext.textEl,
      expandButtonEl: aboutCompanyContext.expandButtonEl,
      sleep
    });

    aboutJobContext = findSectionContext(document, "About the job");
    aboutCompanyContext = findSectionContext(document, "About the company");
    description = await readSectionText({
      textEl: aboutJobContext.textEl,
      expandButtonEl: null,
      sleep
    }) || "(Description not available)";
    aboutCompany = await readSectionText({
      textEl: aboutCompanyContext.textEl,
      expandButtonEl: null,
      sleep
    });

    let applyUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;
    let applyType = cardData.applyType;

    if (applyType !== "Easy Apply") {
      const externalBtn = document.querySelector('a[aria-label="Apply on company website"]');
      if (externalBtn) {
        applyType = "Apply on company website";
        const rawHref = externalBtn.getAttribute("href") || "";
        try {
          const urlObj = new URL(rawHref, "https://www.linkedin.com");
          const redirectUrl = urlObj.searchParams.get("url");
          if (redirectUrl) {
            const decoded = decodeURIComponent(redirectUrl);
            applyUrl = /^https?:\/\//i.test(decoded) ? decoded : rawHref;
          } else {
            applyUrl = rawHref;
          }
        } catch {
          applyUrl = rawHref;
        }
      }
    }

    const linkedinUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;
    return {
      ...cardData,
      jobId,
      linkedinUrl,
      applyUrl,
      applyType,
      description,
      aboutCompany
    };
  }

  function waitForNewCards(leftPanel) {
    return new Promise((resolve) => {
      const firstCard = leftPanel.querySelector('div[role="button"][componentkey]');
      const firstKey = firstCard?.getAttribute("componentkey") || null;

      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 5000);
      const observer = new MutationObserver(() => {
        const newFirst = leftPanel.querySelector('div[role="button"][componentkey]');
        const newKey = newFirst?.getAttribute("componentkey");
        if (newFirst && newKey !== firstKey) {
          clearTimeout(timeout);
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(leftPanel, { childList: true, subtree: true });
    });
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

  function waitForDescriptionChange(prevText, timeoutMs = 5000) {
    const selector = '[data-testid="expandable-text-box"]';
    return new Promise((resolve) => {
      const check = () => {
        const el = document.querySelector(selector);
        if (!el) {
          return null;
        }
        return el.innerText !== prevText ? el : null;
      };

      const initialResult = check();
      if (initialResult) {
        resolve(initialResult);
        return;
      }

      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        const result = check();
        if (result) {
          clearTimeout(timeout);
          observer.disconnect();
          resolve(result);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
