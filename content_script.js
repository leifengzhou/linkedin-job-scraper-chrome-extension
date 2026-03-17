// Idempotency guard — safe to re-inject via chrome.scripting.executeScript
if (window.__linkedInScraperLoaded) {
  console.log('[LinkedInScraper] Already loaded, skipping re-init');
} else {
window.__linkedInScraperLoaded = true;

let isStopped = false;
let isRunning = false;

console.log('[LinkedInScraper] Content script loaded on', location.href);

chrome.runtime.onMessage.addListener((msg) => {
  console.log('[LinkedInScraper] Message received:', msg.action);
  if (msg.action === "start") {
    if (isRunning) { console.log('[LinkedInScraper] Already running, ignoring start'); return; }
    isStopped = false;
    scrapeAllPages();
  } else if (msg.action === "stop") {
    isStopped = true;
  }
});

window.addEventListener("pagehide", () => { isStopped = true; });

async function scrapeAllPages() {
  isRunning = true;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let pageNum = 1;
  let totalScraped = 0;

  while (!isStopped) {
    // Left panel is [data-component-type="LazyColumn"]
    const leftPanel = document.querySelector('[data-component-type="LazyColumn"]');
    if (!leftPanel) {
      console.error('[LinkedInScraper] Left panel not found');
      chrome.runtime.sendMessage({ action: "progress", scraped: totalScraped, page: pageNum, error: "Job list panel not found on this page" });
      break;
    }

    // Job cards: div[role="button"] elements that contain a "Dismiss X job" button
    const allRoleBtns = Array.from(leftPanel.querySelectorAll('div[role="button"][componentkey]'));
    const cards = allRoleBtns.filter(el => el.querySelector('button[aria-label^="Dismiss"]'));

    console.log('[LinkedInScraper] Found', cards.length, 'cards on page', pageNum);

    if (cards.length === 0) {
      chrome.runtime.sendMessage({ action: "progress", scraped: totalScraped, page: pageNum, error: "No job listings found on this page" });
      break;
    }

    const scraped = await scrapeCurrentPage(cards, today, pageNum, totalScraped);
    totalScraped += scraped;

    if (isStopped) break;

    // Pagination — stable data-testid attribute
    const nextBtn = document.querySelector('button[data-testid="pagination-controls-next-button-visible"]');
    if (!nextBtn || nextBtn.disabled) break;

    nextBtn.click();
    await waitForNewCards(leftPanel);
    pageNum++;
  }

  isRunning = false;
  const folder = `scraped-jobs/${today}`;
  chrome.storage.local.remove('scrapeState');
  chrome.runtime.sendMessage({ action: "done", total: totalScraped, folder });
}

async function scrapeCurrentPage(cards, today, pageNum, alreadyScraped) {
  let scraped = 0;

  for (const [cardIndex, card] of cards.entries()) {
    if (isStopped) break;

    const cardData = extractCardData(card);
    console.log(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] Card: "${cardData.title}" @ ${cardData.company}`);

    // Snapshot state BEFORE click
    const prevJobId = new URLSearchParams(window.location.search).get('currentJobId') || '';
    const prevDescText = document.querySelector('[data-testid="expandable-text-box"]')?.innerText || '';

    card.click();

    // 1. Wait for URL to update (proves LinkedIn registered the click)
    const newJobId = await waitForJobIdChange(prevJobId, 3000);
    if (newJobId) {
      // 2. URL changed — wait for description content to actually swap
      await waitForDescriptionChange(prevDescText, 5000);
      console.log(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] URL: ${prevJobId} → ${newJobId}`);
    } else {
      // First card or already selected — ensure description panel is loaded
      await waitForDescriptionChange('', 3000);
      console.log(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] URL unchanged (job may already be selected)`);
    }

    const jobId = new URLSearchParams(window.location.search).get('currentJobId') || '';
    if (!jobId) {
      console.warn(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] No currentJobId — skipping`);
      continue;
    }

    // Expand description if truncated
    const moreBtn = document.querySelector('[data-testid="expandable-text-button"]');
    if (moreBtn) {
      moreBtn.click();
      await sleep(300);
    }

    // Always re-query after expand (element may be replaced by LinkedIn)
    const descEl = document.querySelector('[data-testid="expandable-text-box"]');
    const description = descEl ? descEl.innerText.trim() : '(Description not available)';

    // Get apply URL from right panel
    let applyUrl = `https://www.linkedin.com/jobs/view/${jobId}/`;
    let applyType = cardData.applyType;

    if (applyType !== 'Easy Apply') {
      const externalBtn = document.querySelector('a[aria-label="Apply on company website"]');
      if (externalBtn) {
        applyType = 'Apply on company website';
        const rawHref = externalBtn.getAttribute('href') || '';
        try {
          const urlObj = new URL(rawHref, 'https://www.linkedin.com');
          const redirectUrl = urlObj.searchParams.get('url');
          if (redirectUrl) {
            const decoded = decodeURIComponent(redirectUrl);
            applyUrl = /^https?:\/\//i.test(decoded) ? decoded : rawHref;
          } else {
            applyUrl = rawHref;
          }
        } catch {
          applyUrl = rawHref;
        }
      }
    }

    // Mismatch warning: if card company doesn't appear in first 200 chars of description
    const descSnippet = description.slice(0, 80);
    if (cardData.company && !description.slice(0, 200).toLowerCase().includes(cardData.company.toLowerCase())) {
      console.warn(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] ⚠ Company "${cardData.company}" not in description start — possible stale panel`);
    }
    console.log(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] Desc: "${descSnippet}..."`);

    const jobData = { ...cardData, jobId, applyUrl, applyType, description };
    const markdown = formatMarkdown(jobData);
    const filename = `scraped-jobs/${today}/${sanitizeFilename(jobData.company, jobData.title, jobId)}`;

    console.log(`[LinkedInScraper] [${cardIndex + 1}/${cards.length}] Saving: ${filename}`);
    chrome.runtime.sendMessage({ action: "download", filename, content: markdown });

    scraped++;
    chrome.storage.local.set({ scrapeState: { running: true, scraped: alreadyScraped + scraped, page: pageNum } });
    chrome.runtime.sendMessage({ action: "progress", scraped: alreadyScraped + scraped, total: cards.length, page: pageNum });

    await sleep(500);
  }

  return scraped;
}

