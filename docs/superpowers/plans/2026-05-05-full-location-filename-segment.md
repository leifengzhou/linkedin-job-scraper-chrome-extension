# Full Location Filename Segment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old state-code filename prefix logic with a filename-safe version of the full LinkedIn location filter text and move that segment to `{company}_{position}_{full-location}_{id}` for per-job exports.

**Architecture:** Keep reading the raw DOM filter text once per scrape, but normalize it into a reusable filename segment by collapsing comma-space and whitespace runs into single dashes. Thread that segment through aggregate and per-job export helpers while preserving the raw `location_filter` field in job payloads.

**Tech Stack:** Plain JavaScript, Node test runner, Chrome Extension MV3 content script architecture

---

## Chunk 1: Filename Contract Update

### Task 1: Rewrite tests around the new full-location naming scheme

**Files:**
- Modify: `tests/json-export.test.js`
- Modify: `tests/content-script-detail-flow.test.js`

- [ ] **Step 1: Write failing expectations for full-location filename segments**
- [ ] **Step 2: Run targeted tests to verify failure**
  Run: `node --test tests/json-export.test.js tests/content-script-detail-flow.test.js`
- [ ] **Step 3: Write minimal implementation in export helpers and content-script plumbing**
- [ ] **Step 4: Run targeted tests to verify pass**
  Run: `node --test tests/json-export.test.js tests/content-script-detail-flow.test.js`

