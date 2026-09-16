# Underdawgs OS Object Model

**Canonical copy.** This document lives here (the Sports Data Platform repo) and in the sibling Sportscast repo as an identical copy — written to be read from either. If the two ever disagree, treat that as a bug to fix, not a real difference.

Defines the 30 objects a future Command OS would coordinate, and — critically — where each one already lives today, so an OS build never has to guess, duplicate, or re-derive a fact that already has a real owner. Written 2026-09-16, Wave 9 pre-OS refinement, as the direct output of a full audit of both repos.

For each object: does it exist, which repo owns it, should the OS own it or only reference it, what ID the OS should store, what API it should call, and what must never be duplicated.

## How to read "should the OS own it"

Three answers appear below:

- **Reference only** — the object has a real owner already; the OS stores that owner's id and calls its API. Duplicating the object into the OS's own database would create a second, driftable copy of a fact that already has one true source.
- **OS-owned, new** — nothing today models this concept anywhere; it belongs to the OS because it's about running the *company*, not either product's own domain (Sports Data owns sporting truth, Sportscast owns media/audience — neither owns "here's a risk the business is tracking").
- **N/A** — the directive named it as a candidate concept, but nothing in either repo's real workflow needs it modeled separately; forcing it into existence would be exactly the "duplicate, guess" failure mode this document exists to prevent.

---

## Sports Data–owned objects

