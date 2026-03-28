(function (root) {
  const RESULTS_LIST_SELECTOR = '[data-testid="lazy-column"][componentkey="SearchResultsMainContent"]';
  const RESULTS_CARD_SELECTOR = 'div[role="button"][componentkey]';
  const RESULTS_DISMISS_SELECTOR = 'button[aria-label^="Dismiss"]';
  const DETAILS_SCREEN_SELECTOR = '[data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails"]';
  const ABOUT_JOB_SECTION_SELECTOR = '[componentkey^="JobDetails_AboutTheJob_"]';
  const ABOUT_COMPANY_SECTION_SELECTOR = '[componentkey^="JobDetails_AboutTheCompany_"]';
  const NEXT_PAGE_SELECTORS = [
    'button[data-testid="pagination-controls-next-button-visible"]',
    'button[aria-label="View next page"]'
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

  function findAll(rootNode, selector) {
    if (!rootNode || typeof rootNode.querySelectorAll !== "function") {
      return [];
    }

    return Array.from(rootNode.querySelectorAll(selector) || []);
  }

  function isDetailRoot(node) {
    return node?.getAttribute?.("data-sdui-screen") === "com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails";
  }

  function findJobListContainer(doc = document) {
    const list = doc?.querySelector?.(RESULTS_LIST_SELECTOR) || null;
    if (!list) {
      return null;
    }

    const hasDismissibleCard = findAll(list, RESULTS_CARD_SELECTOR)
      .some((card) => card?.querySelector?.(RESULTS_DISMISS_SELECTOR));

    return hasDismissibleCard ? list : null;
  }

  function getJobCards(rootNode = document) {
    const container = rootNode?.getAttribute?.("componentkey") === "SearchResultsMainContent"
      ? rootNode
      : findJobListContainer(rootNode);

    if (!container) {
      return [];
    }

    return findAll(container, RESULTS_CARD_SELECTOR)
      .filter((card) => card?.querySelector?.(RESULTS_DISMISS_SELECTOR));
  }

  function extractJobIdFromHref(href) {
    if (!href) {
      return "";
    }

    const match = href.match(/\/jobs\/view\/(\d+)/);
    return match ? match[1] : "";
  }

  function getCardKey(card) {
    if (!card) {
      return null;
    }

    return (
      card.getAttribute?.("componentkey") ||
      extractJobIdFromHref(card.querySelector?.('a[href*="/jobs/view/"]')?.getAttribute?.("href")) ||
      null
    );
  }

  function normalizeDismissTitle(label) {
    return (label || "")
      .replace(/^Dismiss\s+/i, "")
      .replace(/\s+job$/i, "")
      .replace(/\s*\(Verified job\)\s*$/i, "")
      .trim();
  }

  function isSalaryText(text) {
    return /\$\s*[\d,.]+(?:[KkMm])?(?:\s*-\s*\$\s*[\d,.]+(?:[KkMm])?)?\s*\/(?:hr|yr)\b/i.test(text);
  }

  function isApplyText(text) {
    return /\bEasy Apply\b|\bApply on company website\b|\bApply\b/i.test(text);
  }

  function isMetaSeparator(text) {
    return text === "·" || text === "•";
  }

  function extractCardData(card) {
    const dismissLabel = card?.querySelector?.(RESULTS_DISMISS_SELECTOR)?.getAttribute?.("aria-label") || "";
    const dismissTitle = normalizeDismissTitle(dismissLabel);
    const paragraphs = findAll(card, "p")
      .map((p) => getText(p))
      .filter(Boolean)
      .filter((text) => !isMetaSeparator(text));
    const title = paragraphs[0] || dismissTitle;
    const company = paragraphs[1] || "";
    const location = paragraphs.find((text, index) => (
      index > 1 &&
      text !== title &&
      text !== company &&
      !isSalaryText(text) &&
      !isApplyText(text)
    )) || "";
    const postedSpan = findAll(card, "span")
      .map((span) => getText(span))
      .find((text) => /^Posted on\b/i.test(text)) || "";
    const salary = paragraphs.find((text) => isSalaryText(text)) || "Not listed";
    const applyType = paragraphs.find((text) => isApplyText(text)) ||
      (/\bEasy Apply\b/i.test(getText(card)) ? "Easy Apply" : "");

    return {
      title: title || dismissTitle,
      company,
      location,
      datePosted: postedSpan.replace(/^Posted on\s*/i, "").trim(),
      salary,
      applyType
    };
  }

  function findDetailRoot(doc = document) {
    if (isDetailRoot(doc)) {
      return doc;
    }

    return doc?.querySelector?.(DETAILS_SCREEN_SELECTOR) || null;
  }

  function findNextPageButton(doc = document) {
    return findFirst(doc, NEXT_PAGE_SELECTORS);
  }

  function parseTopCardMeta(text) {
    const parts = (text || "")
      .split("·")
      .map((part) => part.trim())
      .filter(Boolean);

    return {
      location: parts[0] || "",
      datePosted: parts[1] || ""
    };
  }

  function getSectionContext(sectionRoot) {
    if (!sectionRoot) {
      return {
        textEl: null,
        expandButtonEl: null,
        missingSection: true
      };
    }

    return {
      textEl: sectionRoot.querySelector?.('[data-testid="expandable-text-box"]') || null,
      expandButtonEl: sectionRoot.querySelector?.('[data-testid="expandable-text-button"]') || null,
      missingSection: false
    };
  }

  function findAboutJobSection(rootNode = document) {
    const detailRoot = findDetailRoot(rootNode) || rootNode;
    return getSectionContext(detailRoot?.querySelector?.(ABOUT_JOB_SECTION_SELECTOR) || null);
  }

  function findAboutCompanySection(rootNode = document) {
    const detailRoot = findDetailRoot(rootNode) || rootNode;
    return getSectionContext(detailRoot?.querySelector?.(ABOUT_COMPANY_SECTION_SELECTOR) || null);
  }

  function extractDetailData(rootNode = document) {
    const detailRoot = findDetailRoot(rootNode);
    if (!detailRoot) {
      return {
        title: "",
        company: "",
        location: "",
        datePosted: "",
        description: "",
        aboutCompany: ""
      };
    }

    const title = getText(findFirst(detailRoot, ["h1"]));
    const company = findAll(detailRoot, 'a[href*="/company/"]')
      .map((link) => getText(link))
      .find(Boolean) || "";
    const metaText = findAll(detailRoot, '[data-testid="job-details-top-card-metadata"]')
      .map((el) => getText(el))
      .find(Boolean) || "";
    const meta = parseTopCardMeta(metaText);
    const aboutJob = findAboutJobSection(detailRoot);
    const aboutCompany = findAboutCompanySection(detailRoot);

    return {
      title,
      company,
      location: meta.location,
      datePosted: meta.datePosted,
      description: getText(aboutJob.textEl),
      aboutCompany: getText(aboutCompany.textEl)
    };
  }

  function decodeLinkedInRedirectUrl(href) {
    if (!href) {
      return "";
    }

    try {
      const url = new URL(href, "https://www.linkedin.com");
      const redirected = url.searchParams.get("url");
      if (redirected) {
        return decodeURIComponent(redirected);
      }

      if (/^https?:\/\//i.test(href) && !/linkedin\.com/i.test(url.hostname)) {
        return href;
      }
    } catch {
      if (/^https?:\/\//i.test(href) && !/linkedin\.com/i.test(href)) {
        return href;
      }
    }

    return "";
  }

  function extractApplyAction(rootNode = document) {
    const detailRoot = findDetailRoot(rootNode) || rootNode;
    const easyApplyButton = detailRoot?.querySelector?.('button[aria-label*="Easy Apply"]') || null;
    if (easyApplyButton) {
      return {
        applyType: "Easy Apply",
        href: "",
        ariaLabel: easyApplyButton.getAttribute?.("aria-label") || "",
        isEasyApply: true
      };
    }

    const externalLink = detailRoot?.querySelector?.('a[aria-label="Apply on company website"]') || null;
    if (externalLink) {
      return {
        applyType: "Apply on company website",
        href: decodeLinkedInRedirectUrl(externalLink.getAttribute?.("href") || ""),
        ariaLabel: externalLink.getAttribute?.("aria-label") || "",
        isEasyApply: false
      };
    }

    return {
      applyType: "",
      href: "",
      ariaLabel: "",
      isEasyApply: false
    };
  }

  function getDetailSnapshot(rootNode = document) {
    const detail = extractDetailData(rootNode);
    return [detail.title, detail.description].filter(Boolean).join("\n").trim();
  }

  const api = {
    extractApplyAction,
    extractCardData,
    extractDetailData,
    findAboutCompanySection,
    findAboutJobSection,
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
