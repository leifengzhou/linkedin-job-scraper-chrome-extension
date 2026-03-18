(function (root) {
  const SECTION_TEXT_SELECTOR = '[data-testid="expandable-text-box"]';
  const EXPAND_BUTTON_SELECTOR = '[data-testid="expandable-text-button"]';

  function findSectionContext(doc = document, headingText) {
    const normalizedHeading = headingText.trim().toLowerCase();
    const heading = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .find(el => el.textContent.trim().toLowerCase() === normalizedHeading);

    if (!heading) {
      return { textEl: null, expandButtonEl: null, missingSection: true };
    }

    let cursor = heading.parentElement ? heading.parentElement.nextElementSibling : null;
    while (cursor) {
      if (typeof cursor.matches === "function" && cursor.matches("hr")) {
        break;
      }

      const textEl = typeof cursor.matches === "function" && cursor.matches(SECTION_TEXT_SELECTOR)
        ? cursor
        : cursor.querySelector ? cursor.querySelector(SECTION_TEXT_SELECTOR) : null;

      if (textEl) {
        return {
          textEl,
          expandButtonEl: cursor.querySelector ? cursor.querySelector(EXPAND_BUTTON_SELECTOR) : null,
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
    if (!textEl) return "";

    if (typeof textEl.cloneNode === "function") {
      const clone = textEl.cloneNode(true);
      if (clone.querySelectorAll) {
        for (const button of clone.querySelectorAll(EXPAND_BUTTON_SELECTOR)) {
          button.remove();
        }
      }
      return (clone.innerText || clone.textContent || "").trim();
    }

    return (textEl.innerText || textEl.textContent || "").trim();
  }

  async function readSectionText({ textEl, expandButtonEl, sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)) }) {
    if (!textEl) return "";

    if (expandButtonEl) {
      expandButtonEl.click();
      await sleep(300);
    }

    return getCleanSectionText(textEl);
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
