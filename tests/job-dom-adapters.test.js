const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findJobListContainer,
  findNextPageButton,
  getJobCards,
  getCardKey,
  extractCardData,
  getDetailSnapshot,
  extractDetailData
} = require("../job_dom_adapters.js");

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

test("getJobCards returns legacy role-button cards from the lazy column", () => {
  const cardA = createElement({ attributes: { componentkey: "legacy-a" } });
  const cardB = createElement({ attributes: { componentkey: "legacy-b" } });
  const container = createElement({
    queryAll: {
      'div[role="button"][componentkey]': [cardA, cardB]
    }
  });
  const doc = {
    querySelector(selector) {
      if (selector === '[data-component-type="LazyColumn"]') {
        return container;
      }
      return null;
    }
  };

  assert.equal(findJobListContainer(doc), container);
  assert.deepEqual(getJobCards(doc), [cardA, cardB]);
});

test("getJobCards returns search layout cards keyed by data-job-id", () => {
  const cardA = createElement({ attributes: { "data-job-id": "4391768706" } });
  const cardB = createElement({ attributes: { "data-job-id": "4391768707" } });
  const searchList = createElement({
    queryAll: {
      'div[data-job-id].job-card-container': [cardA, cardB]
    }
  });
  const doc = {
    querySelector(selector) {
      if (selector === '[data-component-type="LazyColumn"]') {
        return null;
      }
      if (selector === '.jobs-search-results-list, .jobs-search-results-list__list') {
        return searchList;
      }
      return null;
    }
  };

  assert.equal(findJobListContainer(doc), searchList);
  assert.deepEqual(getJobCards(doc), [cardA, cardB]);
  assert.equal(getCardKey(cardA), "4391768706");
});

test("findJobListContainer prefers the occludable search results list wrapper", () => {
  const listEl = createElement();
  const listItem = createElement({
    attributes: { "data-occludable-job-id": "4391768706" }
  });
  listItem.closest = (selector) => selector === "ul" ? listEl : null;

  const doc = {
    querySelector(selector) {
      if (selector === '[data-component-type="LazyColumn"]') {
        return null;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  doc.querySelector = (selector) => {
    if (selector === 'li[data-occludable-job-id]') {
      return listItem;
    }
    if (selector === '[data-component-type="LazyColumn"]') {
      return null;
    }
    return null;
  };

  assert.equal(findJobListContainer(doc), listEl);
});

test("findNextPageButton supports the jobs-search pagination next button", () => {
  const nextButton = createElement();
  const doc = {
    querySelector(selector) {
      if (
        selector === 'button[aria-label="View next page"]' ||
        selector === ".jobs-search-pagination__button--next" ||
        selector === 'button[data-testid="pagination-controls-next-button-visible"]'
      ) {
        return nextButton;
      }
      return null;
    }
  };

  assert.equal(findNextPageButton(doc), nextButton);
});

test("extractCardData reads search layout title company location and easy apply badge", () => {
  const titleLink = createElement({ textContent: "Sales Executive" });
  const companySpan = createElement({ textContent: "Workspot, Inc" });
  const locationSpan = createElement({ textContent: "United States (Remote)" });
  const card = createElement({
    textContent: "Viewed Promoted Easy Apply",
    attributes: { "data-job-id": "4391768706" },
    query: {
      ".job-card-list__title--link": titleLink,
      ".artdeco-entity-lockup__subtitle span": companySpan,
      ".job-card-container__metadata-wrapper li span": locationSpan
    }
  });

  assert.deepEqual(extractCardData(card), {
    title: "Sales Executive",
    company: "Workspot, Inc",
    location: "United States (Remote)",
    datePosted: "",
    salary: "Not listed",
    applyType: "Easy Apply"
  });
});

test("extractDetailData reads the new search-layout top card metadata and description", () => {
  const titleHeading = createElement({ textContent: "Sales Executive" });
  const companyLink = createElement({ textContent: "Workspot, Inc" });
  const meta = createElement({
    innerText: "United States · 40 minutes ago · 3 applicants"
  });
  const description = createElement({
    innerText: "About the job\nWe are hiring an Enterprise AI Sales Executive."
  });
  const aboutCompany = createElement({
    innerText: "The Workspot Enterprise VDI Platform is engineered for simplicity."
  });
  const detailRoot = createElement({
    query: {
      ".job-details-jobs-unified-top-card__job-title": titleHeading,
      ".job-details-jobs-unified-top-card__company-name": companyLink,
      ".job-details-jobs-unified-top-card__tertiary-description-container": meta,
      "#job-details": description,
      ".jobs-company__company-description": aboutCompany
    }
  });

  assert.deepEqual(extractDetailData(detailRoot), {
    title: "Sales Executive",
    company: "Workspot, Inc",
    location: "United States",
    datePosted: "40 minutes ago",
    description: "About the job\nWe are hiring an Enterprise AI Sales Executive.",
    aboutCompany: "The Workspot Enterprise VDI Platform is engineered for simplicity."
  });
});

test("getDetailSnapshot falls back across both description containers", () => {
  const detailRoot = createElement({
    query: {
      ".job-details-jobs-unified-top-card__job-title": createElement({ innerText: "Sales Executive" }),
      "#job-details": createElement({ innerText: "About the job\nWe are hiring." })
    }
  });

  assert.equal(
    getDetailSnapshot(detailRoot),
    "Sales Executive\nAbout the job\nWe are hiring."
  );
});
