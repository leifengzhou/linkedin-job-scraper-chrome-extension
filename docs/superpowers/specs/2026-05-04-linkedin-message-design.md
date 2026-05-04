# LinkedIn Message Design

**Goal:** Add a ready-to-send LinkedIn connection note for each hiring-team contact and make the exported JSON less ambiguous.

## Scope

Update each `hiringTeam` entry to include:

- `memberTitle` for the hiring-team person's title
- `linkedinMessage` for a short personalized connection note

Also move the top-level `hiringTeam` field above `description` in exported job records.

## Message Rules

- Personalize with the contact's first name, the scraped job title, and the company name.
- Keep the rest of the text fixed across contacts.
- Keep the message within the stricter `200` character limit so it fits standard LinkedIn personalized invitation notes, not only Premium notes.

Recommended template:

`Hi {firstName} — I recently applied for the {jobTitle} role at {company} and would love to connect. I’m very interested in the opportunity and in the work your team is doing. Thanks!`

If the job title is missing, fall back to a company-only version instead of emitting malformed text.

## JSON Clarity

Use `memberTitle` inside `hiringTeam` so it does not collide semantically with the top-level job `title`.

## Testing

- Add tests for `linkedinMessage` generation and `memberTitle` export.
- Add tests for the field order in normalized export payloads.
- Update README examples and manual verification notes.
