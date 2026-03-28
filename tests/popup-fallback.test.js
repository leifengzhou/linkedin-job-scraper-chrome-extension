const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createElement() {
  const listeners = {};

  return {
    textContent: "",
    disabled: false,
    classList: {
      toggle() {}
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    async click() {
      if (listeners.click) {
        await listeners.click();
      }
    }
  };
}

function loadPopupScript() {
  const source = fs.readFileSync(path.join(__dirname, "..", "popup.js"), "utf8");
  const elements = {
    goToJobsBtn: createElement(),
    readyBtn: createElement(),
    pageMessage: createElement(),
    actionMessage: createElement()
  };
  const listeners = {};
  const calls = {
    create: [],
    update: []
  };

  const context = {
    document: {
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
      getElementById(id) {
        return elements[id];
      }
    },
    chrome: {
      scripting: {
        executeScript: async () => {}
      },
      tabs: {
        create: async (args) => {
          calls.create.push(args);
        },
        query: async () => [],
        sendMessage: async () => {
          throw new Error("not needed");
        },
        update: async (tabId, args) => {
          calls.update.push({ tabId, args });
        }
      }
    },
    window: {
      close() {
        calls.closed = true;
      }
    }
  };

  vm.runInNewContext(source, context);

  return {
    calls,
    elements,
    listeners
  };
}

test("popup.js fallback state uses search-results URL and copy", async () => {
  const { calls, elements, listeners } = loadPopupScript();

  await listeners.DOMContentLoaded();

  assert.equal(elements.pageMessage.textContent, "Open a LinkedIn Jobs search-results page to enable Ready to Scrape.");
  await elements.goToJobsBtn.click();
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].url, "https://www.linkedin.com/jobs/search-results/");
});

test("popup.html intro copy points users to search-results pages", () => {
  const popupHtml = fs.readFileSync(path.join(__dirname, "..", "popup.html"), "utf8");

  assert.match(popupHtml, /Use this on LinkedIn Jobs search-results pages after your results are set up\./);
});