| # | Object | Exists? | Owner | OS relationship | ID to store | API | Do not duplicate |
|---|---|---|---|---|---|---|---|
| 1 | **Event** | Yes — `Event` model, `apps/api/src/routes/events.ts` | Sports Data | Reference only | Sports Data UUID | `GET /v1/events/:id`; `GET /v1/events` for lists | Event's `status`/`category`/canonical links — the OS reads, never writes these directly |
| 2 | **Fixture** | Yes — `Fixture` model | Sports Data | Reference only | Sports Data UUID | `GET /v1/fixtures/:id` (the one "match operational object" — see Match below) | Fixture status/score |
| 3 | **Match** | Yes — `Match` model, but deliberately **no standalone API** (Wave 9 decision, Option B) | Sports Data | Reference only, via its Fixture | Use the Fixture's id — Match has no independent lookup | `GET /v1/fixtures/:id` (nests `match`), `/:id/events`, `/:id/evidence` | Don't build a second Match-lookup path in the OS; the Data Platform itself deliberately doesn't have one |
| 4 | **Assignment** | Yes — `Assignment` model | Sports Data | Reference only | Sports Data UUID | `GET /v1/assignments`, `GET /v1/operations` (due/overdue summary) | `dueAt`/`status` — the actual work-tracking state |
| 5 | **Correspondent** | Not a separate model — a `User` with role `CORRESPONDENT` | Sports Data | Reference only | Sports Data User UUID | `GET /v1/assignments?correspondentId=` | Sports Data owns correspondent identity; do not create a parallel "correspondent" record in the OS — see "Owner"/"People" reasoning below |
| 6 | **Submission** | Yes — `Submission` model, full state machine | Sports Data | Reference only | Sports Data UUID | `GET /v1/submissions`, `GET /v1/operations` | The raw report fields and review state — immutable history, never re-entered elsewhere |
| 7 | **Evidence** | Yes — `Evidence` model, polymorphic | Sports Data | Reference only | Sports Data UUID | `GET /v1/evidence?entityType=&entityId=`, `GET /v1/fixtures/:id/evidence` | The artifact itself (photo/document/audio/video URL) |
| 8 | **Verification** | Not a model — the `VERIFIER` role's action within Submission's state machine, plus `Result.confidenceLevel` | Sports Data | Reference only | N/A — read via Submission/Result | `GET /v1/submissions`, `GET /v1/operations`'s `recordsAwaitingVerification` | The confidence-level enum and self-review guard logic |
| 9 | **Correction** | Yes — `Correction` model, immutable audit trail | Sports Data | Reference only | Sports Data UUID | `GET /v1/corrections` | Never re-created elsewhere — Correction is *the* audit trail, full stop |
| 10 | **Source** (Sports Data's provenance concept) | Yes — `Source` model (reliability governance) | Sports Data | Reference only | Sports Data UUID | `GET /v1/sources` | Reliability level/audit fields — do not build a second provenance system in the OS |

## Sportscast-owned objects

| # | Object | Exists? | Owner | OS relationship | ID to store | API | Do not duplicate |
|---|---|---|---|---|---|---|---|
| 11 | **Story / Article** | Yes — `Article` model | Sportscast | Reference only | Sportscast cuid | `GET /api/articles/:slug`, `/admin/all` | Article body/status — editorial content stays in Sportscast |
| 12 | **Match Report** | Not a separate model — an `Article` with `fixtureId` set | Sportscast | Reference only, via Article | Article's own id | `GET /api/articles?fixture=`, `GET /api/fixtures/missing-reports` (Wave 9 — which fixtures need one) | N/A — it's already just Article |
| 13 | **Show** | Yes — `Show` model, one active row (flagship) | Sportscast | Reference only | Sportscast cuid | `GET /api/shows/:slug` | Show identity/branding |
| 14 | **Episode** | Yes — `Episode` model, 1:1 with its Article | Sportscast | Reference only | Sportscast cuid | Nested under `GET /api/articles/:slug` | Production-pipeline state (`transcriptionStatus`, etc.) |
| 15 | **Clip** | Yes — `Clip` model | Sportscast | Reference only | Sportscast cuid | `GET /api/episodes/clips/pending` (Wave 9 — cross-episode approval queue) | `status`/`source` (SUGGESTED/APPROVED/REJECTED/RENDERED) — the human-review state |
| 16 | **Transcript** | Yes — `Episode.transcript`/`transcriptSegments` fields, not a separate model | Sportscast | Reference only | N/A — read via Episode | Nested under Episode | The transcript text itself — large, and Sportscast is the one place it's actually produced (Whisper) |
| 17 | **Distribution Record** | **Does not exist.** No model or concept anywhere tracks "this episode/clip was published to YouTube/Instagram/etc. on this date." | Neither | **N/A for now** — genuinely nothing to reference. If real multi-channel distribution tracking becomes a need, it's new work for whichever product actually does the distributing (most likely Sportscast, since it owns publishing) — not something to fabricate into the OS pre-emptively | — | — | — |
| 18 | **Fan** | Yes — `FanAccount` model (Wave 7) | Sportscast | Reference only | Sportscast cuid | No public list endpoint (privacy-appropriate) | Email/password — real PII, the OS should never hold a second copy |
| 19 | **Follow** | Yes — `Follow` model, anonymous device-token based | Sportscast | Reference only | N/A — keyed by `anonymousId`, not meaningfully OS-referenceable per-row | `GET /api/follows?anonymousId=` | The preference data itself |
| 20 | **Notification Event** | Partial — `server/lib/events.js`'s `notifyArticlePublished` is a function, not a stored event log; Sports Data's `DomainEvent` table is a real stored log but nothing consumes it yet | Sports Data (`DomainEvent`) for its own domain; Sportscast has no stored log of its own | **OS-owned, new** if/when the OS needs to *consume* notification-worthy moments across both products — today, reference `GET /v1/*` domain-event emission points directly (`docs/API.md`'s Domain events table) rather than building a second log prematurely | Sports Data `DomainEvent.id` where applicable; no Sportscast-side id exists yet | `GET` isn't exposed for `DomainEvent` today — reading it would be new API surface, not yet built | Don't build a competing event log in the OS while `DomainEvent` already exists and is unconsumed — wire up the real one first |
| 21 | **Notification Subscription** | Yes, but two different concepts share the word: `PushSubscription` (device Web Push opt-in) and `Follow` (what to notify about) | Sportscast | Reference only | Sportscast cuid (`PushSubscription.id`) | No admin list endpoint currently | The device keys (`p256dh`/`auth`) — real secrets, never copy these into the OS |

## Genuinely new — OS-owned objects (nothing today models these)

| # | Object | Exists? | Owner | OS relationship | Notes |
|---|---|---|---|---|---|
| 22 | **Task** | No generic model in either repo. Assignment (Sports Data) is the closest real analogue but is scoped specifically to correspondent coverage, not general company work | Neither | **OS-owned, new** | The OS's own generic "something someone needs to do" concept — should be able to *reference* an Assignment/Submission/Clip-awaiting-approval as its subject, not re-model those domains |
| 23 | **Decision** | Prose-only in both repos (`DECISION_LOG.md`, narrative, no structured fields) | Neither (structurally) | **OS-owned, new** | A structured decision record (status/owner/date) that could *link to* the existing prose logs rather than replace them — the prose logs stay valuable as detailed reasoning, structured records make them queryable |
| 24 | **Owner** (of a Task/Decision/Risk) | Not a cross-product concept — each repo's own `User` model is scoped to that repo only, no shared identity | Neither | **OS-owned, new**, referencing each repo's `User.id` per product rather than inventing a third identity system | A real, confirmed gap: the SAME human (e.g., an admin who works across both products) has two entirely separate `User` rows today with no link between them |
| 25 | **Due Date** | Exists per-object (`Assignment.dueAt`), not as a cross-cutting concept | Distributed | **Reference only**, per-object — the OS's own Task (22) needs its own `dueAt`, but should not try to unify every existing due-date field into one table | — |
| 26 | **Status** | Exists per-object (Event.status, Assignment.status, Submission.status, Article.status, Clip.status, ...) — each is its own enum, genuinely different vocabularies (confirmed directly: Sportscast's `FixtureStatus` and the Data Platform's are NOT the same enum, see `public/js/match.js`'s Wave 9 comment) | Distributed | **Reference only**, per-object | Do not attempt a single unified "Status" enum across products — the vocabularies are genuinely different and forcing them into one would lose real distinctions (e.g., Sportscast's LIVE has no Data Platform equivalent) |
| 27 | **Alert** | Exists only as ephemeral, computed-on-load UI state (both admin dashboards' alert cards) — nothing persisted | Neither | **OS-owned, new**, if a persistent/cross-product alert history becomes a real need | Today: `GET /v1/operations` (Sports Data) and the dashboard's own live queries (Sportscast) compute alerts fresh every page load — genuinely fine for a single-operator team, a real gap only once alerts need to be tracked over time or across products |
| 28 | **Quality Issue** | Yes, but scoped to Sports Data only — `GET /v1/quality`'s duplicate-candidates/unverified-records/etc. Sportscast has no equivalent data-quality concept (it doesn't own canonical sporting data) | Sports Data | Reference only | Sports Data's `/v1/quality` and `/v1/operations` responses ARE the quality-issue list — no new model needed, just a consumer |
| 29 | **Canonical Entity** | The `CanonicalMapping` model (Sportscast side) IS this concept, already built and working for 5 entity types (Article→Event, Club→Team, Player→Athlete, Competition→Competition, Fixture→Fixture/Match) | Sportscast (the mapping), Sports Data (the canonical truth) | Reference only | The pattern itself — polymorphic local↔canonical link — is proven and reusable; the OS should reuse this exact pattern for its own local↔canonical references rather than inventing a new one |
| 30 | **External Source** | Sports Data's `Source` (provenance) and Sportscast's `Source` (monitoring feeds) are TWO DIFFERENT MODELS sharing a name — confirmed via `UNDERDAWGS_DOMAIN_CONTRACT.md`'s own explicit warning not to conflate them | Both, separately, deliberately | Reference only, to whichever one is actually meant | The most important "do not duplicate" entry in this whole document: a future OS integration that assumes "Source" means one thing across both products will silently do the wrong thing |

---

## What this means for scoping the actual OS build

1. **Nineteen of the thirty objects already have a real, working owner.** The OS's job for those is almost entirely "call the existing API, store the id, never re-model the data" — not new schema design.
2. **Five objects are genuinely new** (Task, Decision, Owner, Alert-as-history, and arguably Notification Event once it needs cross-product consumption) — this is the actual net-new surface Command OS needs to build, and it's small.
3. **One object (Distribution Record) has no home anywhere and shouldn't be fabricated** into existence just because the directive named it — build it if/when real multi-channel distribution tracking becomes an actual need.
4. **The single hardest problem isn't a missing object — it's Owner/People (24).** Two independent `User` tables, no shared identity, is the one gap that blocks genuine cross-product operations (Wave 9's own audit flagged this as the central finding: "cross-product operations... cannot emerge from either existing admin panel, by design"). Any OS build has to solve this first, deliberately, not as a side effect of building Task/Decision tracking.
