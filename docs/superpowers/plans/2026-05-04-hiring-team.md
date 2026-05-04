# Hiring Team Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `hiringTeam` extraction and export support for the LinkedIn job details pane.

**Architecture:** Extend the existing DOM adapter so the right-pane detail extractor returns a `hiringTeam` array, then thread that field through the content-script export normalization path. Keep the schema stable by always exporting an array, even when the section is missing.

**Tech Stack:** Plain JavaScript, Node test runner, Manifest V3 Chrome extension

---

### Task 1: Lock the expected schema in tests

**Files:**
- Modify: `tests/job-dom-adapters.test.js`
- Modify: `tests/content-script-detail-flow.test.js`
- Modify: `tests/json-export.test.js`

- [ ] **Step 1: Write failing adapter tests**
- [ ] **Step 2: Run targeted tests and confirm they fail for missing `hiringTeam` support**
- [ ] **Step 3: Write failing content-script/export tests**
- [ ] **Step 4: Run targeted tests and confirm they fail for missing threading/export support**

### Task 2: Implement hiring-team extraction and export wiring

**Files:**
- Modify: `job_dom_adapters.js`
- Modify: `content_script.js`

- [ ] **Step 1: Add detail-pane hiring-team extraction with `[]` fallback**
- [ ] **Step 2: Thread `hiringTeam` through `collectCurrentJobData()` and export normalization**
- [ ] **Step 3: Re-run targeted tests and make them pass**

### Task 3: Update docs and run final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the new `hiringTeam` field and empty-array behavior**
- [ ] **Step 2: Run the relevant test suite**
- [ ] **Step 3: Review diff for accidental unrelated changes**
