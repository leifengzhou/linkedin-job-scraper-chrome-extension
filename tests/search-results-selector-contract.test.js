const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fixturePath = path.join(
  __dirname,
  "..",
  "UI-differences",
  "search-result-page-HTML.html"
);

const requiredAnchors = [
  'data-testid="lazy-column"',
  'componentkey="SearchResultsMainContent"',
  'id="location-marker-small"',
  'aria-label="Dismiss ',
  'data-testid="pagination-controls-next-button-visible"',
  'data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails"',
  'componentkey="JobDetails_AboutTheJob_',
  'componentkey="JobDetails_AboutTheCompany_',
  'data-testid="expandable-text-box"',
  'data-testid="expandable-text-button"',
  'href="https://www.linkedin.com/company/',
  "currentJobId="
];

test("saved search results HTML preserves the supported selector contract", () => {
  const html = fs.readFileSync(fixturePath, "utf8");

  for (const anchor of requiredAnchors) {
    assert.match(html, new RegExp(escapeRegExp(anchor)));
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
