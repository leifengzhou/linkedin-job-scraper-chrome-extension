const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const CONTENT_SCRIPT_PATH = path.join(__dirname, "..", "content_script.js");
const CONTENT_SCRIPT_SOURCE = fs.readFileSync(CONTENT_SCRIPT_PATH, "utf8");
const CONTENT_SCRIPT_EXPORT_MARKER = `
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
`;

function createTextElement(text) {
  return {
    innerText: text,
    textContent: text,
    cloneNode() {
      return {
        innerText: text,
        textContent: text,
        querySelectorAll() {
          return [];
        }
      };
    }
  };
}

function createTimerControls() {
  const timers = [];

  return {
    setTimeout(callback) {
      const timer = {
        callback,
        cleared: false
      };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) {
        timer.cleared = true;
      }
    },
    runPending() {
      while (timers.length > 0) {
        const timer = timers.shift();
        if (!timer.cleared) {
          timer.callback();
        }
      }
    }
  };
}

function loadContentScriptTestApi({
  adapters = {},
  descriptionUtils = {},
  documentOverrides = {},
  locationSearch = "?currentJobId=123",
  timerControls = createTimerControls()
} = {}) {
  assert.ok(
    CONTENT_SCRIPT_SOURCE.includes(CONTENT_SCRIPT_EXPORT_MARKER),
    "expected content_script.js export marker to exist for test instrumentation"
  );

  const observers = [];

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.target = null;
      this.options = null;
      this.disconnected = false;
      observers.push(this);
    }

    observe(target, options) {
      this.target = target;
      this.options = options;
    }

    disconnect() {
      this.disconnected = true;
    }

    trigger() {
      this.callback();
    }
  }

  const defaultDocument = {
    body: {
      appendChild() {}
    },
    documentElement: {
      appendChild() {}
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const document = Object.assign({}, defaultDocument, documentOverrides);
  const sandbox = {
    URL,
    URLSearchParams,
    Promise,
    console: {
      log() {},
      warn() {},
      error() {}
    },
    chrome: {
      runtime: {
        id: "runtime-1",
        onMessage: {
          addListener() {}
        },
        sendMessage: async () => ({ ok: true })
      }
    },
    document,
    location: {
      href: "https://www.linkedin.com/jobs/search/",
      search: locationSearch
    },
    Event: function Event(type, init) {
      this.type = type;
      this.init = init || {};
    },
    MutationObserver: FakeMutationObserver,
    setTimeout: timerControls.setTimeout.bind(timerControls),
    clearTimeout: timerControls.clearTimeout.bind(timerControls)
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.LinkedInScraperBootstrap = {
    cleanupStaleControls() {},
    createBootstrapMarker(runtimeId) {
      return { runtimeId };
    },
    shouldBootstrapContentScript() {
      return true;
    }
  };
  sandbox.LinkedInScraperJsonExport = {
    appendExportFailure() {},
    appendExportJob() {},
    buildExportJobRecord(jobRecord) {
      return jobRecord;
    },
    buildJsonExportPayload() {
      return {};
    },
    createJsonExportBuffer() {
      return { partialCount: 0 };
    }
  };
  sandbox.LinkedInScraperRetryPolicy = {
    collectJobDataWithRetries() {
      throw new Error("collectJobDataWithRetries should not be called in these tests");
    }
  };
  sandbox.LinkedInScraperInPageControls = {
    buildControlsViewModel() {
      return {};
    },
    createControlsDom() {
      return {
        rootEl: {},
        primaryButtonEl: { addEventListener() {} },
        downloadButtonEl: { addEventListener() {} },
        targetInputEl: { addEventListener() {}, value: "" },
        closeButtonEl: { addEventListener() {} },
        chipEl: { addEventListener() {} }
      };
    },
    renderControls() {},
    showChip() {},
    showModal() {}
  };
  sandbox.LinkedInScraperSession = {
    createScrapeSession() {
      return {
        status: "idle",
        targetCount: "",
        page: 1,
        savedCount: 0,
        failedCount: 0,
        events: []
      };
    },
    getPendingTerminalState() {
      return null;
    },
    getProcessedCount() {
      return 0;
    },
    finishRun() {},
    markPageContext() {},
    markPaused() {},
    recordJobResult() {},
    requestPause() {},
    resolveResumeIndex() {
      return 0;
    },
    resumeRun() {},
    setDetailText() {},
    setTargetCount() {},
    setModalOpen() {},
    startRun() {},
    stopRun() {}
  };
  sandbox.LinkedInScraperDescriptionUtils = Object.assign({
    findSectionContext() {
      return {
        textEl: null,
        expandButtonEl: null,
        missingSection: true
      };
    },
    readSectionText: async () => ""
  }, descriptionUtils);
  sandbox.LinkedInScraperJobDomAdapters = Object.assign({
    extractCardData() {
      return {};
    },
    extractDetailData() {
      return {
        title: "",
        company: "",
        location: "",
        datePosted: "",
        description: "",
        aboutCompany: ""
      };
    },
    extractApplyAction() {
      return {
        applyType: "",
        href: "",
        ariaLabel: "",
        isEasyApply: false
      };
    },
    findAboutCompanySection() {
      return {
        textEl: null,
        expandButtonEl: null,
        missingSection: true
      };
    },
    findAboutJobSection() {
      return {
        textEl: null,
        expandButtonEl: null,
        missingSection: true
      };
    },
    findDetailRoot() {
      return null;
    },
    findJobListContainer() {
      return null;
    },
    findNextPageButton() {
      return null;
    },
    getCardKey() {
      return null;
    },
    getDetailSnapshot() {
      return "";
    },
    getJobCards() {
      return [];
    }
  }, adapters);

  const instrumentedSource = CONTENT_SCRIPT_SOURCE.replace(
    CONTENT_SCRIPT_EXPORT_MARKER,
    `
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  globalThis.__contentScriptTestApi = {
    collectCurrentJobData,
    waitForDetailChange
  };
}
`
  );

  vm.runInNewContext(instrumentedSource, sandbox, {
    filename: CONTENT_SCRIPT_PATH
  });

  return {
    api: sandbox.__contentScriptTestApi,
    observers,
    document,
    timerControls
  };
}

test("collectCurrentJobData prefers search-results detail metadata over card fallbacks", async () => {
  const detailRoot = { id: "detail-root" };
  const detailDescription = createTextElement("Expanded detail description");
  const detailCompany = createTextElement("Dedicated company overview");
  const { api } = loadContentScriptTestApi({
    adapters: {
      extractCardData() {
        return {
          title: "Card title",
          company: "Card company",
          location: "Card location",
          datePosted: "Card date",
          salary: "$95/hr - $135/hr",
          applyType: "Easy Apply"
        };
      },
      extractDetailData(rootNode) {
        assert.equal(rootNode, detailRoot);
        return {
          title: "Detail title",
          company: "Detail company",
          location: "Detail location",
          datePosted: "Detail date",
          description: "",
          aboutCompany: ""
        };
      },
      findDetailRoot() {
        return detailRoot;
      },
      findAboutJobSection() {
        return {
          textEl: detailDescription,
          expandButtonEl: null,
          missingSection: false
        };
      },
      findAboutCompanySection() {
        return {
          textEl: detailCompany,
          expandButtonEl: null,
          missingSection: false
        };
      }
    },
    descriptionUtils: {
      findSectionContext(_rootNode, headingText) {
        if (headingText === "About the company") {
          return {
            textEl: createTextElement("Legacy company block"),
            expandButtonEl: null,
            missingSection: false
          };
        }

        return {
          textEl: detailDescription,
          expandButtonEl: null,
          missingSection: false
        };
      },
      readSectionText: async ({ textEl }) => (textEl?.innerText || "").trim()
    }
  });

  const jobData = await api.collectCurrentJobData({}, "123");

  assert.equal(jobData.title, "Detail title");
  assert.equal(jobData.company, "Detail company");
  assert.equal(jobData.location, "Detail location");
  assert.equal(jobData.datePosted, "Detail date");
});

test("collectCurrentJobData reads About the company from the dedicated search-results section", async () => {
  const detailRoot = { id: "detail-root" };
  const detailDescription = createTextElement("Expanded detail description");
  const dedicatedCompanySection = createTextElement("Dedicated company overview");
  const { api } = loadContentScriptTestApi({
    adapters: {
      extractCardData() {
        return {
          title: "Card title",
          company: "Card company",
          location: "Card location",
          datePosted: "Card date",
          salary: "Not listed",
          applyType: ""
        };
      },
      extractDetailData() {
        return {
          title: "Detail title",
          company: "Detail company",
          location: "Detail location",
          datePosted: "Detail date",
          description: "",
          aboutCompany: "Fallback about company"
        };
      },
      findDetailRoot() {
        return detailRoot;
      },
      findAboutJobSection() {
        return {
          textEl: detailDescription,
          expandButtonEl: null,
          missingSection: false
        };
      },
      findAboutCompanySection() {
        return {
          textEl: dedicatedCompanySection,
          expandButtonEl: null,
          missingSection: false
        };
      }
    },
    descriptionUtils: {
      findSectionContext(_rootNode, headingText) {
        if (headingText === "About the company") {
          return {
            textEl: createTextElement("Legacy company block"),
            expandButtonEl: null,
            missingSection: false
          };
        }

        return {
          textEl: detailDescription,
          expandButtonEl: null,
          missingSection: false
        };
      },
      readSectionText: async ({ textEl }) => (textEl?.innerText || "").trim()
    }
  });

  const jobData = await api.collectCurrentJobData({}, "123");

  assert.equal(jobData.aboutCompany, "Dedicated company overview");
});

test("collectCurrentJobData falls back to the LinkedIn permalink when no external apply URL exists", async () => {
  const detailRoot = { id: "detail-root" };
  const detailDescription = createTextElement("Expanded detail description");
  const { api } = loadContentScriptTestApi({
    adapters: {
      extractCardData() {
        return {
          title: "Card title",
          company: "Card company",
          location: "Card location",
          datePosted: "Card date",
          salary: "Not listed",
          applyType: ""
        };
      },
      extractDetailData() {
        return {
          title: "Detail title",
          company: "Detail company",
          location: "Detail location",
          datePosted: "Detail date",
          description: "",
          aboutCompany: ""
        };
      },
      extractApplyAction() {
        return {
          applyType: "Apply on company website",
          href: "",
          ariaLabel: "Apply on company website",
          isEasyApply: false
        };
      },
      findDetailRoot() {
        return detailRoot;
      }
    },
    descriptionUtils: {
      findSectionContext() {
        return {
          textEl: detailDescription,
          expandButtonEl: null,
          missingSection: false
        };
      },
      readSectionText: async ({ textEl }) => (textEl?.innerText || "").trim()
    },
    documentOverrides: {
      querySelector(selector) {
        if (selector === 'a[aria-label="Apply on company website"]') {
          return {
            getAttribute(name) {
              return name === "href"
                ? "https://www.linkedin.com/jobs/view/123/apply/"
                : "";
            }
          };
        }

        return null;
      }
    }
  });

  const jobData = await api.collectCurrentJobData({}, "123");

  assert.equal(jobData.applyUrl, "https://www.linkedin.com/jobs/view/123/");
});

test("waitForDetailChange observes the current semantic detail root instead of document.body", async () => {
  const detailRoot = { id: "detail-root" };
  const observedSnapshotTargets = [];
  let currentSnapshot = "before";
  const timerControls = createTimerControls();
  const { api, observers, document } = loadContentScriptTestApi({
    adapters: {
      findDetailRoot() {
        return detailRoot;
      },
      getDetailSnapshot(rootNode) {
        observedSnapshotTargets.push(rootNode);
        return currentSnapshot;
      }
    },
    documentOverrides: {
      body: { id: "body-root" }
    },
    timerControls
  });

  const waitPromise = api.waitForDetailChange("before", 5000);

  assert.equal(observers.length, 1);
  assert.equal(observers[0].target, detailRoot);
  assert.notEqual(observers[0].target, document.body);

  currentSnapshot = "after";
  observers[0].trigger();

  const result = await waitPromise;
  assert.equal(result, "after");
  assert.deepEqual(observedSnapshotTargets, [detailRoot, detailRoot]);
});

test("waitForDetailChange returns an empty snapshot when the semantic detail root is absent", async () => {
  const timerControls = createTimerControls();
  const { api, observers } = loadContentScriptTestApi({
    adapters: {
      findDetailRoot() {
        return null;
      },
      getDetailSnapshot() {
        throw new Error("getDetailSnapshot should not run without a semantic detail root");
      }
    },
    timerControls
  });

  const resultPromise = api.waitForDetailChange("before", 5000);
  timerControls.runPending();
  const result = await resultPromise;

  assert.equal(result, "");
  assert.equal(observers.length, 0);
});
