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

function requireFixtureMatch(regex, message) {
  const match = SEARCH_RESULTS_FIXTURE_HTML.match(regex);
  assert.ok(match, message);
  return match;
}

function stripFixtureHtml(html) {
  return decodeHtmlEntities(
    (html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function createFixtureTextElementFromMatch(regex, message) {
  const match = requireFixtureMatch(regex, message);
  return createElement({
    innerText: stripFixtureHtml(match[0]),
    textContent: stripFixtureHtml(match[0])
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

function createFixtureDetailRoot() {
  const titleLinkTag = requireFixtureMatch(
    /<a\b[^>]*href="https:\/\/www\.linkedin\.com\/jobs\/view\/4382994905\/\?[^"]*"[^>]*>Senior Product Manager<\/a>/,
    "expected fixture title link in detail header"
  )[0];
  const applyLinkTag = requireFixtureMatch(
    /<a\b[^>]*aria-label="Easy Apply to this job"[^>]*>/,
    "expected fixture Easy Apply link in detail header"
  )[0];
  const companyLinkTag = requireFixtureMatch(
    /<a\b[^>]*href="https:\/\/www\.linkedin\.com\/company\/motion-recruitment-partners\/life\/"[^>]*>Motion Recruitment<\/a>/,
    "expected fixture company link in detail header"
  )[0];
  const metaEl = createFixtureTextElementFromMatch(
    /<p\b[^>]*><span class="_2da8c981">Englewood Cliffs, NJ<\/span>[\s\S]*?<span class="_2da8c981">Over 100 applicants<\/span><\/p>/,
    "expected fixture metadata paragraph in detail header"
  );
  const aboutJobTextEl = createFixtureTextElementFromMatch(
    /<span[^>]*data-testid="expandable-text-box">[\s\S]*?<strong>Qualifications<\/strong>[\s\S]*?<\/span>/,
    "expected fixture About the job expandable text"
  );
  const aboutCompanyTextEl = createFixtureTextElementFromMatch(
    /<span[^>]*data-testid="expandable-text-box">Motion Recruitment, a Kelly® Company,[\s\S]*?Functional\./,
    "expected fixture About the company expandable text"
  );
  const aboutJobSection = createElement({
    query: {
      '[data-testid="expandable-text-box"]': aboutJobTextEl
    }
  });
  const aboutCompanySection = createElement({
    query: {
      '[data-testid="expandable-text-box"]': aboutCompanyTextEl
    }
  });

  return createElement({
    attributes: {
      "data-sdui-screen": "com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails"
    },
    query: {
      [ABOUT_JOB_SECTION_SELECTOR]: aboutJobSection,
      [ABOUT_COMPANY_SECTION_SELECTOR]: aboutCompanySection
    },
    queryAll: {
      'a[href*="/company/"]': [
        Object.assign(createFixtureElementFromTag(companyLinkTag), {
          innerText: "Motion Recruitment",
          textContent: "Motion Recruitment"
        })
      ],
      'a[href*="/jobs/view/"]': [
        Object.assign(createFixtureElementFromTag(titleLinkTag), {
          innerText: "Senior Product Manager",
          textContent: "Senior Product Manager"
        }),
        createFixtureElementFromTag(applyLinkTag)
      ],
      p: [metaEl]
    }
  });
}

function createFixtureSearchCard() {
  const dismissButton = createElement({
    attributes: {
      "aria-label": "Dismiss Senior Product Manager job"
    }
  });
  const titleText = requireFixtureMatch(
    /<span aria-hidden="true">Senior Product Manager/,
    "expected fixture visible card title span"
  )[0]
    .replace(/<[^>]+>/g, "")
    .trim();
  const companyText = requireFixtureMatch(
    /<p class="[^"]*">Motion Recruitment<\/p>/,
    "expected fixture card company text"
  )[0]
    .replace(/<[^>]+>/g, "")
    .trim();
  const locationText = requireFixtureMatch(
    /<p class="[^"]*">Englewood Cliffs, NJ \(On-site\)<\/p>/,
    "expected fixture card location text"
  )[0]
    .replace(/<[^>]+>/g, "")
    .trim();
  const salaryText = requireFixtureMatch(
    /<p class="[^"]*">\$95\/hr - \$135\/hr<\/p>/,
    "expected fixture card salary text"
  )[0]
    .replace(/<[^>]+>/g, "")
    .trim();
  const postedText = createFixtureTextElementFromMatch(
    /<span class="fd37a291">Posted on March 9, 2026, 11:34 AM<\/span>/,
    "expected fixture posted date span"
  );

  return createElement({
    textContent: "Viewed Easy Apply",
    query: {
      [RESULTS_DISMISS_SELECTOR]: dismissButton
    },
    queryAll: {
      p: [
        createElement({ innerText: titleText }),
        createElement({ innerText: companyText }),
        createElement({ innerText: locationText }),
        createElement({ innerText: salaryText }),
        createElement({ innerText: "Easy Apply" })
      ],
      span: [postedText]
    }
  });
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

test("extractCardData handles the fixture-backed search-results card title markup", () => {
  assert.deepEqual(extractCardData(createFixtureSearchCard()), {
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

test("extractDetailData reads fixture-backed search-results detail metadata from the real detail header structure", () => {
  const detailData = extractDetailData(createFixtureDetailRoot());

  assert.equal(detailData.title, "Senior Product Manager");
  assert.equal(detailData.company, "Motion Recruitment");
  assert.equal(detailData.location, "Englewood Cliffs, NJ");
  assert.equal(detailData.datePosted, "2 weeks ago");
  assert.match(detailData.description, /The ideal candidate will be responsible for managing the roadmap/i);
  assert.match(detailData.aboutCompany, /Motion Recruitment, a Kelly® Company/i);
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
