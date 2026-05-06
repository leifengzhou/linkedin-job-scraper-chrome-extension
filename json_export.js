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

  function sanitizePathSegment(value, fallback = "Unknown") {
    const normalized = String(value || fallback)
      .replace(/[\/\\:*?"<>|]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    return normalized || fallback;
  }

  function normalizeLocationFilterText(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function buildLocationFilterFilenameSegment(locationFilter) {
    const normalized = normalizeLocationFilterText(locationFilter);
    if (!normalized) {
      return "";
    }

    return normalized
      .replace(/[\/\\:*?"<>|]/g, "-")
      .replace(/,\s*/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function prependLocationFilterSegment(filename, locationFilterSegment) {
    const normalizedSegment = sanitizePathSegment(locationFilterSegment, "");
    return normalizedSegment ? `${normalizedSegment}_${filename}` : filename;
  }

  function buildAggregateJsonFilename({
    runDate,
    locationFilterSegment = ""
  }) {
    return prependLocationFilterSegment(`scraped-jobs-${runDate}.json`, locationFilterSegment);
  }

  function buildJobJsonFileDescriptor({
    runDate,
    locationFilterSegment = "",
    jobRecord
  }) {
    const company = sanitizePathSegment(jobRecord.company, "Unknown-company");
    const title = sanitizePathSegment(jobRecord.title, "Unknown-title");
    const jobId = sanitizePathSegment(jobRecord.jobId, "unknown-job");
    const basename = [
      company,
      title,
      sanitizePathSegment(locationFilterSegment, ""),
      jobId
    ].filter(Boolean).join("_");
    const filename = `scraped-jobs/${runDate}/${basename}.json`;

    return {
      filename,
      payload: {
        ...jobRecord
      }
    };
  }

  function buildPerJobJsonFileDescriptors({
    runDate,
    locationFilterSegment = "",
    buffer
  }) {
    return buffer.jobs.map((jobRecord) => buildJobJsonFileDescriptor({
      runDate,
      locationFilterSegment,
      jobRecord
    }));
  }

  const api = {
    appendExportFailure,
    appendExportJob,
    buildAggregateJsonFilename,
    buildJobJsonFileDescriptor,
    buildLocationFilterFilenameSegment,
    buildExportJobRecord,
    buildJsonExportPayload,
    buildPerJobJsonFileDescriptors,
    createJsonExportBuffer
  };

  root.LinkedInScraperJsonExport = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
