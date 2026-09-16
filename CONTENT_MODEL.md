# Content Model

Sportscast's own content — shows, episodes, clips, articles, events — how it's actually structured today, not how it was originally pitched. For canonical *sports* entities (owned by the separate Data Platform), see `UNDERDAWGS_DOMAIN_CONTRACT.md`.

## The core model: Article

Everything publishable is one Prisma model — `Article` — differentiated by `contentType` (`ARTICLE` or `VIDEO_POST`), not separate tables. See `BLUEPRINT.md` §4 for the full field-by-field breakdown (recently corrected — it used to describe a pre-Show-model architecture).

## Show → Season → Episode

A real Prisma model (`Show`/`Season`/`Episode`, added §25 2026-09-13). `Episode` is 1:1 with the `Article` that carries its title/dek/body/cover (`Episode.articleId`) — Episode only holds episode-specific fields: `hosts` (Author, many-to-many — always this newsroom's own bylined staff), `guests` (`EpisodeGuest`, a required name plus an optional `Player` link — most real guests, e.g. a federation official, will never have a `Player` row), `transcript`/`transcriptSegments`, `chapters`, `clips`, `socialAssets`, `sponsors` (`EpisodeSponsor`, deliberately separate from `Sponsor` — a shirt sponsor and a podcast sponsor are different relationships that happen to share a shape).

**One active Show as of Wave 9 (2026-09-16)**: "The Sportscast" (flagship). See `BLUEPRINT.md` §5 for why the 5 niche shows named in earlier project history are gone, not just dormant, and why `prisma/seed.js` no longer recreates them.

`Article.videoSeries` is the trigger: an editor tags a `VIDEO_POST` article with a show name, `syncEpisodeForArticle` (`server/routes/articles.js`) creates/updates the matching `Episode` row. Not a legacy leftover — the real, load-bearing mechanism.

## Content Transformation Engine (Clip pipeline)

`FULL EPISODE → TRANSCRIPT → CLIP CANDIDATES → HUMAN REVIEW → APPROVED CLIPS → RENDER`. `Clip.status`: `SUGGESTED` (AI's idea, unreviewed) → human `APPROVED`/`REJECTED` → `RENDERED` once actually cut. A `MANUAL` clip (an editor picked the range directly) skips straight to `APPROVED`. AI (`server/lib/contentEngine.js`, Claude) picks WHICH moments are shareable and WHY — it never writes caption text itself; every quote in a generated `SocialAsset` is verified as a real substring of the transcript before it's trusted, a fabricated one is silently dropped.

**Cross-episode visibility (Wave 9)**: `GET /api/episodes/clips/pending` — every `SUGGESTED` clip across every episode, one queue instead of checking each episode individually. Surfaced on the admin dashboard.

## Event → content graph

Sportscast has **no `Event` model of its own** — "Event" always means the Data Platform's canonical Event, reached via `CanonicalMapping` (`localEntityType: 'ARTICLE'`, `canonicalEntityType: 'Event'`). Only `Article` carries this link directly; `Episode` and `Clip` don't need their own (Episode is 1:1 with its Article, Clip belongs to that Episode — both are already reachable by walking the Article's link).

**"What media outputs exist for this Event?"** (Wave 9, 2026-09-16): `GET /api/articles/by-event/:canonicalEventId` — every Article linked to a given canonical Event, each tagged with whether it carries an Episode (and how many Clips) and/or a Poll. Surfaced as a "Content for this Event" panel on the article editor whenever a canonical Event is linked.

```
CANONICAL EVENT (Data Platform)
  ↑ CanonicalMapping (localEntityType: ARTICLE)
ARTICLE ──┬── EPISODE ──── CLIP(s)
          ├── EPISODE ──── SOCIAL ASSET(s)
          └── POLL
```

Not a general-purpose workflow engine — deliberately the minimum coherent model the directive asked for, not more.

## Match reports

`Article.fixtureId` — a direct, precise link to one specific Fixture (distinct from the broader Club/Competition tags, which are "this story covers KPL," not "this story is the report on this exact game"). Match Hub (`public/js/match.js`) shows this pinned above its existing tag-based "Related Coverage" heuristic. `GET /api/fixtures/missing-reports` (Wave 9) surfaces recently-finished fixtures with no linked report — a real gap the prior "live match" dashboard alert didn't cover (that only flagged matches still in progress, never ones that finished unreported).

## Poll (fan engagement)

One per Article, editor-created only (never auto-generated) — `Poll` → `PollOption`(s) → `PollVote`(s), anonymous voting via the same `anonymousId` device token Follow uses.
