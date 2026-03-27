(function (root) {
  function createBootstrapMarker(runtimeId) {
    return { runtimeId };
  }

  function shouldBootstrapContentScript(existingMarker, runtimeId) {
    if (!existingMarker) {
      return true;
    }

    if (typeof existingMarker !== "object") {
      return true;
    }

    return existingMarker.runtimeId !== runtimeId;
  }

  function cleanupStaleControls(document) {
    document.getElementById("linked-in-scraper-controls-root")?.remove();
    document.getElementById("linked-in-scraper-controls-style")?.remove();
  }

  function resetBootstrapState(root, document) {
    delete root.__linkedInScraperLoaded;
    cleanupStaleControls(document);
  }

  const api = {
    cleanupStaleControls,
    createBootstrapMarker,
    resetBootstrapState,
    shouldBootstrapContentScript
  };

  root.LinkedInScraperBootstrap = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