function extractCardData(card) {
  // Title: dismiss button aria-label is stable ("Dismiss {title} job")
  const dismissBtn = card.querySelector('button[aria-label^="Dismiss"]');
  let title = dismissBtn
    ? dismissBtn.getAttribute('aria-label').replace(/^Dismiss\s+/, '').replace(/\s+job$/, '').trim()
    : '';
  title = title.replace(/\s*\(Verified job\)\s*$/, '').trim();

  // Company and Location: structural siblings of the title <p>
  // Title <p> is identified as the first <p> in the card that contains child spans
  const titleP = Array.from(card.querySelectorAll('p')).find(p => p.querySelector('span'));
  // Company is in the div immediately after the title paragraph (contains a <p>)
  const companyDiv = titleP?.nextElementSibling;
  const company = companyDiv?.querySelector('p')?.textContent.trim() || '';
  // Location is the <p> after the company div
  const location = companyDiv?.nextElementSibling?.textContent.trim() || '';

  // Date: first span anywhere in the card whose text starts with "Posted on"
  const dateSpan = Array.from(card.querySelectorAll('span')).find(s => s.textContent.trim().startsWith('Posted on'));
  const datePosted = dateSpan?.textContent.replace(/^Posted on\s*/, '').trim() || '';

  // Salary: <p> matching a salary pattern (may not be present)
  const allPs = card.querySelectorAll('p');
  const salaryP = Array.from(allPs).find(p => /\$[\d,.]+[KM]?\/yr/.test(p.textContent));
  const salary = salaryP?.textContent.trim() || 'Not listed';

  // Apply type: Easy Apply is shown as text in the card
  const applyType = card.textContent.includes('Easy Apply') ? 'Easy Apply' : 'Apply';

  return { title, company, location, datePosted, salary, applyType };
}

function waitForNewCards(leftPanel) {
  return new Promise(resolve => {
    // Snapshot the componentkey of the first card to detect page change
    const firstCard = leftPanel.querySelector('div[role="button"][componentkey]');
    const firstKey = firstCard?.getAttribute('componentkey') || null;

    const timeout = setTimeout(() => { observer.disconnect(); resolve(); }, 5000);
    const observer = new MutationObserver(() => {
      const newFirst = leftPanel.querySelector('div[role="button"][componentkey]');
      const newKey = newFirst?.getAttribute('componentkey');
      if (newFirst && newKey !== firstKey) {
        clearTimeout(timeout);
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(leftPanel, { childList: true, subtree: true });
  });
}

function sanitizeFilename(company, title, jobId) {
  const clean = s => (s || 'Unknown').replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const base = `${clean(company)}_${clean(title)}`.slice(0, 80);
  return `${base}_${jobId}.md`;
}

function formatMarkdown({ title, company, location, salary, datePosted, applyType, applyUrl, jobId, description }) {
  return `# ${title}
**Company:** ${company}
**Location:** ${location}
**Salary:** ${salary}
**Date Posted:** ${datePosted}
**Apply:** [${applyType}](${applyUrl})
**Job ID:** ${jobId}

---

## About the Job

${description}
`;
}

function waitForJobIdChange(prevJobId, timeoutMs = 5000) {
  return new Promise(resolve => {
    const check = () => new URLSearchParams(window.location.search).get('currentJobId');
    const id = check();
    if (id && id !== prevJobId) { resolve(id); return; }
    const interval = setInterval(() => {
      const id = check();
      if (id && id !== prevJobId) { clearInterval(interval); clearTimeout(timeout); resolve(id); }
    }, 100);
    const timeout = setTimeout(() => { clearInterval(interval); resolve(null); }, timeoutMs);
  });
}

// Note: if two consecutive jobs have identical description text, this will time out
// (harmless — the URL change already confirmed LinkedIn loaded the new job).
function waitForDescriptionChange(prevText, timeoutMs = 5000) {
  const selector = '[data-testid="expandable-text-box"]';
  return new Promise(resolve => {
    const check = () => {
      const el = document.querySelector(selector);
      if (!el) return null;
      return el.innerText !== prevText ? el : null;
    };
    const result = check();
    if (result) { resolve(result); return; }
    const timeout = setTimeout(() => { observer.disconnect(); resolve(document.querySelector(selector)); }, timeoutMs);
    const observer = new MutationObserver(() => {
      const result = check();
      if (result) { clearTimeout(timeout); observer.disconnect(); resolve(result); }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

} // end of __linkedInScraperLoaded guard
