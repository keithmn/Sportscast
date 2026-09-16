# Newsroom Operations

The editorial workflow — for an editor/producer, not a developer. For the underlying content model, see `CONTENT_MODEL.md`. For deploy/infra, see `DEPLOYMENT.md`-equivalent notes in `BLUEPRINT.md`.

## Where to start each day

`/admin/dashboard.html` — an action-centre, not a resource list. Alert cards (red left border) surface first: failing monitoring sources, matches live or awaiting a result, finished matches with no report yet (Wave 9). Routine cards follow: draft/published article counts, new monitoring leads, submissions awaiting review, today's fixtures, episodes in edit, clips awaiting approval (Wave 9), scheduled stories.

## The monitoring → story pipeline

`SOURCE → LEAD → LLM ENRICHMENT → HUMAN REVIEW → STORY`. `/admin/monitoring.html` lists new leads (RSS/HTML/YouTube feeds, AI-triaged). A human always makes the final call on whether a lead becomes a real story — the AI enrichment step assists, it never publishes anything on its own.

## Writing and publishing a story

`/admin/articles.html` — create, tag (sport, competitions, clubs, players, tags), optionally attach a specific Fixture (a match report, distinct from the broader club/competition tags) or link a canonical Data Platform Event (unlocks the "Content for this Event" panel — see what else already exists for that same event, Wave 9). `DRAFT → SCHEDULED → PUBLISHED`; scheduled stories publish automatically via a cron job (see `JOB_RUNBOOK.md`) and trigger a push notification to followers of the tagged sport/competitions/clubs/players (Wave 7).

## Producing an episode (flagship show)

Tag the article `VIDEO_POST` with `videoSeries: "The Sportscast"` — a matching `Episode` record is created/kept in sync automatically. Upload the raw recording (`/admin/articles.html`'s episode section) to trigger transcription; once transcribed, AI suggests clip moments and social copy — every suggested quote is a verified, real substring of the transcript, never invented. Review suggested clips at `/admin/articles.html` per-episode, or `GET /api/episodes/clips/pending` for the cross-episode queue (Wave 9) — approve, reject, or cut a manual clip directly. An approved clip can then be rendered (burns in captions when the recording has them).

## Fixtures and scores

`/admin/competitions.html` — add/edit fixtures and scores directly, or bulk-import a season. Entering a `FINISHED` score for a followed club/competition triggers a push notification (Wave 3). As of Wave 9, a fixture can also be linked to its real Data Platform Fixture/Match (browse candidates between the two teams, if both are already canonically linked as Clubs→Teams) — once linked, the public Match Hub page prefers that verified score over the locally-entered one.

## Fan-facing features

- **Follows** — anonymous, device-based (no account needed); a `FanAccount` (Wave 7) adds a durable login on top of the same device identity, nothing more yet (no cross-device sync).
- **Push notifications** — opt-in via the site footer; delivered on a published story/episode (tagged to something the device follows) and a followed fixture's final score.
- **Polls** — one per article, created from the article editor, never auto-generated.
- **Search** (`/search.html`) — local site content plus a canonical (Data Platform) results section when a match exists there (Wave 9 §8.3); a Data Platform outage degrades to local-only results, never an error.

## What editorial staff should NOT need to do

Direct database access, `railway ssh`, or hand-editing JSON files — if a routine task requires any of these, that's a real gap worth reporting, not something to work around by hand.
