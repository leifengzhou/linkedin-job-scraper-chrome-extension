(function (root) {
  const RESULTS_LIST_SELECTOR = '[data-testid="lazy-column"][componentkey="SearchResultsMainContent"]';
  const RESULTS_CARD_SELECTOR = 'div[role="button"][componentkey]';
  const RESULTS_DISMISS_SELECTOR = 'button[aria-label^="Dismiss"]';
  const DETAILS_SCREEN_SELECTOR = '[data-sdui-screen="com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails"]';
  const ABOUT_JOB_SECTION_SELECTOR = '[componentkey^="JobDetails_AboutTheJob_"]';
  const ABOUT_COMPANY_SECTION_SELECTOR = '[componentkey^="JobDetails_AboutTheCompany_"]';
  const HIRING_TEAM_HEADING_SELECTOR = "h1, h2, h3, p, span, div";
  const HIRING_TEAM_PROFILE_SELECTOR = 'a[href*="/in/"]';
  const LOCATION_FILTER_ICON_SELECTOR = "svg#location-marker-small";
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

    const stableJobId = (
      card.getAttribute?.("data-job-id") ||
      card.getAttribute?.("job-id") ||
      card.getAttribute?.("data-occludable-job-id") ||
      extractJobIdFromHref(card.querySelector?.('a[href*="/jobs/view/"]')?.getAttribute?.("href"))
    );

    return (
      stableJobId ||
      card.getAttribute?.("componentkey") ||
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

  function normalizeCardTitle(text) {
    const cleaned = (text || "")
      .replace(/\s*\(Verified job\)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) {
      return "";
    }

    const words = cleaned.split(" ");
    if (words.length % 2 === 0) {
      const midpoint = words.length / 2;
      const firstHalf = words.slice(0, midpoint).join(" ");
      const secondHalf = words.slice(midpoint).join(" ");
      if (firstHalf && firstHalf === secondHalf) {
        return firstHalf;
      }
    }

    return cleaned;
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
    const title = dismissTitle || normalizeCardTitle(paragraphs[0]);
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

  function findDetailTitle(detailRoot) {
    const jobLinks = findAll(detailRoot, 'a[href*="/jobs/view/"]');
    const titleLink = jobLinks.find((link) => {
      const href = link?.getAttribute?.("href") || "";
      const text = getText(link);
      return /\/jobs\/view\/\d+\/?(?:\?|$)/.test(href) && text && !/\bEasy Apply\b/i.test(text);
    });

    return getText(titleLink) || getText(findFirst(detailRoot, ["h1"]));
  }

  function findDetailMetaText(detailRoot) {
    const explicitMeta = findAll(detailRoot, '[data-testid="job-details-top-card-metadata"]')
      .map((el) => getText(el))
      .find(Boolean);
    if (explicitMeta) {
      return explicitMeta;
    }

    return findAll(detailRoot, "p")
      .map((el) => getText(el))
      .find((text) => /·/.test(text) && /\bago\b/i.test(text)) || "";
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

  function extractSearchLocationFilter(rootNode = document) {
    const iconEl = rootNode?.querySelector?.(LOCATION_FILTER_ICON_SELECTOR) || null;
    let current = iconEl?.parentElement || null;

    while (current) {
      const locationText = findAll(current, "p")
        .map((el) => getText(el))
        .find(Boolean);

      if (locationText) {
        return locationText;
      }

      current = current.parentElement || null;
    }

    return "";
  }

  function isHiringTeamHeading(text) {
    return String(text || "").trim().toLowerCase() === "meet the hiring team";
  }

  function findHiringTeamSection(rootNode = document) {
    const detailRoot = findDetailRoot(rootNode) || rootNode;
    const headingEl = findAll(detailRoot, HIRING_TEAM_HEADING_SELECTOR)
      .find((el) => isHiringTeamHeading(getText(el)));

    if (!headingEl) {
      return null;
    }

    let current = headingEl;

    while (current) {
      if (findAll(current, HIRING_TEAM_PROFILE_SELECTOR).length > 0) {
        return current;
      }

      if (current === detailRoot) {
        break;
      }

      current = current.parentElement || null;
    }

    return null;
  }

  function normalizeLinkedInProfileUrl(href) {
    if (!href) {
      return "";
    }

    try {
      const url = new URL(href, "https://www.linkedin.com");
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {
      return href;
    }
  }

  function findHighestMatchingProfileAnchor(link, sectionRoot) {
    let current = link;
    let highest = null;

    while (current) {
      const href = current.getAttribute?.("href") || "";
      if (/\/in\//i.test(href)) {
        highest = current;
      }

      if (current === sectionRoot) {
        break;
      }

      current = current.parentElement || null;
    }

    return highest || link;
  }

  function isHiringTeamMetaLine(text) {
    return /^[•·]?\s*\d+(?:st|nd|rd|th)$/i.test(text) ||
      /^job poster$/i.test(text) ||
      /^message$/i.test(text);
  }

  function extractHiringTeamTitle(memberRoot, name) {
    const lines = getText(memberRoot)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    return lines.find((line) => line !== name && !isHiringTeamMetaLine(line)) || "";
  }

  function extractHiringTeamMembers(rootNode = document) {
    const sectionRoot = findHiringTeamSection(rootNode);
    if (!sectionRoot) {
      return [];
    }

    const memberRoots = [];
    const seenRoots = new Set();

    for (const link of findAll(sectionRoot, HIRING_TEAM_PROFILE_SELECTOR)) {
      const memberRoot = findHighestMatchingProfileAnchor(link, sectionRoot);
      if (seenRoots.has(memberRoot)) {
        continue;
      }

      seenRoots.add(memberRoot);
      memberRoots.push(memberRoot);
    }

    return memberRoots
      .map((memberRoot) => {
        const nestedProfileLinks = findAll(memberRoot, HIRING_TEAM_PROFILE_SELECTOR);
        const nameLink = nestedProfileLinks
          .find((candidate) => getText(candidate) && candidate !== memberRoot) || memberRoot;
        const name = getText(nameLink);
        const linkedinUrl = normalizeLinkedInProfileUrl(
          nameLink.getAttribute?.("href") || memberRoot.getAttribute?.("href") || ""
        );
        const title = extractHiringTeamTitle(memberRoot, name);

        if (!name || !linkedinUrl) {
          return null;
        }

        return {
          name,
          linkedinUrl,
          title
        };
      })
      .filter(Boolean);
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
        aboutCompany: "",
        hiringTeam: []
      };
    }

    const title = findDetailTitle(detailRoot);
    const company = findAll(detailRoot, 'a[href*="/company/"]')
      .map((link) => getText(link))
      .find(Boolean) || "";
    const metaText = findDetailMetaText(detailRoot);
    const meta = parseTopCardMeta(metaText);
    const aboutJob = findAboutJobSection(detailRoot);
    const aboutCompany = findAboutCompanySection(detailRoot);
    const hiringTeam = extractHiringTeamMembers(detailRoot);

    return {
      title,
      company,
      location: meta.location,
      datePosted: meta.datePosted,
      description: getText(aboutJob.textEl),
      aboutCompany: getText(aboutCompany.textEl),
      hiringTeam
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

  function findEasyApplyAction(detailRoot) {
    const easyApplyLink = detailRoot?.querySelector?.('a[aria-label*="Easy Apply"]') || null;
    if (easyApplyLink) {
      return easyApplyLink;
    }

    return detailRoot?.querySelector?.('button[aria-label*="Easy Apply"]') || null;
  }

  function findCompanyWebsiteApplyLink(detailRoot) {
    return findAll(detailRoot, "a")
      .find((link) => {
        const ariaLabel = link?.getAttribute?.("aria-label") || "";
        return /apply/i.test(ariaLabel) && /website/i.test(ariaLabel);
      }) || null;
  }

  function extractApplyAction(rootNode = document) {
    const detailRoot = findDetailRoot(rootNode) || rootNode;
    const easyApplyAction = findEasyApplyAction(detailRoot);
    if (easyApplyAction) {
      return {
        applyType: "Easy Apply",
        href: "",
        ariaLabel: easyApplyAction.getAttribute?.("aria-label") || "",
        isEasyApply: true
      };
    }

    const externalLink = findCompanyWebsiteApplyLink(detailRoot);
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
    extractSearchLocationFilter,
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
