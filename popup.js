const { CONTENT_SCRIPT_FILES = [] } = globalThis.LinkedInScraperContentScriptFiles || {};
const { buildPopupState } = globalThis.LinkedInScraperPopupState || {};

document.addEventListener("DOMContentLoaded", async () => {
  const goToJobsBtn = document.getElementById("goToJobsBtn");
  const readyBtn = document.getElementById("readyBtn");
  const pageMessageEl = document.getElementById("pageMessage");
  const actionMessageEl = document.getElementById("actionMessage");

  let activeTab = null;
  let popupState = buildPopupState ? buildPopupState(null) : {
    canScrape: false,
    goToJobsUrl: "https://www.linkedin.com/jobs/search/",
    pageMessage: "Open a LinkedIn Jobs search page to enable Ready to Scrape."
  };

  goToJobsBtn.addEventListener("click", async () => {
    if (activeTab?.id) {
      await chrome.tabs.update(activeTab.id, { url: popupState.goToJobsUrl });
      window.close();
      return;
    }

    await chrome.tabs.create({ url: popupState.goToJobsUrl });
  });

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab || null;
    popupState = buildPopupState ? buildPopupState(activeTab) : popupState;
    render();
  } catch (error) {
    pageMessageEl.textContent = "Unable to inspect the active tab.";
    readyBtn.disabled = true;
  }

  readyBtn.addEventListener("click", async () => {
    if (!activeTab?.id || !popupState.canScrape) {
      return;
    }

    readyBtn.disabled = true;
    actionMessageEl.textContent = "";

    try {
      await ensureScraperScripts(activeTab.id);
      await chrome.tabs.sendMessage(activeTab.id, { action: "openControls" });
      window.close();
    } catch (error) {
      actionMessageEl.textContent = "Could not open the in-page controls. Refresh the LinkedIn tab and try again.";
      readyBtn.disabled = false;
    }
  });

  function render() {
    pageMessageEl.textContent = popupState.pageMessage;
    pageMessageEl.classList.toggle("ready", popupState.canScrape);
    readyBtn.disabled = !popupState.canScrape;
  }
});

async function ensureScraperScripts(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "ping" });
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content_script_bootstrap.js"]
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        globalThis.LinkedInScraperBootstrap?.resetBootstrapState(globalThis, document);
      }
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_SCRIPT_FILES
    });
  }
}
