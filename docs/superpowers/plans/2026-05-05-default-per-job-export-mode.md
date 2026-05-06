# Default Per-Job Export Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `json-per-job` the default download format for new scrape sessions and keep UI/test assumptions aligned.

**Architecture:** Change the source-of-truth default in the scrape session module, then update any hardcoded fallback values in UI/test scaffolding that still assume `single-json`. Verify with the targeted session, control, and content-script tests.

**Tech Stack:** Plain JavaScript, Node test runner, Chrome Extension MV3 content script architecture

---

## Chunk 1: Default Mode Flip

### Task 1: Update tests to expect `json-per-job` by default

**Files:**
- Modify: `tests/scrape-session.test.js`
- Modify: `tests/in-page-controls.test.js`
- Modify: `tests/content-script-detail-flow.test.js`

- [ ] **Step 1: Write the failing test expectations**
- [ ] **Step 2: Run targeted tests to verify failure**
  Run: `node --test tests/scrape-session.test.js tests/in-page-controls.test.js tests/content-script-detail-flow.test.js`
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run targeted tests to verify pass**
  Run: `node --test tests/scrape-session.test.js tests/in-page-controls.test.js tests/content-script-detail-flow.test.js`

