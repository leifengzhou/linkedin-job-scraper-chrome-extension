(function (root) {
  function getMissingCriticalFields(jobData) {
    const record = jobData || {};
    const missingFields = [];
    if (!record.title) missingFields.push("title");
    if (!record.company) missingFields.push("company");
    if (!record.linkedinUrl) missingFields.push("linkedinUrl");
    if (!record.applyUrl) missingFields.push("applyUrl");
    if (!record.description || record.description === "(Description not available)") {
      missingFields.push("description");
    }
    if (!record.aboutCompany) {
      missingFields.push("aboutCompany");
    }
    return missingFields;
  }

  async function collectJobDataWithRetries({
    collect,
    maxRetries = 10,
    sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
  }) {
    let jobData = null;
    let missingFields = [];

    for (let attemptNumber = 1; attemptNumber <= maxRetries; attemptNumber++) {
      jobData = await collect(attemptNumber);
      missingFields = getMissingCriticalFields(jobData);

      if (missingFields.length === 0) {
        return { jobData, missingFields, exhaustedRetries: false, attempts: attemptNumber };
      }

      if (attemptNumber < maxRetries) {
        await sleep(attemptNumber * 1000);
      }
    }

    return { jobData, missingFields, exhaustedRetries: true, attempts: maxRetries };
  }

  const api = {
    getMissingCriticalFields,
    collectJobDataWithRetries
  };

  root.LinkedInScraperRetryPolicy = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
