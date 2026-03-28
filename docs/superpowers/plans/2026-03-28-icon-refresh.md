# Extension Icon Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current extension icon with a slimmer geometric mark, keep the current blue, and ensure Chrome uses the same asset set across the toolbar and `chrome://extensions`.

**Architecture:** Add a single source SVG for the icon so the geometry is easy to tweak, rasterize it into the packaged PNG sizes used by the extension, and make the manifest declare the shared icon set both at the root and under `action.default_icon`.

**Tech Stack:** Manifest V3, SVG source asset, Pillow-based raster export

---

## Chunk 1: Asset Source And Manifest Wiring

### Task 1: Add a reusable source icon

**Files:**
- Create: `icons/icon.svg`

- [ ] **Step 1: Draw the slimmer geometric icon source**
Create an SVG with the existing blue rounded square background and a thinner white `L` that reads cleanly at 16px.

- [ ] **Step 2: Keep the geometry simple**
Use only a few rectangles and a rounded-square background so the raster outputs stay crisp and predictable.

### Task 2: Make icon usage explicit in the manifest

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add the top-level icon mapping**
Declare the `16`, `48`, and `128` icon files under the root `icons` key so Chrome can use the same packaged assets on extension-management surfaces.

- [ ] **Step 2: Preserve existing action wiring**
Leave `action.default_icon` pointed at the same PNG files so the toolbar continues to use the same icon set.

## Chunk 2: Raster Export And Verification

### Task 3: Export packaged PNG sizes

**Files:**
- Modify: `icons/icon16.png`
- Modify: `icons/icon48.png`
- Modify: `icons/icon128.png`

- [ ] **Step 1: Rasterize the SVG at packaged sizes**
Render deterministic PNG outputs at `16x16`, `48x48`, and `128x128` from the new SVG source.

- [ ] **Step 2: Verify the generated files**
Confirm each output has the expected dimensions and is the file referenced by the manifest.
