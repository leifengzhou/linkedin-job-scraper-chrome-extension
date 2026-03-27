(function (root) {
  function createJsonExportBuffer() {
    return {
      jobs: [],
      failures: [],
      partialCount: 0
    };
  }

  function buildExportJobRecord(jobData, options = {}) {
    return {
      ...jobData,
      missingFields: Array.isArray(options.missingFields) ? options.missingFields.slice() : [],
      exhaustedRetries: Boolean(options.exhaustedRetries)
    };
  }

  function appendExportJob(buffer, jobRecord) {
    buffer.jobs.push(jobRecord);

    if (Array.isArray(jobRecord.missingFields) && jobRecord.missingFields.length > 0) {
      buffer.partialCount += 1;
    }

    return buffer;
  }

  function appendExportFailure(buffer, failure) {
    buffer.failures.push({
      label: failure.label || "",
      error: failure.error || ""
    });

    return buffer;
  }

  function buildJsonExportPayload({
    exportedAt = new Date().toISOString(),
    runDate,
    buffer,
    source = "linkedin-job-scraper"
  }) {
    return {
      exportedAt,
      source,
      runDate,
      summary: {
        savedCount: buffer.jobs.length,
        failedCount: buffer.failures.length,
        partialCount: buffer.partialCount
      },
      jobs: buffer.jobs.slice(),
      failures: buffer.failures.slice()
    };
  }

  const api = {
    appendExportFailure,
    appendExportJob,
    buildExportJobRecord,
    buildJsonExportPayload,
    createJsonExportBuffer
  };

  root.LinkedInScraperJsonExport = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
