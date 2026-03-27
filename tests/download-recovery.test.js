const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDownloadDataUrl,
  buildFailedDownloadRecord,
  formatDownloadHealthMessage,
  shouldRetryDownload,
  trimFailedDownloads
} = require("../download_recovery.js");

test("buildDownloadDataUrl encodes unicode JSON content with the requested mime type", () => {
  const dataUrl = buildDownloadDataUrl("{\"company\":\"Caf\u00e9\"}", "application/json");

  assert.match(dataUrl, /^data:application\/json;base64,/);
  const encoded = dataUrl.replace("data:application/json;base64,", "");
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  assert.equal(decoded, "{\"company\":\"Caf\u00e9\"}");
});

test("buildDownloadDataUrl preserves content larger than one encoding chunk", () => {
  const largeContent = JSON.stringify({
    jobs: Array.from({ length: 1500 }, (_, index) => ({
      jobId: String(index),
      title: `Role ${index}`
    }))
  });

  const dataUrl = buildDownloadDataUrl(largeContent, "application/json");
  const encoded = dataUrl.replace("data:application/json;base64,", "");
  const decoded = Buffer.from(encoded, "base64").toString("utf8");

  assert.equal(decoded, largeContent);
});

test("shouldRetryDownload allows retries within the timeout budget", () => {
  const result = shouldRetryDownload({
    startedAt: 1000,
    timeoutMs: 5000
  }, 5900);

  assert.equal(result, true);
});

test("shouldRetryDownload stops retries once the timeout budget is exhausted", () => {
  const result = shouldRetryDownload({
    startedAt: 1000,
    timeoutMs: 5000
  }, 6000);

  assert.equal(result, false);
});

test("buildFailedDownloadRecord captures the file, attempts, and timestamp", () => {
  const record = buildFailedDownloadRecord({
    filename: "scraped-jobs/2026-03-20/Acme_Engineer_1.md",
    attempts: 3
  }, "Download recovery timed out after 5000ms", "2026-03-20T14:35:12.000Z");

  assert.deepEqual(record, {
    filename: "scraped-jobs/2026-03-20/Acme_Engineer_1.md",
    error: "Download recovery timed out after 5000ms",
    attempts: 3,
    failedAt: "2026-03-20T14:35:12.000Z"
  });
});

test("trimFailedDownloads keeps the most recent records", () => {
  const records = Array.from({ length: 105 }, (_, index) => ({ filename: `job-${index}.md` }));

  const trimmed = trimFailedDownloads(records, 100);

  assert.equal(trimmed.length, 100);
  assert.deepEqual(trimmed[0], { filename: "job-5.md" });
  assert.deepEqual(trimmed.at(-1), { filename: "job-104.md" });
});

test("formatDownloadHealthMessage returns an empty string when there are no failures", () => {
  assert.equal(formatDownloadHealthMessage(0), "");
});

test("formatDownloadHealthMessage renders a popup hint when failures exist", () => {
  assert.equal(
    formatDownloadHealthMessage(2),
    "Failed downloads: 2 (see chrome.storage.local)"
  );
});
