const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resetBootstrapState,
  createBootstrapMarker,
  shouldBootstrapContentScript
} = require("../content_script_bootstrap.js");

test("should bootstrap when no prior marker exists", () => {
  assert.equal(shouldBootstrapContentScript(undefined, "runtime-1"), true);
});

test("should skip bootstrap when the active runtime already initialized the page", () => {
  const marker = createBootstrapMarker("runtime-1");

  assert.equal(shouldBootstrapContentScript(marker, "runtime-1"), false);
});

test("should bootstrap when the stale page marker is the old boolean guard", () => {
  assert.equal(shouldBootstrapContentScript(true, "runtime-1"), true);
});

test("should bootstrap when the existing marker belongs to a different runtime id", () => {
  const marker = createBootstrapMarker("runtime-old");

  assert.equal(shouldBootstrapContentScript(marker, "runtime-new"), true);
});

test("resetBootstrapState clears the stale marker and injected controls", () => {
  const root = {
    __linkedInScraperLoaded: createBootstrapMarker("runtime-old")
  };
  let removedRoot = false;
  let removedStyle = false;
  const document = {
    getElementById(id) {
      if (id === "linked-in-scraper-controls-root") {
        return { remove() { removedRoot = true; } };
      }
      if (id === "linked-in-scraper-controls-style") {
        return { remove() { removedStyle = true; } };
      }
      return null;
    }
  };

  resetBootstrapState(root, document);

  assert.equal(root.__linkedInScraperLoaded, undefined);
  assert.equal(removedRoot, true);
  assert.equal(removedStyle, true);
});
