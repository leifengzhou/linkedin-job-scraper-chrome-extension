const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  findJobListContainer,
  findNextPageButton,
  getJobCards,
  getCardKey,
  extractCardData,
  getDetailSnapshot,
  findDetailRoot,
  extractDetailData,
  findAboutJobSection,
  findAboutCompanySection,
  extractApplyAction
} = require("../job_dom_adapters.js");

const RESULTS_LIST_SELECTOR = '[data-testid="lazy-column"][componentkey="SearchResultsMainContent"]';
const RESULTS_CARD_SELECTOR = 'div[role="button"][componentkey]';
const RESULTS_DISMISS_SELECTOR = 'button[aria-label^="Dismiss"]';
const DETAILS_SCREEN_SELECTOR = '[data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails"]';
const ABOUT_JOB_SECTION_SELECTOR = '[componentkey^="JobDetails_AboutTheJob_"]';
const ABOUT_COMPANY_SECTION_SELECTOR = '[componentkey^="JobDetails_AboutTheCompany_"]';
const SEARCH_RESULTS_FIXTURE_HTML = fs.readFileSync(
  path.join(__dirname, "..", "UI-differences", "search-result-page-HTML.html"),
  "utf8"
);

function createElement({
  textContent = "",
  innerText = textContent,
  attributes = {},
  children = [],
  query = {},
  queryAll = {}
} = {}) {
  return {
    textContent,
    innerText,
    children,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    querySelector(selector) {
      if (Object.prototype.hasOwnProperty.call(query, selector)) {
        return query[selector];
      }

      for (const child of children) {
        if (child && typeof child.querySelector === "function") {
          const result = child.querySelector(selector);
          if (result) {
            return result;
          }
        }
      }

      return null;
    },
    querySelectorAll(selector) {
      if (Object.prototype.hasOwnProperty.call(queryAll, selector)) {
        return queryAll[selector];
      }

      return [];
    }
  };
}

function decodeHtmlEntities(text) {
  return (text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function parseTagAttributes(tagHtml) {
  const attributes = {};
  const attrPattern = /([\w:-]+)="([^"]*)"/g;
  let match = attrPattern.exec(tagHtml);

  while (match) {
    attributes[match[1]] = decodeHtmlEntities(match[2]);
    match = attrPattern.exec(tagHtml);
  }

  return attributes;
}

function createFixtureElementFromTag(tagHtml) {
  return createElement({
    attributes: parseTagAttributes(tagHtml)
  });
}

function createFixtureHtmlRoot(html) {
  return {
    querySelector(selector) {
      if (selector === 'a[aria-label*="Easy Apply"]') {
        const tag = html.match(/<a\b[^>]*aria-label="[^"]*Easy Apply[^"]*"[^>]*>/i)?.[0];
        return tag ? createFixtureElementFromTag(tag) : null;
      }

      return null;
    },
    querySelectorAll(selector) {
      if (selector === "a") {
        return Array.from(
          html.matchAll(/<a\b[^>]*>/gi),
          (match) => createFixtureElementFromTag(match[0])
        );
      }

      return [];
    }
  };
}

test("findJobListContainer returns the search-results main lazy column when it contains dismissible role-button cards", () => {
  const dismissButton = createElement({
    attributes: { "aria-label": "Dismiss Senior Product Manager job" }
  });
  const jobCard = createElement({
    attributes: { componentkey: "card-1" },
    query: { [RESULTS_DISMISS_SELECTOR]: dismissButton }
  });
  const noiseCard = createElement({
    attributes: { componentkey: "not-a-job" }
  });
  const resultsList = createElement({
    queryAll: {
      [RESULTS_CARD_SELECTOR]: [noiseCard, jobCard]
    }
  });
  const doc = {
    querySelector(selector) {
      if (selector === RESULTS_LIST_SELECTOR) {
        return resultsList;
      }
      return null;
    }
  };

  assert.equal(findJobListContainer(doc), resultsList);
});

test("getJobCards returns dismissible componentkey role-button cards", () => {
  const dismissButton = createElement({
    attributes: { "aria-label": "Dismiss Senior Product Manager job" }
  });
  const jobCard = createElement({
    attributes: { componentkey: "card-1" },
    query: { [RESULTS_DISMISS_SELECTOR]: dismissButton }
  });
  const promoCard = createElement({
    attributes: { componentkey: "promo-card" }
  });
  const resultsList = createElement({
    queryAll: {
      [RESULTS_CARD_SELECTOR]: [promoCard, jobCard]
    }
  });
  const doc = {
    querySelector(selector) {
      if (selector === RESULTS_LIST_SELECTOR) {
        return resultsList;
      }
      return null;
    }
  };

  assert.deepEqual(getJobCards(doc), [jobCard]);
});

