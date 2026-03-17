let isRunning = false;
let activeTabId = null;

document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("status");
  const progressEl = document.getElementById("progress");
  const btn = document.getElementById("btn");

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    statusEl.textContent = "Cannot detect active tab.";
    return;
  }
  activeTabId = tab.id;

  const isJobsPage = tab.url && tab.url.includes("linkedin.com/jobs");

  if (!isJobsPage) {
    statusEl.textContent = "Open a LinkedIn Jobs search page first.";
    btn.textContent = "▶ Start Scraping";
    btn.disabled = true;
    return;
  }

  // Check for in-progress scrape
  const { scrapeState } = await chrome.storage.local.get("scrapeState");
  if (scrapeState && scrapeState.running) {
    setScrapingState(scrapeState.scraped, scrapeState.page);
  } else {
    setIdleState();
  }

  btn.addEventListener("click", async () => {
    if (!isRunning) {
      // Inject content script if not already present (handles the "tab loaded before extension" case)
      try {
        await chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          files: ["content_script.js"]
        });
      } catch (e) {
        // Already injected or can't inject — proceed anyway
      }
      // Fire-and-forget — content script doesn't sendResponse so awaiting would time out
      chrome.tabs.sendMessage(activeTabId, { action: "start" }).catch(e => {
        console.error('[LinkedInScraper] sendMessage failed:', e.message);
        statusEl.textContent = "Could not connect to page — try reloading the LinkedIn tab.";
        statusEl.classList.add("error");
        isRunning = false;
        btn.textContent = "▶ Start Scraping";
        btn.classList.remove("stop");
      });
      setScrapingState(0, 1);
    } else {
      chrome.tabs.sendMessage(activeTabId, { action: "stop" }).catch(() => {});
      chrome.storage.local.remove('scrapeState');
      setIdleState();
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "progress") {
      if (msg.error) {
        statusEl.textContent = msg.error;
        statusEl.classList.add("error");
      } else {
        const totalStr = msg.total ? ` / ${msg.total}` : '';
        progressEl.textContent = `Scraping... ${msg.scraped}${totalStr} jobs · Page ${msg.page}`;
      }
    } else if (msg.action === "done") {
      setDoneState(msg.total, msg.folder);
    }
  });

  function setIdleState() {
    isRunning = false;
    statusEl.textContent = "Ready to scrape.";
    statusEl.classList.remove("error");
    progressEl.textContent = "";
    btn.textContent = "▶ Start Scraping";
    btn.disabled = false;
    btn.classList.remove("stop");
  }

  function setScrapingState(scraped, page) {
    isRunning = true;
    statusEl.textContent = "Scraping in progress...";
    statusEl.classList.remove("error");
    progressEl.textContent = scraped > 0 ? `Scraping... ${scraped} jobs · Page ${page}` : "";
    btn.textContent = "⏹ Stop";
    btn.disabled = false;
    btn.classList.add("stop");
  }

  function setDoneState(total, folder) {
    isRunning = false;
    statusEl.textContent = `✓ Complete — ${total} jobs saved to ${folder}/`;
    statusEl.classList.remove("error");
    progressEl.textContent = "";
    btn.textContent = "▶ Start Scraping";
    btn.disabled = false;
    btn.classList.remove("stop");
  }
});
