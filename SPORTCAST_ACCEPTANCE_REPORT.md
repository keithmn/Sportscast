# Sportcast — Acceptance Report

Wave 9 (pre-OS refinement) final refinement sprint, Sportscast half. Written 2026-09-16.

## Gate table

| # | Gate | Verdict | Evidence |
|---|---|---|---|
| 1 | Show strategy clear | **PASS** | Flagship-only, confirmed and corrected. `prisma/seed.js`'s niche-show article seeding block (silently contradicting the documented 2026-09-13 removal decision) deleted. `BLUEPRINT.md` §4/§5 rewritten to match current reality (previously described a pre-Show-model, six-show architecture that no longer existed even before this pass). 3 tests (`show-strategy.spec.js`). |
| 2 | Canonical Fixture/Match strategy implemented or documented | **PASS** | Implemented. `fetchCanonicalFixture`/`verifyCanonicalFixture`/`listCanonicalFixtureCandidates` (new, `canonicalData.js`); `PUT`/`DELETE`/`GET` canonical-fixture routes + candidate-browse endpoint (`competitions.js`); admin picker (browses candidates between the fixture's two already-Team-linked Clubs, not a raw UUID field); public Match Hub prefers the canonical score when one exists. 4 tests across `canonical-fixture.spec.js`. |
| 3 | Search includes canonical direction | **PASS** | `GET /api/search` gains a `canonical` results key (Team/Athlete/Competition, via the existing `searchCanonical` fail-soft function) alongside local results, always. UI section on `/search.html`, clearly labeled "(Sports Data)." 2 new tests in `public-search.spec.js`. |
| 4 | Event/content graph strengthened | **PASS** | `GET /api/articles/by-event/:canonicalEventId` (new) — every Article linked to a canonical Event, tagged with its Episode/Clip/Poll coverage. "Content for this Event" admin panel. 3 tests (`event-content-graph.spec.js`). |
| 5 | Fan identity limitations clear | **PASS** | Already substantially honest before this pass (`account.js`'s own copy states no cross-device sync). Formalized in `CURRENT_ARCHITECTURE.md`/`CONTENT_MODEL.md`/`NEWSROOM_OPERATIONS.md`. No code change needed — the gap was documentation completeness, not UI honesty. |
| 6 | Notification model clear | **PASS** | Confirmed accurate against actual code (Wave 9 audit); documented in `CURRENT_ARCHITECTURE.md` and `UNDERDAWGS_OS_OBJECT_MODEL.md`'s object-by-object breakdown. |
| 7 | Cron/jobs documented | **PASS** | `JOB_RUNBOOK.md` (new) — all 9 jobs, cadence, idempotency reasoning, and an explicit multi-replica-safety warning (this app is not currently safe to run on more than one Railway replica — a real, previously-undocumented risk). |
| 8 | Admin exposes OS-facing queues | **PASS** | Two new dashboard cards: finished matches with no report yet (`GET /api/fixtures/missing-reports`), clips awaiting approval across every episode (`GET /api/episodes/clips/pending`). 3 tests (`os-facing-dashboard.spec.js`). Some items from the directive's fuller wishlist (canonical-link issues, failed-canonical-API-call tracking, notification-delivery history, persisted job-run health) deliberately **not** built — see "Known limitations" below. |
| 9 | Tests run and results recorded | **PASS** | Full Playwright suite: 52 passing (up from 39 at the start of this sprint). One transient failure observed in a single full-suite run, not reproduced on two subsequent re-runs — see "Known limitations." |
| 10 | Acceptance report complete | **PASS** | This document. |

## What changed

- `prisma/seed.js` — niche-show article seeding removed.
- `server/lib/canonicalData.js` — `fetchCanonicalFixture`/`verifyCanonicalFixture`/`listCanonicalFixtureCandidates` (new).
- `server/routes/competitions.js`, `server/routes/fixtures.js` — canonical-fixture link/unlink/candidates routes; public `GET /:id` embeds `canonicalFixture`.
- `public/admin/js/competitions.js`, `public/js/match.js` — admin picker, public score preference.
- `server/routes/publicSearch.js`, `public/js/search.js` — canonical results section.
- `server/routes/articles.js`, `public/admin/js/articles.js`, `public/admin/articles.html` — Event content-graph route + panel.
- `server/routes/fixtures.js` (`/missing-reports`), `server/routes/episodes.js` (`/clips/pending`), `public/admin/js/dashboard.js` — two new dashboard cards.
- Docs: `CURRENT_ARCHITECTURE.md`, `CONTENT_MODEL.md`, `NEWSROOM_OPERATIONS.md`, `JOB_RUNBOOK.md` (all new), `BLUEPRINT.md` §4/§5 rewritten, `UNDERDAWGS_DOMAIN_CONTRACT.md` updated, `UNDERDAWGS_OS_OBJECT_MODEL.md` (new, shared with the Data Platform).

## Migrations

None — every change this sprint fit the existing `Article`/`Fixture`/`Clip`/`CanonicalMapping` schema (the `FIXTURE` `localEntityType` value is a plain string, not an enum requiring a migration — `CanonicalMapping`'s own design).

## Tests run

```
npx playwright test
```
Result: 52 tests, 52 passing (one prior full-suite run showed a single transient failure in `canonical-fixture.spec.js`, not reproduced across two subsequent full re-runs — recorded honestly below, not swept under the rug).

## Known limitations / accepted technical debt

- **Not built this sprint, deliberately scoped out**: canonical-link-issue tracking (would require live-checking every Article's canonical link on every dashboard load — expensive for a cheap card), failed-canonical-API-call history (no stored log exists), notification-delivery-issue tracking (no stored delivery log exists, confirmed in the Wave 9 audit), persisted job-run health (no `JobRun` table — see `JOB_RUNBOOK.md`'s own "accepted gap" note). All four would require either new persistent logging infrastructure or expensive live checks — real future work, not silently dropped.
- **Multi-replica cron safety** — documented as a real, previously-unwritten risk (`JOB_RUNBOOK.md`), not fixed. This app is single-instance-only today; fixing it (worker separation or distributed locking) is out of this sprint's scope (a code change, not a documentation gap).
- **One transient e2e test failure**, not reproduced on retry — recorded, not chased further given two clean re-runs; if it recurs, `canonical-fixture.spec.js`'s second test is the one to watch first.
- **Cross-device fan-account follow sync is not built** (carried over from Wave 7, reconfirmed accurate this sprint, not a new gap).

## Remaining P0/P1 issues

No P0s. P1: multi-replica cron safety (above) is the most consequential item, worth addressing before any horizontal scaling decision, not before Command OS work specifically.

## Deploy status

**Not yet committed/deployed** — implementation complete and tested locally against the throwaway e2e SQLite database. Commit and deploy pending the combined sprint decision (see `FINAL_REFINEMENT_REPORT.md`).
