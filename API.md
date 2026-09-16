# API

`server/routes/*.js` is the JSON surface behind both this site's own frontend (`public/*.html` + `public/js/*.js`) and its admin panel (`public/admin/*`) — there is no separate app-facing API distinct from what the site itself calls. This document is the orientation the Underdawgs Sports Data Platform's sibling repo already has (`docs/API.md` there) — Sportscast never had one until now (Wave 7, 2026-09-16).

Production is live at `https://sportscast-production-c267.up.railway.app`.

## Versioning

There is no `/api/v1` prefix — every route is a bare `/api/*`, and has been since this API's very first route. That's a **deliberate choice, not an oversight**: today there is exactly one consumer (this repo's own frontend, same-origin, no separate mobile/app client yet), so a version prefix would add a path segment with nothing yet depending on it staying stable. Treat everything under `/api/*` today as the implicit "v1" contract described below.

If a real second consumer shows up (a native app, an external partner) and a breaking change becomes necessary, the move is a new `/api/v2/*` prefix mounted **alongside** `/api/*` (which keeps serving the existing frontend unchanged) — never an in-place rewrite of a path an existing client depends on. Until then:

- **Non-breaking, ships in place**: a new optional request field, a new response field, a new endpoint, a new query param, loosening a validation rule.
- **Breaking, would need `/v2`**: removing/renaming a response field, changing a field's type or meaning, removing an endpoint, tightening a previously-accepted value into a rejected one.

## Reads are mostly public, writes are gated

Most `GET` routes are intentionally public and unauthenticated — this is what lets the public site and the admin panel share the same routes for read paths. Writes require a session (`requireRole('ADMIN', 'EDITOR')` on most; `orders.js`/`shop.js` are code that exists but is deliberately dormant/unmounted — see `server/index.js`'s own comment — not part of the live surface at all). A handful of public routes accept **writes** too, by design, since they back anonymous fan interactions rather than admin CRUD: `POST /api/follows`, `POST /api/push/subscribe`, `POST /api/polls/:pollId/vote` (poll voting), `POST /api/submissions` (correspondent match reports). These are rate-limited (`publicWriteLimiter`, `server/middleware/rateLimits.js`) separately from `POST /api/auth/login`'s own stricter limiter. Full detail on both limiters and the security-header setup (`helmet`) lives in `server/index.js` directly — this doc doesn't duplicate it.

## Authentication

Two entirely separate cookie-session tracks, sharing the same session store but keyed under different session properties so they never collide in the same browser:

1. **Staff** (`ADMIN`/`EDITOR`, the `User` model) — `requireRole`/`requireAuth`-gated (`server/middleware/auth.js`), `POST /api/auth/login` + `GET /api/auth/me` + `POST /api/auth/logout`, session stored at `req.session.user`.
2. **Fan accounts** (Wave 7, 2026-09-16) — `POST /api/fan-auth/register`, `POST /api/fan-auth/login`, `GET /api/fan-auth/me`, `POST /api/fan-auth/logout`, session stored at `req.session.fan`. Email + password only, `bcrypt`-hashed (cost 10, matching `User`'s own convention). **Deliberately no email verification and no password-reset flow** — this stack has no email-sending service configured anywhere, so a reset link would have nowhere real to send its email; that's a stated, known gap (`DECISION_LOG.md`'s Wave 7 entry), not a silent one. Both `/register` and `/login` share the same rate limiter as staff login (`loginLimiter`, `server/index.js`).

A fan account doesn't migrate or copy any Follow/PushSubscription data on registration — both those models are keyed on the device's `anonymousId`, and registering just lets a `FanAccount` claim that same `anonymousId` as its own (`FanAccount.anonymousId`, unique). Every follow made anonymously before registering keeps working identically afterward, no rows touched. Genuine cross-device sync (signing into the same account from a second device and inheriting *that* device's separate follows) isn't built — it would need `public/js/follows.js` to stop trusting `localStorage` once signed in, a real client-side redesign left for later.

There is also no `API_CLIENT`/API-key concept here, unlike the Data Platform repo — no `ApiKey` model exists in this schema. Nothing outside this site's own frontend and admin panel currently needs programmatic access; if that need arises, follow the Data Platform's `ApiKey` pattern (`SHA-256` hash stored, never plaintext, ADMIN-issued) rather than inventing a new scheme.

## What's public vs. gated, by resource

| Resource | Public GET | Gated GET | Notes |
|---|---|---|---|
| Articles (`/api/articles`) | `/` (list, filterable by sport/competition/club/player/fixture/tag/featured/videoSeries/contentType/isBrief), `/:slug` (one article) | `/admin/all`, `/:id/canonical-event` | List only ever returns `PUBLISHED`; a draft/scheduled slug 404s to an unauthenticated caller. |
| Search (`/api/search`) | `/?q=` (min 2 chars, optional `type`) | — | Cross-entity: Article/Show/Club/Player/Competition. |
| Canonical search (`/api/canonical-search`) | — | `/` | Admin-only lookup against the Data Platform, backs the canonical-link pickers. |
| Episodes (`/api/episodes`) | — | `/:id/status` | No public GET — episodes surface through Articles/Shows instead. |
| Taxonomy (`/api/sports`, `/api/tags`, `/api/authors`) | all | — | Reference lists; `/authors/:slug` also returns that author's published articles. |
| Competitions (`/api/competitions`) | `/` (filterable by sport), `/:slug` (canonical-standings-enriched, optional `season`) | `/changelog`, `/:id/team-names`, `/:id/canonical-competition`, `/:id/seasons` | |
| Fixtures (`/api/fixtures`) | `/` (requires `sport` + `date`), `/upcoming` (`limit`, max 20), `/:id` | `/today`, `/search` | |
| Submissions (`/api/submissions`) | — | `/` | Correspondent match-report pipeline; `POST /` itself is public/rate-limited even though `GET /` isn't. |
| Clubs (`/api/clubs`) | `/` (filterable by competition), `/:slug` (canonical-team-enriched roster/staff/sponsors), `/players/:slug` | `/:id/canonical-team`, `/players/:playerId/canonical-athlete` | Player detail lives under the Clubs prefix, not its own. |
| Players (`/api/players`) | `/` (filterable by sport/competition, or `q` name search) | — | |
| Sources (`/api/sources`) | — | `/` | Newsroom monitoring feeds — a different concept from the Data Platform's `Source` provenance model, see `UNDERDAWGS_DOMAIN_CONTRACT.md`. |
| Monitoring (`/api/monitoring`) | — | `/` | |
| Shows (`/api/shows`) | `/:slug` (one active show + published episodes) | — | No list endpoint — shows are few and named, reached individually. |
| Follows (`/api/follows`) | `/?anonymousId=` | — | Device-scoped, not role-gated. |
| Push (`/api/push`) | `/vapid-public-key` | — | Returns `null` if push isn't configured (no VAPID keys set). |
| Polls (`/api/articles/:articleId/poll`) | `/` (optional `anonymousId` to include the caller's own vote) | — | |
| Auth (`/api/auth`) | `/me` | — | Staff session (`ADMIN`/`EDITOR`). Returns the current session user, or `null`. |
| Fan Auth (`/api/fan-auth`) | `/me` | — | Fan account session, entirely separate from staff. Returns the current fan account, or `null`. `POST /register`, `/login`, `/logout` are all public writes, rate-limited same as staff login. |
| Uploads (`/api/uploads`) | — | (write-only, no GET) | |

## Notification events

`server/lib/events.js` (Wave 7, 2026-09-16) generalizes the one hardcoded push pathway that used to live inline in `competitions.js` (a fixture result → its followers) into a reusable "an entity was published → notify its followers" function per publishable entity. `notifyArticlePublished(articleId)` derives `{entityType, entitySlug}` targets from the Article's own `sport`/`competitions`/`clubs`/`players` relations and calls `server/lib/push.js`'s `sendPushToFollowers` — the same generic sink the fixture-result path already used. Wired into all three moments an Article actually becomes `PUBLISHED`: immediate publish (`POST /api/articles`), edit-triggers-publish (`PUT /api/articles/:id`), and the scheduled-publish cron (`server/jobs/publishScheduled.js`). An Article carrying an attached Episode (see `prisma/schema.prisma` — Episode has no status of its own, it publishes exactly when its Article does) gets a "New episode" title instead of "New story," same underlying event.

Every notification call is fire-and-forget and swallows its own errors — a delivery failure must never affect the publish response it's describing, same discipline `server/lib/push.js` already had.

## Sitemap and deep links

`GET /sitemap.xml` and `GET /robots.txt` (`server/routes/sitemap.js`, Wave 7, 2026-09-16) didn't exist at all before this. The sitemap lists the static top-level pages plus every Article (`PUBLISHED` only), Show (`isActive` only), Competition, Club, and Sport — the same five entities `server/routes/seoPages.js` already gives real server-rendered `<title>`/description metadata to. Player and Fixture/Match pages are deliberately excluded, same reasoning the Data Platform sibling repo's own sitemap uses: high-cardinality, still reachable via internal links from the pages that are listed. `SITE_URL` (env var, defaults to the real production origin) is the absolute base every `<loc>` is built from — the sitemap spec requires absolute URLs, and no prior `SITE_URL`/`BASE_URL` convention existed anywhere in this codebase before this.

Every public entity detail page uses a stable, consistent URL shape: `?slug=` for Article/Show/Competition/Club/Author, `?sport=` for the per-sport hub (`sport.html`), `?id=` for Match/Fixture (`match.html`) — never an internal database id where a slug exists.

## Where to look first

- **What a route actually does** → `server/routes/*.js` directly; it's a thin, readable layer over Prisma, same as the Data Platform's API.
- **What a field/model means** → `prisma/schema.prisma`'s own comments are the source of truth (extensive, kept current per this repo's convention).
- **Who can do what** → `server/middleware/auth.js`, and the table above.
- **The bigger picture** → `BLUEPRINT.md`, `UNDERDAWGS_DOMAIN_CONTRACT.md`.
