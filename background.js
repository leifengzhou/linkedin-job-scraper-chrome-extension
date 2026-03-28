importScripts("download_recovery.js");

const {
  buildFailedDownloadRecord,
  buildDownloadDataUrl,
  shouldRetryDownload,
  trimFailedDownloads
} = globalThis.LinkedInScraperDownloadRecovery;
const FAILED_DOWNLOADS_KEY = "failedDownloads";
const RETRY_BACKOFF_MS = 500;
const pendingDownloads = new Map();
let nextRequestId = 1;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "downloadJsonExport") {
    handleJsonExportRequest(msg, sendResponse);
    return true;
  }
});

chrome.downloads.onChanged.addListener((delta) => {
  if (typeof delta.id !== "number") {
    return;
  }

  const entry = pendingDownloads.get(delta.id);
  if (!entry || entry.settled) {
    return;
  }

  if (delta.state?.current === "complete") {
    pendingDownloads.delete(delta.id);
    settleSuccess(entry);
    return;
  }

  if (delta.state?.current === "interrupted") {
    pendingDownloads.delete(delta.id);
    void retryOrFailDownload(entry, delta.error?.current || "Download interrupted");
  }
});

async function handleJsonExportRequest(msg, sendResponse) {
  const entry = {
    requestId: nextRequestId++,
    filename: msg.filename,
    content: JSON.stringify(msg.payload ?? null, null, 2),
    mimeType: "application/json",
    attempts: 0,
    retryStartedAt: null,
    timeoutMs: msg.timeoutMs || 5000,
    sendResponse,
    settled: false
  };

  try {
    await startDownloadAttempt(entry);
  } catch (error) {
    await settleFailure(entry, error.message || "Download failed to start");
  }
}

async function startDownloadAttempt(entry) {
  entry.attempts += 1;

  const downloadId = await chrome.downloads.download({
    url: buildDownloadDataUrl(entry.content, entry.mimeType),
    filename: entry.filename,
    saveAs: false
  });

  entry.downloadId = downloadId;
  pendingDownloads.set(downloadId, entry);
}

async function retryOrFailDownload(entry, errorMessage) {
  if (entry.retryStartedAt == null) {
    entry.retryStartedAt = Date.now();
  }

  if (!shouldRetryDownload({
    startedAt: entry.retryStartedAt,
    timeoutMs: entry.timeoutMs
  })) {
    await settleFailure(entry, `Download recovery timed out after ${entry.timeoutMs}ms (${errorMessage})`);
    return;
  }

  console.warn(
    `[LinkedInScraper] Retrying download for ${entry.filename} after interruption: ${errorMessage}`
  );

  await sleep(RETRY_BACKOFF_MS);

  try {
    await startDownloadAttempt(entry);
  } catch (error) {
    await settleFailure(entry, error.message || "Download retry failed to start");
  }
}

async function settleSuccess(entry) {
  if (entry.settled) {
    return;
  }

  entry.settled = true;
  entry.sendResponse({
    ok: true,
    recovered: entry.attempts > 1,
    attempts: entry.attempts
  });
}

async function settleFailure(entry, errorMessage) {
  if (entry.settled) {
    return;
  }

  entry.settled = true;
  const record = buildFailedDownloadRecord(entry, errorMessage);
  await appendFailedDownload(record);
  console.error(`[LinkedInScraper] Download failed for ${entry.filename}: ${errorMessage}`);
  entry.sendResponse({
    ok: false,
    recovered: entry.attempts > 1,
    attempts: entry.attempts,
    error: errorMessage
  });
}

async function appendFailedDownload(record) {
  const failedDownloads = await getFailedDownloads();
  const nextFailedDownloads = trimFailedDownloads([...failedDownloads, record], 100);
  await chrome.storage.local.set({ [FAILED_DOWNLOADS_KEY]: nextFailedDownloads });
}

async function getFailedDownloads() {
  const result = await chrome.storage.local.get(FAILED_DOWNLOADS_KEY);
  return Array.isArray(result[FAILED_DOWNLOADS_KEY]) ? result[FAILED_DOWNLOADS_KEY] : [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
