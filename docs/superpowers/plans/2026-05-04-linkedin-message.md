# LinkedIn Message Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a ready-to-send LinkedIn connection note for each hiring-team contact and make hiring-team titles explicit in exported JSON.

**Architecture:** Extend the export normalization layer to transform raw hiring-team members into a clearer output shape, including `memberTitle` and `linkedinMessage`. Keep extraction logic intact where possible and treat this as an export-schema enhancement centered in `content_script.js`, with tests and docs updated around it.

**Tech Stack:** Plain JavaScript, Node test runner, Manifest V3 Chrome extension

---

### Task 1: Lock the schema and message behavior in tests

**Files:**
- Modify: `tests/content-script-detail-flow.test.js`
- Modify: `tests/json-export.test.js`

- [ ] **Step 1: Write failing tests for `memberTitle`, `linkedinMessage`, and `hiringTeam` field order**
- [ ] **Step 2: Run targeted tests and confirm they fail for the missing schema/message changes**

### Task 2: Implement the export-shape update

**Files:**
- Modify: `content_script.js`

- [ ] **Step 1: Add a helper that builds a bounded LinkedIn message from first name, job title, and company**
- [ ] **Step 2: Normalize hiring-team members to `{ name, linkedinUrl, memberTitle, linkedinMessage }`**
- [ ] **Step 3: Reorder top-level export fields so `hiringTeam` appears before `description`**
- [ ] **Step 4: Re-run targeted tests and make them pass**

### Task 3: Update docs and verify

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README JSON example and field descriptions**
- [ ] **Step 2: Run the relevant test suite**
