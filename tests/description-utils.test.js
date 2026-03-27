const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findSectionContext,
  formatAboutCompanySection,
  readSectionText
} = require("../description_utils.js");

test("findSectionContext prefers the content adjacent to the requested heading", () => {
  const aboutJobTextEl = { innerText: "Real job description" };
  const aboutCompanyTextEl = { innerText: "Company overview" };
  const aboutJobExpandButton = { tagName: "BUTTON" };
  const aboutCompanyExpandButton = { tagName: "BUTTON" };

  const afterAboutJob = {
    matches: (selector) => selector === "hr",
    querySelector: () => null,
    nextElementSibling: null
  };
  const aboutJobContentBlock = {
    matches: () => false,
    querySelector: (selector) => {
      if (selector === '[data-testid="expandable-text-box"]') return aboutJobTextEl;
      if (selector === '[data-testid="expandable-text-button"]') return aboutJobExpandButton;
      return null;
    },
    nextElementSibling: afterAboutJob
  };
  const aboutCompanyContentBlock = {
    matches: () => false,
    querySelector: (selector) => {
      if (selector === '[data-testid="expandable-text-box"]') return aboutCompanyTextEl;
      if (selector === '[data-testid="expandable-text-button"]') return aboutCompanyExpandButton;
      return null;
    },
    nextElementSibling: null
  };

  const aboutJobHeadingWrapper = {
    nextElementSibling: aboutJobContentBlock
  };
  const aboutCompanyHeadingWrapper = {
    nextElementSibling: aboutCompanyContentBlock
  };

  const doc = {
    querySelectorAll: () => [
      { textContent: "About the company", parentElement: aboutCompanyHeadingWrapper },
      { textContent: "About the job", parentElement: aboutJobHeadingWrapper }
    ]
  };

  const aboutJob = findSectionContext(doc, "About the job");
  const aboutCompany = findSectionContext(doc, "About the company");

  assert.equal(aboutJob.textEl, aboutJobTextEl);
  assert.equal(aboutJob.expandButtonEl, aboutJobExpandButton);
  assert.equal(aboutJob.missingSection, false);

  assert.equal(aboutCompany.textEl, aboutCompanyTextEl);
  assert.equal(aboutCompany.expandButtonEl, aboutCompanyExpandButton);
  assert.equal(aboutCompany.missingSection, false);
});

test("formatAboutCompanySection adds a note when About the company is missing", () => {
  const result = formatAboutCompanySection("", { missingAboutCompany: true });

  assert.match(result, /^Note: LinkedIn "About the company" section was not found\./);
});

test("formatAboutCompanySection returns the company text when it is present", () => {
  const result = formatAboutCompanySection("Company overview", { missingAboutCompany: false });

  assert.equal(result, "Company overview");
});

test("readSectionText clicks expand when available and strips inline more text", async () => {
  let clicks = 0;
  const textEl = {
    innerText: "Collapsed preview\n… more",
    cloneNode() {
      return {
        querySelectorAll: () => [{ remove: () => {} }],
        innerText: "Expanded company overview"
      };
    }
  };
  const expandButtonEl = {
    click() {
      clicks++;
      textEl.innerText = "Expanded company overview";
    }
  };

  const result = await readSectionText({
    textEl,
    expandButtonEl,
    sleep: async () => {}
  });

  assert.equal(clicks, 1);
  assert.equal(result, "Expanded company overview");
});

test("readSectionText returns section text directly when no expand button exists", async () => {
  const textEl = {
    innerText: "Short company overview",
    cloneNode() {
      return {
        querySelectorAll: () => [],
        innerText: "Short company overview"
      };
    }
  };

  const result = await readSectionText({
    textEl,
    expandButtonEl: null,
    sleep: async () => {}
  });

  assert.equal(result, "Short company overview");
});

test("findSectionContext can use alternate text selectors on the heading container", () => {
  const textEl = { innerText: "About the job\nExpanded description" };
  const section = {
    matches: (selector) => selector === "#job-details",
    querySelector: () => null,
    nextElementSibling: null,
    parentElement: null
  };
  const heading = {
    textContent: "About the job",
    parentElement: section,
    closest: () => section
  };
  const doc = {
    querySelectorAll: () => [heading]
  };

  const result = findSectionContext(doc, "About the job", {
    textSelectors: ["#job-details"]
  });

  assert.equal(result.textEl, section);
  assert.equal(result.missingSection, false);
});

test("readSectionText strips alternate expand buttons from cloned content", async () => {
  const removed = [];
  const textEl = {
    innerText: "Workspot overview",
    cloneNode() {
      return {
        querySelectorAll(selector) {
          if (selector === ".inline-show-more-text__button") {
            return [{ remove: () => removed.push("removed") }];
          }
          return [];
        },
        innerText: "Expanded company overview"
      };
    }
  };

  const result = await readSectionText({
    textEl,
    expandButtonEl: null,
    expandButtonSelectors: [".inline-show-more-text__button"],
    sleep: async () => {}
  });

  assert.equal(removed.length, 1);
  assert.equal(result, "Expanded company overview");
});

test("readSectionText returns quickly when the section is absent", async () => {
  const result = await readSectionText({
    textEl: null,
    expandButtonEl: null,
    expandButtonSelectors: [".inline-show-more-text__button"],
    sleep: async () => {
      throw new Error("sleep should not be called");
    }
  });

  assert.equal(result, "");
});