test("getCardKey prefers a stable jobs/view id over componentkey", () => {
  const jobLinkTag = SEARCH_RESULTS_FIXTURE_HTML.match(/<a\b[^>]*href="https:\/\/www\.linkedin\.com\/jobs\/view\/4382994905\/\?[^"]*"[^>]*>/)?.[0];
  assert.ok(jobLinkTag, "expected fixture to contain a stable /jobs/view/4382994905 link");

  const jobLink = createFixtureElementFromTag(jobLinkTag);
  const card = createElement({
    attributes: {
      componentkey: "volatile-component-key"
    },
    query: {
      'a[href*="/jobs/view/"]': jobLink
    }
  });

  assert.equal(getCardKey(card), "4382994905");
});

test("extractCardData reads title company location posted date salary and easy apply from search-results cards", () => {
  const dismissButton = createElement({
    attributes: { "aria-label": "Dismiss Senior Product Manager job" }
  });
  const paragraphs = [
    createElement({ innerText: "Senior Product Manager" }),
    createElement({ innerText: "Motion Recruitment" }),
    createElement({ innerText: "Englewood Cliffs, NJ (On-site)" }),
    createElement({ innerText: "$95/hr - $135/hr" }),
    createElement({ innerText: "Easy Apply" })
  ];
  const postedLabel = createElement({ innerText: "Posted on March 9, 2026, 11:34 AM" });
  const card = createElement({
    textContent: "Viewed Promoted Easy Apply",
    attributes: { componentkey: "card-1" },
    query: {
      [RESULTS_DISMISS_SELECTOR]: dismissButton
    },
    queryAll: {
      p: paragraphs,
      span: [postedLabel]
    }
  });

  assert.deepEqual(extractCardData(card), {
    title: "Senior Product Manager",
    company: "Motion Recruitment",
    location: "Englewood Cliffs, NJ (On-site)",
    datePosted: "March 9, 2026, 11:34 AM",
    salary: "$95/hr - $135/hr",
    applyType: "Easy Apply"
  });
});

test("findDetailRoot returns the semantic job-details screen instead of the page-wide main element", () => {
  const detailRoot = createElement({ attributes: { "data-sdui-screen": "com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails" } });
  const mainEl = createElement();
  const doc = {
    querySelector(selector) {
      if (selector === DETAILS_SCREEN_SELECTOR) {
        return detailRoot;
      }
      if (selector === "main") {
        return mainEl;
      }
      return null;
    }
  };

  assert.equal(findDetailRoot(doc), detailRoot);
});

test("extractDetailData reads search-results detail metadata without using search-page classes", () => {
  const titleHeading = createElement({ innerText: "Senior Product Manager" });
  const companyLink = createElement({ innerText: "Motion Recruitment" });
  const meta = createElement({ innerText: "Englewood Cliffs, NJ (On-site) · 2 weeks ago · 3 applicants" });
  const description = createElement({ innerText: "About the job\nLead roadmap execution." });
  const aboutCompany = createElement({ innerText: "Motion Recruitment connects teams with technology talent." });
  const aboutJobSection = createElement({
    query: {
      '[data-testid="expandable-text-box"]': description
    }
  });
  const aboutCompanySection = createElement({
    query: {
      '[data-testid="expandable-text-box"]': aboutCompany
    }
  });
  const unrelatedCompanyLink = createElement({ innerText: "Wrong Company" });
  const detailRoot = createElement({
    query: {
      "h1": titleHeading,
      'a[href*="/company/"]': companyLink,
      [ABOUT_JOB_SECTION_SELECTOR]: aboutJobSection,
      [ABOUT_COMPANY_SECTION_SELECTOR]: aboutCompanySection
    },
    queryAll: {
      "h1": [titleHeading],
      'a[href*="/company/"]': [companyLink],
      '[data-testid="job-details-top-card-metadata"]': [meta]
    }
  });
  const doc = {
    querySelector(selector) {
      if (selector === DETAILS_SCREEN_SELECTOR) {
        return detailRoot;
      }
      if (selector === 'a[href*="/company/"]') {
        return unrelatedCompanyLink;
      }
      return null;
    }
  };

  assert.deepEqual(extractDetailData(doc), {
    title: "Senior Product Manager",
    company: "Motion Recruitment",
    location: "Englewood Cliffs, NJ (On-site)",
    datePosted: "2 weeks ago",
    description: "About the job\nLead roadmap execution.",
    aboutCompany: "Motion Recruitment connects teams with technology talent."
  });
});

