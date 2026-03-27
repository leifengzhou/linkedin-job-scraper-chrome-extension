(function (root) {
  const LEGACY_CONTAINER_SELECTOR = '[data-component-type="LazyColumn"]';
  const SEARCH_CONTAINER_SELECTORS = [
    ".jobs-search-results-list",
    ".jobs-search-results-list__list",
    ".scaffold-layout__list",
    '.jobs-search-results-list, .jobs-search-results-list__list'
  ];
  const LEGACY_CARD_SELECTOR = 'div[role="button"][componentkey]';
  const SEARCH_CARD_SELECTOR = 'div[data-job-id].job-card-container';
  const DETAIL_ROOT_SELECTORS = [
    ".jobs-search__job-details--wrapper",
    ".jobs-search__job-details--container",
    ".jobs-details__main-content",
    "main"
  ];
  const NEXT_PAGE_SELECTORS = [
    'button[data-testid="pagination-controls-next-button-visible"]',
    'button[aria-label="View next page"]',
    ".jobs-search-pagination__button--next"
  ];

  function getText(el) {
    if (!el) {
      return "";
    }

    return (el.innerText || el.textContent || "").trim();
  }

  function findFirst(rootNode, selectors) {
    if (!rootNode || typeof rootNode.querySelector !== "function") {
      return null;
    }

    for (const selector of selectors) {
      const result = rootNode.querySelector(selector);
      if (result) {
        return result;
      }
    }

    return null;
  }

  function findJobListContainer(doc = document) {
    const legacyContainer = doc.querySelector ? doc.querySelector(LEGACY_CONTAINER_SELECTOR) : null;
    if (legacyContainer?.querySelector?.(LEGACY_CARD_SELECTOR)) {
      return legacyContainer;
    }

    const occludableListItem = doc.querySelector ? doc.querySelector('li[data-occludable-job-id]') : null;
    const occludableList = occludableListItem?.closest?.("ul") || null;
    if (occludableList) {
      return occludableList;
    }

    for (const selector of SEARCH_CONTAINER_SELECTORS) {
      const container = doc.querySelector ? doc.querySelector(selector) : null;
      if (container?.querySelector?.(SEARCH_CARD_SELECTOR) || container?.querySelectorAll?.(SEARCH_CARD_SELECTOR)?.length) {
        return container;
      }
    }

    return legacyContainer || null;
  }

  function getJobCards(rootNode = document) {
    const container = typeof rootNode.getAttribute !== "function" && typeof rootNode.querySelector === "function"
      ? findJobListContainer(rootNode)
      : rootNode;

    if (!container?.querySelectorAll) {
      return [];
    }

    const searchCards = Array.from(container.querySelectorAll(SEARCH_CARD_SELECTOR));
    if (searchCards.length > 0) {
      return searchCards;
    }

    const legacyCards = Array.from(container.querySelectorAll(LEGACY_CARD_SELECTOR));
    const dismissibleCards = legacyCards.filter((card) => card.querySelector?.('button[aria-label^="Dismiss"]'));
    return dismissibleCards.length > 0 ? dismissibleCards : legacyCards;
  }

  function getCardKey(card) {
    if (!card) {
      return null;
    }

    return (
      card.getAttribute?.("componentkey") ||
      card.getAttribute?.("data-job-id") ||
      extractJobIdFromHref(card.querySelector?.('a[href*="/jobs/view/"]')?.getAttribute?.("href")) ||
      null
    );
  }

  function extractJobIdFromHref(href) {
    if (!href) {
      return "";
    }

    const match = href.match(/\/jobs\/view\/(\d+)/);
    return match ? match[1] : "";
  }

  function extractCardData(card) {
    const searchTitle = getText(findFirst(card, [".job-card-list__title--link", '.job-card-container__link']));
    const searchCompany = getText(findFirst(card, [
      ".artdeco-entity-lockup__subtitle span",
      ".artdeco-entity-lockup__subtitle",
      ".job-card-container__company-name"
    ]));
    const searchLocation = getText(findFirst(card, [
      ".job-card-container__metadata-wrapper li span",
      ".job-card-container__metadata-item",
      ".artdeco-entity-lockup__caption li span",
      ".artdeco-entity-lockup__caption"
    ]));
    if (searchTitle || searchCompany || searchLocation || card?.getAttribute?.("data-job-id")) {
      return {
        title: searchTitle,
        company: searchCompany,
        location: searchLocation,
        datePosted: "",
        salary: "Not listed",
        applyType: /\bEasy Apply\b/i.test(getText(card)) ? "Easy Apply" : "Apply"
      };
    }

    const dismissBtn = card?.querySelector?.('button[aria-label^="Dismiss"]');
    let title = dismissBtn
      ? (dismissBtn.getAttribute("aria-label") || "").replace(/^Dismiss\s+/, "").replace(/\s+job$/, "").trim()
      : "";
    title = title.replace(/\s*\(Verified job\)\s*$/, "").trim();

    const titleP = title
      ? Array.from(card?.querySelectorAll?.("p") || []).find((p) => (p.textContent || "").includes(title))
      : null;
    const companyDiv = titleP?.nextElementSibling || null;
    const company = getText(companyDiv?.querySelector?.("p"));
    const location = getText(companyDiv?.nextElementSibling);
    const dateSpan = Array.from(card?.querySelectorAll?.("span") || [])
      .find((span) => getText(span).startsWith("Posted on"));
    const datePosted = getText(dateSpan).replace(/^Posted on\s*/, "").trim();
    const salaryP = Array.from(card?.querySelectorAll?.("p") || [])
      .find((p) => /\$[\d,.]+[KM]?\/yr/.test(getText(p)));
    const salary = getText(salaryP) || "Not listed";
    const applyType = /\bEasy Apply\b/i.test(getText(card)) ? "Easy Apply" : "Apply";

    return { title, company, location, datePosted, salary, applyType };
  }

  function findDetailRoot(doc = document) {
    return findFirst(doc, DETAIL_ROOT_SELECTORS) || doc;
  }

  function findNextPageButton(doc = document) {
    return findFirst(doc, NEXT_PAGE_SELECTORS);
  }

  function parseTopCardMeta(text) {
    const parts = text
      .split("·")
      .map((part) => part.trim())
      .filter(Boolean);

    return {
      location: parts[0] || "",
      datePosted: parts[1] || ""
    };
  }

  function extractDetailData(rootNode = document) {
    const detailRoot = findDetailRoot(rootNode);
    const title = getText(findFirst(detailRoot, [
      ".job-details-jobs-unified-top-card__job-title",
      "h1 a[href*=\"/jobs/view/\"]",
      "h1"
    ]));
    const company = getText(findFirst(detailRoot, [
      ".job-details-jobs-unified-top-card__company-name",
      "a[href*=\"/company/\"]"
    ]));
    const metaText = getText(findFirst(detailRoot, [
      ".job-details-jobs-unified-top-card__tertiary-description-container",
      ".jobs-unified-top-card__primary-description",
      ".jobs-details-top-card__primary-description"
    ]));
    const meta = parseTopCardMeta(metaText);
    const description = getText(findFirst(detailRoot, [
      "#job-details",
      '[data-testid="expandable-text-box"]'
    ]));
    const aboutCompany = getText(findFirst(detailRoot, [
      ".jobs-company__company-description",
      ".jobs-company__company-description .inline-show-more-text",
      '.jobs-company [data-testid="expandable-text-box"]'
    ]));

    return {
      title,
      company,
      location: meta.location,
      datePosted: meta.datePosted,
      description,
      aboutCompany
    };
  }

  function getDetailSnapshot(rootNode = document) {
    const detail = extractDetailData(rootNode);
    return [detail.title, detail.description].filter(Boolean).join("\n").trim();
  }

  const api = {
    extractCardData,
    extractDetailData,
    findDetailRoot,
    findJobListContainer,
    findNextPageButton,
    getCardKey,
    getDetailSnapshot,
    getJobCards
  };

  root.LinkedInScraperJobDomAdapters = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
