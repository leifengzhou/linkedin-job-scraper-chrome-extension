const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("privacy policy page exists at the repo root with required disclosures", () => {
  const privacyPolicyHtml = fs.readFileSync(
    path.join(__dirname, "..", "privacy-policy.html"),
    "utf8"
  );

  assert.match(privacyPolicyHtml, /<title>LinkedIn Job Scraper Privacy Policy<\/title>/);
  assert.match(privacyPolicyHtml, /Website content from LinkedIn Jobs pages/i);
  assert.match(privacyPolicyHtml, /download a local JSON export/i);
  assert.match(privacyPolicyHtml, /do not sell, transfer, or share scraped job content/i);
  assert.match(privacyPolicyHtml, /chrome\.storage\.local/i);
});
