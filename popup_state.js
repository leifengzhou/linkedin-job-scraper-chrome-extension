(function (root) {
  const LINKEDIN_JOBS_HOME_URL = "https://www.linkedin.com/jobs/search-results/";
  const SUPPORTED_PATH_PATTERNS = [
    /^\/jobs\/search-results(?:\/|$)/
  ];

  function isSupportedLinkedInJobsUrl(url) {
    if (!url) {
      return false;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      return false;
    }

    if (parsedUrl.origin !== "https://www.linkedin.com") {
      return false;
    }

    return SUPPORTED_PATH_PATTERNS.some((pattern) => pattern.test(parsedUrl.pathname));
  }

  function buildPopupState(tab) {
    const canScrape = isSupportedLinkedInJobsUrl(tab?.url);

    return {
      canScrape,
      goToJobsUrl: LINKEDIN_JOBS_HOME_URL,
      pageMessage: canScrape
        ? "This page is ready. Click Ready to Scrape to open the in-page controls."
        : "Open a LinkedIn Jobs search-results page to enable Ready to Scrape."
    };
  }

  const api = {
    LINKEDIN_JOBS_HOME_URL,
    buildPopupState,
    isSupportedLinkedInJobsUrl
  };

  root.LinkedInScraperPopupState = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