test("findAboutJobSection returns the About the job expandable text block", () => {
  const textEl = createElement({ innerText: "About the job\nLead roadmap execution." });
  const expandButtonEl = createElement({ innerText: "Show more" });
  const aboutJobSection = createElement({
    query: {
      '[data-testid="expandable-text-box"]': textEl,
      '[data-testid="expandable-text-button"]': expandButtonEl
    }
  });
  const detailRoot = createElement({
    query: {
      [ABOUT_JOB_SECTION_SELECTOR]: aboutJobSection
    }
  });

  assert.deepEqual(findAboutJobSection(detailRoot), {
    textEl,
    expandButtonEl,
    missingSection: false
  });
});

test("findAboutCompanySection returns the About the company expandable text block", () => {
  const textEl = createElement({ innerText: "Motion Recruitment connects teams with technology talent." });
  const expandButtonEl = createElement({ innerText: "Show more" });
  const aboutCompanySection = createElement({
    query: {
      '[data-testid="expandable-text-box"]': textEl,
      '[data-testid="expandable-text-button"]': expandButtonEl
    }
  });
  const detailRoot = createElement({
    query: {
      [ABOUT_COMPANY_SECTION_SELECTOR]: aboutCompanySection
    }
  });

  assert.deepEqual(findAboutCompanySection(detailRoot), {
    textEl,
    expandButtonEl,
    missingSection: false
  });
});

test("extractApplyAction reads Easy Apply from an anchor CTA in the detail header", () => {
  const easyApplyLink = createElement({
    innerText: "Easy Apply",
    attributes: {
      href: "https://www.linkedin.com/jobs/view/4382994905/apply/?openSDUIApplyFlow=true",
      "aria-label": "Easy Apply to this job"
    }
  });
  const detailRoot = createElement({
    query: {
      'a[aria-label*="Easy Apply"]': easyApplyLink
    }
  });

  assert.deepEqual(extractApplyAction(detailRoot), {
    applyType: "Easy Apply",
    href: "",
    ariaLabel: "Easy Apply to this job",
    isEasyApply: true
  });
});

test("extractApplyAction matches company-website CTA labels without requiring an exact aria-label", () => {
  const companyWebsiteLink = createElement({
    innerText: "Apply",
    attributes: {
      href: "https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fcompany.example%2Fjobs%2F123",
      "aria-label": "Apply on Example Corp website"
    }
  });
  const detailRoot = createElement({
    queryAll: {
      a: [companyWebsiteLink]
    }
  });

  assert.deepEqual(extractApplyAction(detailRoot), {
    applyType: "Apply on company website",
    href: "https://company.example/jobs/123",
    ariaLabel: "Apply on Example Corp website",
    isEasyApply: false
  });
});

test("extractApplyAction handles the fixture-backed Easy Apply anchor markup", () => {
  const detailRoot = createFixtureHtmlRoot(SEARCH_RESULTS_FIXTURE_HTML);

  assert.deepEqual(extractApplyAction(detailRoot), {
    applyType: "Easy Apply",
    href: "",
    ariaLabel: "Easy Apply to this job",
    isEasyApply: true
  });
});

test("extractApplyAction reads company-website CTA from the detail header", () => {
  const companyWebsiteLink = createElement({
    innerText: "Apply",
    attributes: {
      href: "https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fcompany.example%2Fjobs%2F123",
      "aria-label": "Apply on company website"
    }
  });
  assert.deepEqual(extractApplyAction(createElement({
    queryAll: {
      a: [companyWebsiteLink]
    }
  })), {
    applyType: "Apply on company website",
    href: "https://company.example/jobs/123",
    ariaLabel: "Apply on company website",
    isEasyApply: false
  });
});

test("findNextPageButton supports the search-results pagination next button", () => {
  const nextButton = createElement();
  const doc = {
    querySelector(selector) {
      if (
        selector === 'button[data-testid="pagination-controls-next-button-visible"]' ||
        selector === 'button[aria-label="View next page"]'
      ) {
        return nextButton;
      }
      return null;
    }
  };

  assert.equal(findNextPageButton(doc), nextButton);
});

test("getDetailSnapshot returns the semantic detail title plus about-job text", () => {
  const detailRoot = createElement({
    query: {
      [DETAILS_SCREEN_SELECTOR]: createElement({
        query: {
          h1: createElement({ innerText: "Senior Product Manager" }),
          [ABOUT_JOB_SECTION_SELECTOR]: createElement({
            query: {
              '[data-testid="expandable-text-box"]': createElement({ innerText: "About the job\nLead roadmap execution." })
            }
          })
        },
        queryAll: {
          h1: [createElement({ innerText: "Senior Product Manager" })],
          '[data-testid="expandable-text-box"]': [createElement({ innerText: "About the job\nLead roadmap execution." })]
        }
      })
    }
  });

  assert.equal(
    getDetailSnapshot(detailRoot),
    "Senior Product Manager\nAbout the job\nLead roadmap execution."
  );
});
