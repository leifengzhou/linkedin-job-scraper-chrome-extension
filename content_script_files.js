(function (root) {
  const CONTENT_SCRIPT_FILES = [
    "retry_policy.js",
    "job_dom_adapters.js",
    "description_utils.js",
    "scrape_session.js",
    "in_page_controls.js",
    "json_export.js",
    "content_script_bootstrap.js",
    "content_script.js"
  ];

  const api = {
    CONTENT_SCRIPT_FILES
  };

  root.LinkedInScraperContentScriptFiles = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
