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
  (see `public/admin/js/articles.js`'s canonical-event field) instead of
  pasting a raw UUID.
- Currently wired: **Competition** (standings fallback), **Article →
  Event** (the one integration with a real picker UI, not just a script).
- Written but not yet read: **Club → Team** mapping rows (from a one-off
  script, `prisma/populate-kenya-cup-canonical-mapping.js`) — no code in
  this repo fetches them.
- Not started: Athlete, Fixture, Match — no mapping type, no fetch
  function, no UI for any of them yet.

See the Sports Data repo's copy for the full per-entity breakdown, the
domain-event inventory, and exactly which of Wave 2's acceptance
criteria are actually done versus not.
