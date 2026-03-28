const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LINKEDIN_JOBS_HOME_URL,
  buildPopupState,
  isSupportedLinkedInJobsUrl
} = require("../popup_state.js");

test("isSupportedLinkedInJobsUrl rejects LinkedIn Jobs search pages", () => {
  assert.equal(
    isSupportedLinkedInJobsUrl("https://www.linkedin.com/jobs/search/?keywords=engineer"),
    false
  );
});

test("isSupportedLinkedInJobsUrl accepts LinkedIn Jobs search-results pages", () => {
  assert.equal(
    isSupportedLinkedInJobsUrl("https://www.linkedin.com/jobs/search-results/?keywords=design"),
    true
  );
});

test("isSupportedLinkedInJobsUrl rejects LinkedIn Jobs search-result pages", () => {
  assert.equal(
    isSupportedLinkedInJobsUrl("https://www.linkedin.com/jobs/search-result/?keywords=design"),
    false
  );
});

test("isSupportedLinkedInJobsUrl rejects unsupported LinkedIn pages", () => {
  assert.equal(isSupportedLinkedInJobsUrl("https://www.linkedin.com/feed/"), false);
});

test("buildPopupState enables scraping on supported pages", () => {
  assert.deepEqual(
    buildPopupState({ url: "https://www.linkedin.com/jobs/search-results/?keywords=engineer" }),
    {
      canScrape: true,
      goToJobsUrl: LINKEDIN_JOBS_HOME_URL,
      pageMessage: "This page is ready. Click Ready to Scrape to open the in-page controls."
    }
  );
});

test("buildPopupState disables scraping when the current page is unsupported", () => {
  assert.deepEqual(
    buildPopupState({ url: "https://www.linkedin.com/feed/" }),
    {
      canScrape: false,
      goToJobsUrl: LINKEDIN_JOBS_HOME_URL,
      pageMessage: "Open a LinkedIn Jobs search-results page to enable Ready to Scrape."
    }
  );
});

test("buildPopupState handles missing active tab context", () => {
  assert.deepEqual(
    buildPopupState(null),
    {
      canScrape: false,
      goToJobsUrl: LINKEDIN_JOBS_HOME_URL,
      pageMessage: "Open a LinkedIn Jobs search-results page to enable Ready to Scrape."
    }
  );
});
