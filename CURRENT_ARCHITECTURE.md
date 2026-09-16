# Current Architecture

What exists **right now**, present-tense, no aspirational content. For the reasoning behind decisions, see `BLUEPRINT.md`'s numbered sections and `DECISION_LOG.md`. This is a snapshot, not a design rationale — correct it when code changes, don't let it drift.

## Stack

Node.js/Express, Prisma/SQLite (file-based, on a Railway persistent volume), vanilla HTML/CSS/JS — no frontend framework, no bundler, no build step. Deliberately kept this way (`DECISION_LOG.md`) — the directive this repo operates under explicitly says not to migrate it to React/Next/Vue/Svelte.

## Server structure (`server/`)

- `index.js` — app entry: middleware chain (helmet, sessions, rate limiters), route mounts, cron job registration.
- `routes/*.js` — one file per resource (see table below).
- `lib/*.js` — cross-cutting logic: `canonicalData.js` (Data Platform bridge), `push.js`/`events.js` (notifications), `clubResolution.js`/`seasonResolution.js` (fixture resolution helpers), `contentEngine.js`/`whisper.js`/`ffmpeg.js` (Content Transformation Engine), `storage.js` (uploads), `assertPublicUrl.js` (SSRF guard).
- `jobs/*.js` — cron job bodies, registered in `index.js` — see `JOB_RUNBOOK.md` for the full list.
- `middleware/*.js` — `auth.js` (session/role gating), `rateLimits.js` (`publicWriteLimiter`).

## Route inventory

| Route file | Mount | Notes |
|---|---|---|
| `auth` | `/api/auth` | Staff session (`ADMIN`/`EDITOR`) |
| `fanAuth` | `/api/fan-auth` | Fan accounts (Wave 7) — entirely separate session, `req.session.fan` |
| `articles` | `/api/articles` | Stories + video posts (one `Article` model, `contentType` differentiates). Canonical-Event linking, Event→content-graph (`/by-event/:id`, Wave 9) |
| `episodes` | `/api/episodes` | Content Transformation Engine: recordings, transcription, clips, social assets, sponsors. `/clips/pending` (Wave 9) — cross-episode approval queue |
| `shows` | `/api/shows` | One active Show (flagship) — see "Show strategy" below |
| `competitions` | `/api/competitions` | Standings + fixture CRUD (fixture writes live here, not in `fixtures.js`) + canonical-Competition and canonical-Fixture linking (Wave 9) |
| `fixtures` | `/api/fixtures` | Public fixture reads, `/today`, `/missing-reports` (Wave 9), `/search`. Embeds `canonicalFixture` on `GET /:id` (Wave 9) |
| `clubs` | `/api/clubs` | Clubs + Players (nested), canonical-Team/-Athlete linking |
| `players` | (via `clubs`) | See above |
| `sources` | `/api/sources` | Newsroom monitoring feeds — NOT the Data Platform's provenance concept, see `UNDERDAWGS_DOMAIN_CONTRACT.md` |
| `monitoring` | `/api/monitoring` | LLM-assisted lead triage, human-gated promote |
| `submissions` | `/api/submissions` | Contact/Tip/Partnership/Newsletter forms (unrelated to the Data Platform's correspondent Submission pipeline — same word, different concept) |
| `follows` | `/api/follows` | Anonymous, device-token (`anonymousId`) preference storage |
| `push` | `/api/push` | Web Push subscription management |
| `polls` | `/api` (mounted as `pollRoutes`) | Per-article fan voting |
| `search` (public) | `/api/search` | Local + canonical results (Wave 9 §8.3) |
| `canonicalSearch` | `/api/canonical-search` | Admin-only proxy to the Data Platform's `/v1/search`, backs the picker widgets |
| `uploads` | `/api/uploads` | Image upload (Sharp-compressed) |

## Show strategy

**One active Show: "The Sportscast" (flagship).** The 5 niche shows named in earlier project history were deliberately removed (`BLUEPRINT.md` §28), and `prisma/seed.js` was fixed Wave 9 (2026-09-16) to stop silently recreating them on every reseed — see `BLUEPRINT.md` §4/§5 for the full correction. `Article.videoSeries` remains the real sync trigger for the flagship's own episodes (`syncEpisodeForArticle`).

## Canonical (Data Platform) integration

`server/lib/canonicalData.js` — the only code that talks to the separate Underdawgs Sports Data Platform, server-to-server, never from the browser. Every function fails soft (network error/timeout/no mapping → `null`, never throws). Five links exist: **Article → Event**, **Club → Team**, **Player → Athlete**, **Competition → Competition**, **Fixture → Fixture/Match** (last one added Wave 9, 2026-09-16 — closing the one core entity that had no canonical integration at all before). Fixture's picker is a candidate-browse UI (between the fixture's two Clubs' own linked Teams), not the shared name-search widget the other four use — Fixture has no name field to search on. Full detail: `UNDERDAWGS_DOMAIN_CONTRACT.md`.

## Notification model

`server/lib/events.js`'s `notifyArticlePublished` (Wave 7) is the one generalized event→notify function, calling `server/lib/push.js`'s `sendPushToFollowers`. No stored `NotificationEvent`/subscription-preference model exists beyond `PushSubscription` (device opt-in) and `Follow` (the preference itself) — see `docs/API.md`-equivalent detail in `API.md`'s "Notification events" section.

## Fan identity

`FanAccount` (Wave 7) — email+password, no password reset (no email service configured in this stack), no email verification. Registering claims the device's existing `anonymousId` rather than migrating Follow/PushSubscription data. **Logging in does not currently change Follow behavior at all** — `public/js/follows.js` reads/writes purely via `anonymousId`/localStorage regardless of login state; cross-device follow sync is not built (confirmed via Wave 9 audit, `DECISION_LOG.md`'s Wave 7 entry).

## What's NOT here

- No `Event` model of its own — "Event" always means the Data Platform's canonical Event.
- No structured KPI/risk/decision tracking (Wave 9 audit finding — see `UNDERDAWGS_OS_OBJECT_MODEL.md`).
- No cross-repo runtime coupling beyond `canonicalData.js`'s documented bridge.
- No scheduler/worker process separate from the main Express app — see `JOB_RUNBOOK.md` for why that's an accepted, documented constraint, not an oversight.
