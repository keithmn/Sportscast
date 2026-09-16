# Underdawgs Domain Contract

The canonical version of this document lives in the Underdawgs Sports
Data Platform repo (`UNDERDAWGS_DOMAIN_CONTRACT.md` there) — it documents
per-entity ownership, API shape, and fallback behavior for both sides of
the Sportscast ↔ Sports Data relationship, and is written to be read from
either repo. Not duplicated here in full to avoid the two copies
drifting out of sync with each other.

## What lives on this side, in brief

- `server/lib/canonicalData.js` — the only code in this repo that talks
  to the Data Platform. Every function fails soft (network error,
  timeout, missing mapping → `null`, never throws); nothing here is
  cached, every read is live.
- `prisma/schema.prisma`'s `CanonicalMapping` model — the local table
  linking one of this repo's rows to a Data Platform id. `localEntityType`/
  `canonicalEntityType` are plain strings, not enums — unenforced by the
  database, only by convention.
- `server/routes/canonicalSearch.js` — admin-only proxy to the Data
  Platform's `/v1/search`, added 2026-09-16 to back a real search picker
  instead of pasting a raw UUID.
- `public/js/canonicalLinkWidget.js` — the shared admin picker widget
  (markup + search/link/unlink wiring), extracted once Competition became
  its third user (Club/Player were the first two; Article's Event picker
  predates this file and still has its own bespoke implementation, not
  yet migrated to it — a real, small piece of remaining duplication, not
  an oversight worth fixing blind).
- All five canonical-link acceptance criteria this repo can satisfy on
  its own are now done, each with a real admin picker (not a one-off
  script) and public-page display: **Article → Event**, **Club →
  Team**, **Player → Athlete**, **Competition → Competition** (added
  2026-09-16), and **Fixture → Fixture/Match** (added Wave 9, same day —
  the Data Platform side settled its own Match-API strategy in the same
  pass, deciding Match is reached through Fixture, not a standalone
  route; see that repo's copy of this doc). Fixture's picker is
  deliberately NOT the shared name-search widget (`canonicalLinkWidget.js`)
  the other four use — Fixture has no name field on either side — it
  browses candidates between the fixture's two Clubs' own already-linked
  canonical Teams instead (`listCanonicalFixtureCandidates`,
  `server/lib/canonicalData.js`), and returns an empty, honest list
  rather than a guess when either Club isn't linked yet.

See the Sports Data repo's copy for the full per-entity breakdown, the
domain-event inventory, and exactly which of Wave 2's acceptance
criteria are actually done versus not.
