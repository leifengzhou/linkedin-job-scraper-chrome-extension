(function (root) {
  function buildMarkdownDataUrl(content) {
    const bytes = new TextEncoder().encode(content);
    const chunkSize = 8192;
    const binaryChunks = [];

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binaryChunks.push(String.fromCharCode(...bytes.slice(i, i + chunkSize)));
    }

    const b64 = btoa(binaryChunks.join(""));
    return "data:text/markdown;base64," + b64;
  }

  function shouldRetryDownload(entry, now = Date.now()) {
    return (now - entry.startedAt) < entry.timeoutMs;
  }

  function buildFailedDownloadRecord(entry, error, failedAt = new Date().toISOString()) {
    return {
      filename: entry.filename,
      error,
      attempts: entry.attempts,
      failedAt
    };
  }

  function trimFailedDownloads(records, maxRecords = 100) {
    return records.slice(-maxRecords);
  }

  function formatDownloadHealthMessage(failedCount) {
    if (!failedCount) {
      return "";
    }

    return `Failed downloads: ${failedCount} (see chrome.storage.local)`;
  }

  const api = {
    buildMarkdownDataUrl,
    shouldRetryDownload,
    buildFailedDownloadRecord,
    trimFailedDownloads,
    formatDownloadHealthMessage
  };

  root.LinkedInScraperDownloadRecovery = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
