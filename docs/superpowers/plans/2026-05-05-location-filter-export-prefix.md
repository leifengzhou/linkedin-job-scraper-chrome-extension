# Location Filter Export Prefix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the LinkedIn search location filter once per scrape, prefix both export filename modes with a normalized location code, and include the raw filter text as `location_filter` on each exported job.

**Architecture:** Keep the DOM read inside the content-script/job DOM adapter boundary, store the filter text and derived prefix as run-level state, and pass those values into export record/filename helpers. Extend tests around DOM extraction, content-script export flow, and JSON filename generation to cover the new behavior.

**Tech Stack:** Plain JavaScript, Node test runner, Chrome Extension MV3 content script architecture

---

## Chunk 1: DOM Filter Extraction

### Task 1: Add a failing selector test for the search location filter

**Files:**
- Modify: `tests/job-dom-adapters.test.js`
- Test: `tests/job-dom-adapters.test.js`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/job-dom-adapters.test.js`
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/job-dom-adapters.test.js`

### Task 2: Extend the selector contract fixture assertion

**Files:**
- Modify: `tests/search-results-selector-contract.test.js`
- Test: `tests/search-results-selector-contract.test.js`

- [ ] **Step 1: Add contract anchors for the supported location filter selector shape**
- [ ] **Step 2: Run test to verify it passes**
  Run: `node --test tests/search-results-selector-contract.test.js`

## Chunk 2: Export Prefix Plumbing

### Task 3: Add failing JSON export tests for filename prefixes and `location_filter`

**Files:**
- Modify: `tests/json-export.test.js`
- Test: `tests/json-export.test.js`

- [ ] **Step 1: Write failing tests for prefixed per-job filenames**
- [ ] **Step 2: Write failing tests for `location_filter` preservation in exported payloads**
- [ ] **Step 3: Run test to verify failures**
  Run: `node --test tests/json-export.test.js`
- [ ] **Step 4: Write minimal implementation in export helpers**
- [ ] **Step 5: Run test to verify it passes**
  Run: `node --test tests/json-export.test.js`

### Task 4: Add failing content-script tests for aggregate filename prefixing

**Files:**
- Modify: `tests/content-script-detail-flow.test.js`
- Test: `tests/content-script-detail-flow.test.js`

- [ ] **Step 1: Write failing tests for aggregate export filename prefixing**
- [ ] **Step 2: Write failing tests for per-job queue filename prefixing and `location_filter` propagation**
- [ ] **Step 3: Run test to verify failures**
  Run: `node --test tests/content-script-detail-flow.test.js`
- [ ] **Step 4: Write minimal content-script implementation**
- [ ] **Step 5: Run test to verify it passes**
  Run: `node --test tests/content-script-detail-flow.test.js`

## Chunk 3: Verification

### Task 5: Run targeted verification

**Files:**
- Test: `tests/job-dom-adapters.test.js`
- Test: `tests/search-results-selector-contract.test.js`
- Test: `tests/json-export.test.js`
- Test: `tests/content-script-detail-flow.test.js`

- [ ] **Step 1: Run targeted test suite**
  Run: `node --test tests/job-dom-adapters.test.js tests/search-results-selector-contract.test.js tests/json-export.test.js tests/content-script-detail-flow.test.js`
- [ ] **Step 2: Inspect output for failures and fix if needed**

