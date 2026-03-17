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

  for (const card of cards) {
    if (isStopped) break;

    // Extract what we can from the left panel card (no click needed)
    const cardData = extractCardData(card);
    console.log('[LinkedInScraper] Card:', cardData.title, '|', cardData.company);

    // Click card to load job details in right panel
    card.click();

    // Wait for right panel to render — condition-based, not fixed sleep
    const descEl = await waitForElement('[data-testid="expandable-text-box"]', 5000);

    // Job ID comes from the URL after clicking
    const jobId = new URLSearchParams(window.location.search).get('currentJobId') || '';
    if (!jobId) {
      console.warn('[LinkedInScraper] No currentJobId in URL after click, skipping');
      continue;
    }

    // Expand description if truncated
    const moreBtn = document.querySelector('[data-testid="expandable-text-button"]');
    if (moreBtn) {
      moreBtn.click();
      await sleep(300);
    }

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

    const jobData = { ...cardData, jobId, applyUrl, applyType, description };
    console.log('[LinkedInScraper] jobData:', jobData.title, '| id:', jobId, '| apply:', applyType);

    const markdown = formatMarkdown(jobData);
    const filename = `scraped-jobs/${today}/${sanitizeFilename(jobData.company, jobData.title, jobId)}`;

    chrome.runtime.sendMessage({ action: "download", filename, content: markdown });

    scraped++;
    chrome.storage.local.set({ scrapeState: { running: true, scraped: alreadyScraped + scraped, page: pageNum } });
    chrome.runtime.sendMessage({ action: "progress", scraped: alreadyScraped + scraped, total: cards.length, page: pageNum });

    await sleep(500);
  }

  return scraped;
}

function extractCardData(card) {
  // Title: span.d955c530 is the accessible/screen-reader text for titles and dates
  const allD955 = Array.from(card.querySelectorAll('span.d955c530'));

  // First span.d955c530 is the job title (may include "(Verified job)" suffix)
  let title = allD955[0]?.textContent.trim() || '';
  title = title.replace(/\s*\(Verified job\)\s*$/, '').trim();

  // Company and Location: structural siblings of the title <p>
  const titleP = allD955[0]?.closest('p');
  // Company is in the div immediately after the title paragraph (contains a <p>)
  const companyDiv = titleP?.nextElementSibling;
  const company = companyDiv?.querySelector('p')?.textContent.trim() || '';
  // Location is the <p> after the company div
  const location = companyDiv?.nextElementSibling?.textContent.trim() || '';

  // Date: span.d955c530 that starts with "Posted on"
  const dateSpan = allD955.find(s => s.textContent.startsWith('Posted on'));
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

function waitForElement(selector, timeoutMs = 5000) {
  return new Promise(resolve => {
    const el = document.querySelector(selector);
    if (el) { resolve(el); return; }
    const timeout = setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { clearTimeout(timeout); observer.disconnect(); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

} // end of __linkedInScraperLoaded guard
