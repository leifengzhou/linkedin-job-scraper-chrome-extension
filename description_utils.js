(function (root) {
  const SECTION_TEXT_SELECTOR = '[data-testid="expandable-text-box"]';
  const EXPAND_BUTTON_SELECTOR = '[data-testid="expandable-text-button"]';

  function matchesAnySelector(el, selectors) {
    if (!el || typeof el.matches !== "function") {
      return false;
    }

    return selectors.some((selector) => el.matches(selector));
  }

  function queryFirst(el, selectors) {
    if (!el || typeof el.querySelector !== "function") {
      return null;
    }

    for (const selector of selectors) {
      const result = el.querySelector(selector);
      if (result) {
        return result;
      }
    }

    return null;
  }

  function findSectionContext(doc = document, headingText, options = {}) {
    const textSelectors = options.textSelectors || [SECTION_TEXT_SELECTOR];
    const expandButtonSelectors = options.expandButtonSelectors || [EXPAND_BUTTON_SELECTOR];
    const normalizedHeading = headingText.trim().toLowerCase();
    const heading = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .find(el => el.textContent.trim().toLowerCase() === normalizedHeading);

    if (!heading) {
      return { textEl: null, expandButtonEl: null, missingSection: true };
    }

    const headingContainer = heading.closest ? heading.closest("section, article, div") : heading.parentElement;
    if (matchesAnySelector(headingContainer, textSelectors)) {
      return {
        textEl: headingContainer,
        expandButtonEl: queryFirst(headingContainer, expandButtonSelectors),
        missingSection: false
      };
    }

    const nestedTextEl = queryFirst(headingContainer, textSelectors);
    if (nestedTextEl) {
      return {
        textEl: nestedTextEl,
        expandButtonEl: queryFirst(headingContainer, expandButtonSelectors),
        missingSection: false
      };
    }

    let cursor = heading.parentElement ? heading.parentElement.nextElementSibling : null;
    while (cursor) {
      if (typeof cursor.matches === "function" && cursor.matches("hr")) {
        break;
      }

      const textEl = typeof cursor.matches === "function" && matchesAnySelector(cursor, textSelectors)
        ? cursor
        : queryFirst(cursor, textSelectors);

      if (textEl) {
        return {
          textEl,
          expandButtonEl: queryFirst(cursor, expandButtonSelectors),
          missingSection: false
        };
      }

      cursor = cursor.nextElementSibling || null;
    }

    return { textEl: null, expandButtonEl: null, missingSection: true };
  }

  function formatAboutCompanySection(aboutCompany, { missingAboutCompany = false } = {}) {
    if (aboutCompany) {
      return aboutCompany;
    }

    if (missingAboutCompany) {
      return 'Note: LinkedIn "About the company" section was not found.';
    }

    return "";
  }

  function getCleanSectionText(textEl) {
    return getCleanSectionTextWithOptions(textEl, [EXPAND_BUTTON_SELECTOR]);
  }

  function getCleanSectionTextWithOptions(textEl, expandButtonSelectors) {
    if (!textEl) return "";

    if (typeof textEl.cloneNode === "function") {
      const clone = textEl.cloneNode(true);
      if (clone.querySelectorAll) {
        for (const selector of expandButtonSelectors) {
          for (const button of clone.querySelectorAll(selector)) {
            button.remove();
          }
        }
      }
      return (clone.innerText || clone.textContent || "").trim();
    }

    return (textEl.innerText || textEl.textContent || "").trim();
  }

  async function readSectionText({
    textEl,
    expandButtonEl,
    expandButtonSelectors = [EXPAND_BUTTON_SELECTOR],
    sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
  }) {
    if (!textEl) return "";

    if (expandButtonEl) {
      expandButtonEl.click();
      await sleep(300);
    }

    return getCleanSectionTextWithOptions(textEl, expandButtonSelectors);
  }

  const api = {
    findSectionContext,
    formatAboutCompanySection,
    readSectionText
  };

  root.LinkedInScraperDescriptionUtils = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
