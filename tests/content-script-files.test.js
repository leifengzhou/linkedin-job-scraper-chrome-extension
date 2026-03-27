const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CONTENT_SCRIPT_FILES
} = require("../content_script_files.js");

test("content script injection list includes the shared DOM adapter before the main content script", () => {
  assert.deepEqual(CONTENT_SCRIPT_FILES, [
    "retry_policy.js",
    "job_dom_adapters.js",
    "description_utils.js",
    "scrape_session.js",
    "in_page_controls.js",
    "json_export.js",
    "content_script_bootstrap.js",
    "content_script.js"
  ]);
});
