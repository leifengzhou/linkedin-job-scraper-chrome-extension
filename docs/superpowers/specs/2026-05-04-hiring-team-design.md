# Hiring Team Design

**Goal:** Export the visible LinkedIn `Meet the hiring team` people for each scraped job.

## Scope

Add a `hiringTeam` field to each exported job record. The field is always present and is an array. When LinkedIn does not show a hiring team section, the value is `[]`.

Each team member entry contains:

- `name`
- `linkedinUrl`
- `title`

## Extraction Approach

The scraper already reads job detail metadata from the right-side semantic job details pane. Extend that extraction boundary so the DOM adapter also finds the `Meet the hiring team` section by visible heading text, then collects each visible member profile link under that section.

The extractor should avoid hashed class names and instead rely on:

- the semantic detail root
- the visible section heading text `Meet the hiring team`
- LinkedIn profile links matching `a[href*="/in/"]`

## Data Flow

1. `job_dom_adapters.js` returns `hiringTeam` from `extractDetailData()`.
2. `content_script.js` carries that array into the normalized export payload.
3. JSON exports include `hiringTeam` unchanged.

## Missing Section Behavior

If the section is absent or no valid members are found, export `hiringTeam: []`.

## Testing

- Add adapter tests for a populated hiring-team section and a missing-section fallback.
- Add content-script tests to confirm `collectCurrentJobData()` preserves extracted hiring-team entries and falls back to `[]`.
- Update JSON export tests to lock the schema shape.
