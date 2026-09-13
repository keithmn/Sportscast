# The Sportscast — Project Blueprint & Handover Manual

**Written:** 2026-07-09
**For:** whoever picks this codebase up next
**What this document is:** the context a new coder needs that isn't visible just by reading the code — why things are shaped the way they are, what's deliberately *not* built yet, and where this is all supposed to go. Read this before changing anything structural.

---

## 1. What This Actually Is

**The company:** Underdawgs Rising Group is the parent — a small, founder-run group building several ventures (this media property, plus separate things like "The Rabbitat" and "A Million Bees"). Underdawgs is the producer/owner, not the consumer-facing brand.

**This repo:** "The Sportscast" — the flagship media property. It is **not** called "Underdawgs Sportscast." The brand hierarchy is deliberate: **The Sportscast is the dominant name everywhere** (nav, footer, meta tags); "by Underdawgs" appears only as a small attribution badge. If you find yourself making Underdawgs bigger or more prominent than The Sportscast anywhere, you've broken a specific, repeatedly-confirmed decision — don't "fix" it back without asking.

**The positioning — this has evolved, read carefully:** the site was originally built around **not being a news feed.** The founder's own early words: *"we are not bombarding everyone with every news but creating a true archive for every story, where we can look back, track impact and even follow up."* That produced a deliberately calm, sparse homepage — one flagship carousel, a static show grid, a 3-item news pointer, nothing else.

**That positioning was explicitly reversed on 2026-07-09,** after a structural critique against ESPN, Sky Sports, and SuperSport (§13) found every established sports-media reference runs dense, multi-section homepages — none of them are calm/sparse the way this site was. The founder's own words on seeing that data: *"let's go with industry level chaos but creatively so."* This is a real, deliberate decision, not scope creep — **don't revert the homepage to its earlier sparse state without a similarly explicit instruction to do so.** "Creatively" is still doing real work in that sentence: dense is now the target, generic is not — see §13's recommendations and the specific execution in §14 for what "creative" meant in practice (a distinctly-styled Shop promo band, not just another copy of the same teaser pattern, for one example).

**Shows remain the core engagement vehicle** regardless of homepage density — one flagship long-form conversation (The Sportscast) plus five sport-specific weekly shows, distributed short-form on social and long-form on YouTube. That part of the identity didn't change; only how much else surrounds it on the homepage did.

---

## 2. Architecture, As Built

*(Rewritten 2026-09-13 — the version of this section below had drifted badly: it still described a 4-route, single-sync-engine, index.html-has-its-own-stylesheet version of the app. None of that is true anymore. See §J of the founding-team audit artifact for the full independent audit this correction is based on.)*

**Stack:** Node.js + Express + Prisma (SQLite) + vanilla HTML/CSS/JS. No frontend framework, no build step. Still intentional, still true — nothing in the growth below changed that call.

```
server/
  index.js              — app entrypoint: session, 11 mounted routers, static serving, 7 node-cron schedules
  db.js                 — Prisma client singleton
  middleware/auth.js     — requireAuth()/requireRole() session-based guards
  routes/
    auth.js, articles.js, taxonomy.js (sports/tags/authors), competitions.js, fixtures.js,
    submissions.js, clubs.js, players.js, sources.js, monitoring.js, shows.js — all mounted.
    shop.js, orders.js — NOT mounted (retired for legal reasons, see §7) — left on disk, dormant.
  jobs/                  — 7 scheduled jobs: syncLeagues, syncSquads, syncKenyaCup, syncTheSportsDB,
                            syncBallDontLie, runMonitoringFetch, runMonitoringEnrich
  utils/slugify.js

prisma/
  schema.prisma          — 21 models: auth/taxonomy, Article (+Show/Season/Episode, §5), Competition/
                            StandingRow/Fixture, Team/Kit/Order (shop, dormant), Submission, ChangeLog,
                            Club/Staff/Sponsor/Player, Source/MonitoredItem (newsroom monitoring engine)
  dev.db                 — SQLite (gitignored). Production path is /data/dev.db, on a Railway persistent
                            volume — confirmed actually attached and in use, not just assumed.

public/
  ~17 pages: index, article, sport(s), competition, club(s), player, show(s), scores, news, shop
  (dormant), order-confirmation (dormant), and others.
  css/site.css           — the ONE shared stylesheet, used by every page including index.html.
  js/                     — ~20 page/shared-component scripts, no shared framework.
  admin/                  — newsroom CMS: articles, competitions, clubs, submissions, monitoring,
                             sources, sports. shop/orders admin pages exist but are unlinked from the
                             sidebar (their APIs aren't mounted).
```

**index.html DOES share `site.css` now** — the old note below claiming otherwise (and the "change things in two places" warning) describes a state that was fixed a while ago and never corrected in this doc. Confirmed by direct inspection: zero `<style>` tags in `index.html`.

**The newsroom monitoring engine exists and isn't described anywhere else in this file** — `Source`/`MonitoredItem` models, `routes/sources.js` + `routes/monitoring.js`, RSS/HTML-scrape/YouTube-channel ingestion (`runMonitoringFetch.js`) and Claude-Haiku-based triage (`runMonitoringEnrich.js`). Nothing it finds reaches readers automatically — an editor must hit "Promote" on `admin/monitoring.html`, which creates a DRAFT article. If you're looking for where AI touches this codebase, this is it, and only this.

**Run it:**
```bash
npm install
npm run prisma:migrate   # or: npx prisma migrate deploy (schema already exists)
npm run seed
npm run dev              # http://localhost:3000
```
Demo logins (password `underdoggs2026`): `admin@underdoggs.co.ke`, `editor@underdoggs.co.ke`.

**Env vars** (`.env`): `DATABASE_URL`, `SESSION_SECRET`, `PORT`, `SITE_BASE_URL`, `FOOTBALL_DATA_API_KEY`, `THESPORTSDB_API_KEY`, `BALLDONTLIE_API_KEY`, `FLW_SECRET_KEY`/`FLW_SECRET_HASH` (Flutterwave — currently unreachable, §7), `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY`, plus optional `*_CRON` overrides for every scheduled job. `API_FOOTBALL_KEY` still exists in `.env` but is **dead** — evaluated and rejected in favor of Wikidata (stale data, non-commercial terms) — zero code references it. Harmless, but delete it if you're cleaning up. (The older `DATA_SERVICE_URL` var this section used to mention is gone entirely — not even present in `.env` anymore.)

**Known, unfixed as of 2026-09-13** (see the founding-team audit artifact for full detail): `MemoryStore`-based sessions were replaced with a disk-backed store (`session-file-store`, keyed off the same directory as the SQLite file) as part of that audit's Wave 0 — admin logins now survive a redeploy. A stored-XSS gap in `admin/js/monitoring.js` (unescaped scraped `externalUrl` in an href) was also fixed the same pass. Still open: no automated tests exist anywhere in this repo; a CI workflow (`.github/workflows/ci.yml`) now at least catches a broken migration or a boot-time crash, which is a floor, not coverage.

---

## 3. Brand System — The Visual Code

A separate document, **"The Underdawgs Visual Code v1.0,"** governs the whole company's visual identity (not just this site) — logo construction, mascot rules, color/type DNA. If you're doing any brand/logo work, read that doc first; it's the source of truth for the *family* system. This section covers what's actually implemented in *this* codebase, including where it deliberately diverges from that doc.

**Color system** (`:root` in both `site.css` and `index.html`):
```css
--bg-primary:    #090B0F;   --bg-surface:   #121820;   --bg-elevated: #1A2233;
--brand-gold:    #F2A20C;   --brand-brown:  #8B5E3C;   --border:      #1E2535;
--text-primary:  #F5F0E8;   --text-secondary: #7A8494; --success:     #2D7A55;
--danger:        #C13422;
```
**There is no brand-red.** It was removed deliberately (2026-07-07) once the Visual Code doc established the real family palette (gold/brown/black/white, pulled from the parent bulldog mark's coat colors). `--danger` keeps the old red *hex value* but is scoped **only** to two true UI-semantic states — form validation errors and "disputed" data-confidence pills — not brand identity. Don't add red anywhere else; don't remove `--danger` either, it's doing a real job.

`--brand-gold` is for text accents, thin borders, decorative lines (works because it's on a dark background). `--brand-brown` is for solid button fills (gold-background-with-light-text has bad contrast; brown doesn't).

**Logo lockup** ("Type B" in Visual Code terms): "THE SPORTSCAST" wordmark, with a small "by Underdawgs" badge **floating above the top-right corner** — not stacked below, not a "kicker" above the headline. This was tried both ways (three different treatments, actually) and the corner-badge was the founder's confirmed final choice after comparing them side by side. **The written Visual Code doc still describes a different structure (kicker-above-headline) — the doc is stale, not the code.** If you're asked to formalize the doc, update it to match what's shipped, not the reverse.

Implementation: `.logo-wrap` (`position: relative`) wraps the wordmark; `.logo-badge` (`position: absolute; top; right; transform: translateY(-100%)`) floats the badge. Exists in `site.css`, `index.html`'s own styles, and the markup `renderNav()` generates in `site.js`.

**Typography:** Barlow Condensed (900 weight for headlines/wordmarks) + Inter (body/UI). Both loaded via Google Fonts `<link>` tags in every page's `<head>`.

---

## 4. Content Model

Everything is one Prisma model — `Article` — differentiated by fields, not separate tables:

| Field | Meaning |
|---|---|
| `contentType` | `ARTICLE` (a written feature) or `VIDEO_POST` (an episode) |
| `videoSeries` | which show this episode belongs to — e.g. `"The Sportscast"`, `"The Ruck"` — **this is the entire mechanism that makes "Shows" work**, there is no Show database table |
| `sportId` | the sport this content is tagged under — see §5 for why this is a *different* dimension from Show |
| `episodeLabel`, `runtimeLabel` | `"Episode 023"`, `"15 min"` — display-only, video posts |
| `tags` | many-to-many; current tags are `Feature`, `Transfers`, `Analysis`, `Interview` |

**Querying:** `GET /api/articles?contentType=VIDEO_POST&videoSeries=The%20Sportscast&limit=1` is how the homepage finds "the latest flagship episode." Every show page works this exact way — filter by `videoSeries`.

---

## 5. Shows vs. Sports — Read This Before Touching Either

This distinction has come up repeatedly and is easy to get backwards:

- **A Show is a packaging/product decision.** It's what you'd pitch to a sponsor or put on a YouTube thumbnail. Defined entirely in `public/js/shows-data.js` — a plain array, **not a database model**. Six shows, fixed: The Sportscast (flagship), The Hydration Break (football), The Ruck (rugby), Bully Off (hockey), Fast Break (basketball), The Circuit (athletics + boxing + martial arts + darts — deliberately one show covering four disciplines).
- **A Sport is a data-tagging dimension**, kept granular even when a Show bundles several. Boxing, Martial Arts, and Darts each have their own `Sport` row in the database even though they all ship under one show (The Circuit) — collapsing them would make search/stats for boxing specifically impossible.

If a seventh show gets added: add an entry to `shows-data.js` (slug, name, videoSeries, color, tagline, description, coverImageUrl), *not* a migration. If an eighth sport gets added (say, swimming): add it to the `sportNames` array in `seed.js`/create it via the taxonomy API — it doesn't need a show.

**Show accent colors** (used for card borders, header banners): gold `#f2a20c` (flagship), green `#3a7d3a` (football), teal `#1F7A6C` (rugby — was red originally, changed to stay off the removed brand-red), blue `#3d6fa3` (hockey), brown `#a35b3d` (basketball), purple `#7a4a9e` (circuit).

---

## 6. Images

Convention documented in `public/images/README.md` — read it, it's short. Summary: drop a file at an exact expected path (`hero.jpg`, `og-default.jpg`, `shows/<slug>.jpg`) and it appears automatically; every slot has a graceful CSS fallback if the file is missing, so nothing breaks if you don't have a photo yet.

**Current state is honest, not finished:** the flagship, hero, and two niche shows (Hydration Break, The Ruck) have *real, correctly-matched* photography (actual Kabras Sugar rugby and Gor Mahia FC shots, plus the actual Sportscast team's own planning-session photo on the flagship card). **Bully Off, Fast Break, and The Circuit have real photos that are NOT sport-matched** — they're rugby-event photos used as placeholders because they were the only real (non-stock) photos on hand at the time, with an explicit understanding they'd be swapped later. Don't mistake "there's a photo there" for "this is correct" on those three.

**A real, recurring gotcha:** phone photos arrive sideways with no reliable EXIF orientation tag, and the correction isn't consistent — different shots from the same phone/session have needed 90°, 180°, or 270° rotation via `sips -r`. Always visually re-check the result; never assume one rotation value works across a batch.

---

## 7. What Was Deliberately Removed (and why it might come back differently)

Until 2026-07-08, this site proxied to a **separate service**, "Underdoggs Data" (a different app, different port, different database — `/Users/test/Downloads/underdoggs-data`), for team/player/transfer/standings data. That included: `transfers.html`, `team.html`, `player.html`, five proxy routes, a `dataService.js` utility, and sections of `sport.html`.

**All of it was removed.** The founder's call: this site should be a **purely media/content property**, with zero live dependency on a second service. If you're asked to add "team pages" or "player profiles" or "a transfers page" back — that's a real architectural decision to re-litigate, not a default. Ask first.

The underlying ambition **isn't dead, it's reframed** — see §10. The local Prisma schema was already CMS-only before this removal (Article/Sport/Author/Tag/User) — there was never a Team/Player/Transfer table *in this database* to begin with, so removing the proxy left no orphaned schema behind.

**Known small leftovers from the removal**, safe to clean up whenever convenient, not urgent:
- `DATA_SERVICE_URL` in `.env` is unused.
- `taxonomy.js` still checks for a `STEWARD` role in one `requireRole()` call — a leftover from when the (now-separate) data service had its own steward accounts. Harmless since no user ever has that role, but dead reference.
- `confidencePill()`/`formatMoney()` helper functions in `site.js` are now unused (they existed to render transfer-confidence pills and money amounts).

---

## 8. Naming Debt (cosmetic, not urgent)

CSS classes `.btn-red`, `.btn-sm-red`, `.nl-btn` render **brown**, not red — they kept their original names when the color system changed rather than triggering a repo-wide rename. Functionally fine, just don't be confused reading the class name.

`.btn-link` is a different, slightly worse case — it's referenced in markup (`index.html`, `scores.js` ×2) but **has no CSS rule defined anywhere**. It renders as unstyled default anchor text everywhere it's used. Found during the 2026-09-13 audit; not yet fixed — either define it or stop referencing it, don't add a third option.

Similarly, the homepage's small news teaser still uses `.archive-list`/`.archive-teaser-*`/`.archive-item*` CSS class names and an `#archive-list` element id, left over from when that section was called "From the Archive" and Archive was still its own page (§11). It now shows briefs, not archive features. Functionally fine, same story as above — don't be confused by the name.

---

## 9. Do / Don't, Distilled

**Do:**
- Keep `site.js`'s `renderNav()`/`renderFooter()` as the single source of truth for nav/footer on every page except `index.html` (which hardcodes its own).
- Check `shows-data.js` before assuming a show needs a database change.
- Keep the Archive/Shows-as-engagement model; resist adding homepage feed-style sections.
- When adding a color, ask whether it's brand identity (gold/brown family) or UI-semantic (danger/success) — don't blend the two purposes.

**Don't:**
- Don't reintroduce red as a brand color.
- Don't re-wire a separate data service into this site without treating it as a real decision.
- Don't make "by Underdawgs" bigger, bolder, or more prominent than "The Sportscast."
- Don't add a literal "News" section/feed to the homepage.
- Don't assume the written Visual Code doc's Type B lockup spec matches this code — it doesn't, this code is the current truth (see §3).

---

## 10. Roadmap — Toward "God Mode Sports Tech Vendor"

This is the long-horizon vision, sequenced so a lean team can actually get there instead of drowning in scope. Four ideas were deliberately scoped and then **shelved** by the founder until the core media operation (this repo) is running smoothly with a real show cadence. Don't proactively build these — but understand them, because the current architecture was shaped with them in mind.

### Phase 0 — Where we are: stabilize the core media house
Full show cadence across all six shows, real (sport-matched) photography everywhere, the Archive genuinely accumulating stories. This phase isn't fully done — three shows still have mismatched placeholder photos (§6) — but the News and Scores & Fixtures gap is now resolved; see §11–§12.

### Phase 1 — Cheapest upgrades first (from the venture roadmap)
1. **AI-assisted clipping pipeline.** Transcribe existing show recordings (Whisper), have an LLM flag the 3–5 most shareable 30–75s moments, cut with ffmpeg, burn in captions. Serves the "flagship podcast, widely distributed in short-form" strategy directly, costs almost nothing, and becomes the production engine for #2.
2. **Athlete media pilot.** Use the clipping pipeline to produce personal highlight packages for ~5 real athletes already appearing on the shows, co-branded, given to them to post under their own name — no fee, no platform yet, just validating whether there's commercial appetite before building anything bigger.

### Phase 2 — The data venture, reframed (the big moat play)
Originally scoped as a "digitized scouting/stats layer," this has since been reframed more ambitiously as a **scouting / agency / information silo about players** — not just passive stats, but potentially: (a) scouting data clubs/agents would pay for, (b) an athlete-agency function connecting directly back to Phase 1's athlete-media work, (c) a sellable reference product independent of the media site. This is explicitly the *separate* "Underdoggs Data" venture (§7) — build it as its own product with its own database, don't re-wire it into this site casually. The realistic entry point: pick one currently-undocumented competition (e.g. Kenya's National Super League, since KPL already has partial external coverage from providers like TheSportsDB), and have journalists already covering it file a basic structured stat sheet as a byproduct of being there. This only pays off after multiple seasons of accumulated depth — start it early, expect zero near-term revenue.

### Phase 3 — Public-funds / governance data tooling
The most category-defining and least-contested idea on the list — nobody globally has this well solved, so building it isn't catching up to competitors, it's originating a category. Don't start by building a tool; start with **one real investigative story** (a specific county stadium project, a specific Sports Fund grant cycle) using the newsroom's own journalism. Only build a recurring public database/dashboard if that story surfaces genuinely structured, reusable data. Highest legal/reputational sensitivity of anything on this roadmap — needs real editorial rigor, likely legal review before publishing.

### Phase 4 — The actual "god mode" end-state
What "god mode sports tech vendor" concretely means, once Phases 1–3 compound rather than stay separate: **the entity Kenyan sport runs on** — media distribution (the shows), proprietary structured data no one else has (Phase 2), direct athlete relationships (Phases 1+2 together), and public-interest credibility (Phase 3) reinforcing each other. Concretely, capabilities worth aiming at once the foundation exists (informed by what exists in mature markets but not yet in Africa):
- Structured scouting data covering leagues Wyscout/InStat don't reach — the single highest-leverage, least-contested gap identified.
- A verified athlete directory letting brands find and sponsor players directly, bypassing today's opaque agent arrangements.
- AI-assisted highlight generation as a service other African media houses could license, not just an internal tool.
- **Deliberately avoid** chasing live-tracking/wearables hardware or betting-data-feed infrastructure near-term — both pull the company from being a media/data business into being a hardware or regulated-data-vendor business, which is a different (and harder) company to run. If either ever gets pursued, treat it as a distinct, deliberate strategic choice, not a natural extension.

---

## 11. News & Articles (formerly split into "News" + "Archive")

Added 2026-07-09 as two separate pages (News for briefs, Archive for features) to resolve the "do we need a news section" question. **Merged into one page the same day** once it became obvious the two pages were visually indistinguishable as shipped — same row template, same filter mechanism, the only difference (`isBrief` true/false) invisible to a visitor. Two lookalike nav items was worse than one honest one.

**Current shape — one page, `/news.html`, two visually distinct zones, one shared sport filter:**
- **Latest** — brief-flagged articles (`isBrief: true`), compact dense rows, no images, timestamp-forward. The fast lane.
- **Stories** — everything else (`isBrief: false`, `contentType: ARTICLE`), richer image-forward cards. The deep, produced features — this zone *is* what used to be the standalone Archive page; the "permanent record, not a feed" philosophy still applies here, it just doesn't have its own nav item anymore.
- Still nothing new in the database beyond the one `isBrief` boolean — no new model, one page instead of two.

**The homepage's small teaser** (`#stories` section, `archive-list`/`archive-teaser-*` CSS class names — yes, the class names still say "archive," that's cosmetic naming debt now, see §8) was deliberately narrowed to **briefs only, 3 items, nothing else** — a considered decision, not a default, made explicitly to avoid the homepage quietly re-accumulating a features carousel on top of it. If a future request pushes to also tease Stories on the homepage, that's reopening a question that's now been visited four times in this project's life; treat it as a real, deliberate decision each time, not a small addition.

**Guardrail worth repeating if this comes up again:** News is meant to stay editorially written by the newsroom, not become an automated wire-scrape of third-party headlines. That's a materially different (and riskier — rights, editorial-voice dilution) decision, not a natural next step for this feature.

## 12. Scores & Fixtures

Also added 2026-07-09, in response to a real gap: visitors expecting "the home of Kenyan sport" want live standings and fixtures, which the media-only site had nothing for after the Underdoggs Data removal (§7). Rather than re-wiring that removed service back in, or waiting on a paid third-party API, this shipped as **new, lightweight, site-native models**: `League`, `StandingRow`, `Fixture` (see `prisma/schema.prisma`).

**Deliberately minimal, on purpose:** teams are plain strings on each row (`teamName`, `homeTeam`/`awayTeam`), not linked `Team` records — reviving a Team entity is exactly the complexity §7 removed, and it's not needed just to show a table and a fixture list. That's the separate data venture's job (§10, Phase 2) if it ever happens.

**Why this shape, specifically:** the same internal shape (`StandingRow`/`Fixture`) can be populated two different ways without the frontend or admin UI knowing or caring which: manual entry via `/admin/scores.html` (the only option today, and the *only ever* option for sports with no public data feed, like rugby and athletics), or — later, only if/when a paid API is actually subscribed to — a server-side job that fetches from a provider and writes into the same tables. **Nothing here currently calls an external API.** Football was chosen as the only sport covered because it's the only one with realistic third-party data options confirmed by earlier research in this project (TheSportsDB, API-Football); rugby and athletics have no official feed, full stop — don't build toward faking coverage for them.

**Honesty was a deliberate constraint on the seed data, not an oversight:** `seed.js` creates the "Kenyan Premier League" league record but seeds **zero** standings rows and **zero** fixtures — fabricating current-looking scores to make a demo look populated would be exactly the "faking comprehensiveness" this feature was built to avoid. Real data goes in via `/admin/scores.html`, entered by the newsroom, whenever this actually ships to a real audience. If you find yourself wanting to seed "realistic" scores for a demo, don't — leave the honest empty state and note it in the sub-copy instead, exactly as the current `/scores.html` does ("Standings haven't been entered for this league yet").

The nav is: **Shows, News & Articles, Scores & Fixtures** — plus About. (Archive as a separate nav item is gone — folded into News & Articles, §11.)

---

## 13. GRM Daily Reference (2026-07-09)

Keith asked to study grmdaily.com (an established UK music/street-culture outlet) for color code and structural ideas. Findings, and what was actually done with them:

**Color palette** — pulled from GRM's live theme CSS directly (not guessed from a screenshot): primary bg `#1e1e1e`, surface `#252525`, accent gold `#fbbc1e`, secondary text `#aaa`, all warm-neutral with no blue tint. Our previous tones (`#090B0F`/`#121820`/`#7A8494`) had a cool navy undertone. **Adopted GRM's exact tones** into our existing variable structure: `--bg-primary: #1E1E1E`, `--bg-surface: #252525`, `--bg-elevated: #2E2E2E`, `--brand-gold: #FBBC1E`, `--text-secondary: #9A9A9A`, `--border: #383838` — in both `site.css` and `index.html`'s duplicated `:root`, plus the flagship show's accent in `shows-data.js`. `--brand-brown` and `--danger` untouched (GRM only has one accent color; we kept our gold+brown family from the Visual Code doc rather than collapsing to their single-accent pattern). Worth noting: an established real outlet in an adjacent space independently converged on almost the same "dark charcoal + gold" formula already chosen from the bulldog logo — validation, not coincidence to ignore.

**Footer social icons** — copied GRM's specific treatment: bigger icons (26px, was 18px), full-color by default (`--text-primary`, was muted `--text-secondary`), simple color-only hover transition to gold (removed the lift/translateY we had), more generous spacing (2rem gap, was 1.25rem). Also copied their footer-darker-than-body grounding effect — `.footer` background is now pure `#000` instead of `--bg-surface` (which was actually *lighter* than the page, the opposite of GRM's intent). Scoped to `index.html` only — secondary pages use the much simpler `.footer-simple` (site.css), no social icons there to begin with.

**Featured carousel** — GRM's homepage leads with a 4-item featured carousel above their latest-stories feed. Replaced the single static flagship-episode card with a scroll-snap carousel of up to 4 recent flagship episodes (`js/home.js`'s `loadFlagshipCarousel`, `limit=4`). Built with **plain CSS scroll-snap + manual `scrollTo()` — no carousel library** (Swiper, Splide, etc.), consistent with this repo's stated no-framework/no-build-step architecture (§2). Degrades gracefully to 1–3 slides if fewer episodes exist; arrows hide under 640px width since native touch swipe covers mobile. Seeded 3 additional flagship episodes (`prisma/seed.js`) specifically so this has real slides to test, not just the fallback markup.

**Not done, presented as options only:** GRM's nav has 10 flat (non-dropdown) items — noted as "copy the flatness, not the volume," no nav changes made. Their YouTube presence is just a small icon in header+footer, no dedicated section — already matches this site's approach, no change needed.

**Known verification gap:** the carousel was checked at the code level only — HTML tag balance, exact ID matching between markup and `home.js`, and CSS selector scoping were all manually traced and confirmed correct, and the API confirms 4 episodes return in the right order. It was **not** visually screenshotted in a real browser — Playwright's Chromium has been unreliable in this environment all session (corrupted/incomplete downloads, confirmed non-functional as recently as this same task). If picking this up and something looks visually off in the carousel despite the API/DOM checks passing, that's the most likely gap to check first.

---

## 14. Executing the "Industry Chaos, Creatively" Decision (2026-07-09)

Same day as §13's critique, in one continuous round of changes, acting on its recommendations plus two new business-line asks:

**Both tickers now gone.** The sports-category one (§13) and the athlete/team-names one that shared its CSS — removed on the strength of the 0-for-3 finding across every reference site checked. CSS fully cleaned up, not just hidden.

**"Latest episode" signal on every niche show card.** A shared `loadLatestBadges()` helper (`site.js`) fetches each show's most recent episode and injects "Episode 023 · 3 days ago" — used identically by `shows.js` (shows.html) and `home.js` (homepage), so both surfaces got the fix from one function. Falls back to removing the badge slot entirely if a show has no episodes yet, never shows a broken/empty badge.

**A small homepage Scores teaser** — top-3 standings rows, football-only, explicitly labeled, same visual weight as the News strip (reuses `.archive-item` styling directly). Honest empty state ("Standings haven't been entered yet") since the league still has zero seeded rows, exactly per the no-fake-data rule in §12.

**Shop — a coming-soon page, deliberately not a commerce build.** The founder floated a real vision (club merch partnerships + direct equipment supply) but that's a large, separate scope — payments, inventory, club agreements — that deserves its own dedicated conversation, the same way the data venture (§10 Phase 2) got its own scoping rather than being built ad-hoc. What shipped: `/shop.html` (explicitly says "not live yet, nothing for sale"), an email-waitlist capture, and a visually distinct homepage promo band (`.shop-promo-section` — gradient background, radial gold glow, two-column layout) deliberately styled differently from the site's other flat teaser sections, per the "creatively" half of the founder's instruction. **If asked to "build the shop," clarify whether that means the real commerce backend (a genuinely large scope) or another pass on this waitlist page** — don't assume.

**About section replaced with Contact / Submit a Tip / Work With Us.** One tabbed form (`.contact-tabs`), three `type` values (`CONTACT`/`TIP`/`PARTNERSHIP`) posting to the same endpoint — switching tabs just changes what the message field asks for and what type gets submitted, not the underlying mechanism. The old mission copy's short quote ("Kenya's stories. Kenya's sport. Finally, a home.") was kept as a lead-in for brand continuity; the longer paragraphs and the three stat blocks (6 Shows, Season One, Mission) were dropped, since the section's job changed from "explain who we are" to "let people reach us."

**New backend: `Submission` model, one shared inbox for all four types** (the three above plus `SHOP_INTEREST` from the Shop waitlist) — `type` is the only thing distinguishing a contact message from a tip from a partnership inquiry from a waitlist signup, deliberately, rather than four separate tables. `server/routes/submissions.js` (public POST, admin-gated GET/PUT), `admin/submissions.html` + `admin/js/submissions.js` (a table with a "Mark Reviewed" action). Tested end-to-end with real submissions through every path (waitlist form, all three contact tabs, admin mark-reviewed) before being cleaned back out of the dev database — same discipline as the Scores & Fixtures test data in §12.

**Nav is now:** Shows, News & Articles, Scores & Fixtures, Shop, Contact.

---

## 15. If You Only Read One Section

§1 and §2's "don't" list, plus this: **the founder is deliberately running this as a lean media house, not a funded startup with a large team.** Every architecture decision in this codebase — vanilla JS over a framework, one Article model instead of five content-type tables, the data-service separation — optimizes for "one or two people can hold this whole system in their head," not "scale to a large engineering team." Match that when you extend it.

## 16. Toggle Navigation, Global Scores, Live Shop Rebuild (2026-08-19, in progress)

A client-directed rebuild, staged across five phases (A–E). Phases A–C are
done as of this writing; Shop (D) and checkout (E) are not yet built.

**Phase A — shared infra.** The footer is consolidated: `index.html` used
to hardcode its own rich footer (logo, socials, footer-nav) while every
other page got a bare one-line `.footer-simple` from `renderFooter()` in
`site.js`. Now `renderFooter()` is the one shared footer everywhere, and it
also carries the Contact/Tip/Partnership form (`initContactForm()`,
relocated from `home.js`) — Contact dropped out of top-level nav in favor
of living in the footer on every page. `index.html` now links `/css/site.css`
(it never did before) so the shared footer/contact CSS actually applies to
it; its own inline `<style>` still wins on anything it redeclares itself
(nav, buttons, colors), since it loads after. New `category-toggle.js`: a
shared "pick a category, see its items" component (top-level pills reuse
the exact filter-pill mechanism `news.js` already had; the nested items
panel underneath is the new part) — built once, used by Shows, Scores, and
eventually Shop, rather than three one-off implementations. `League` gained
`region` (KENYA | GLOBAL), `externalProvider`/`externalId` (which API,
which competition code), `lastSyncedAt`/`syncStatus`. `Fixture` gained a
`(leagueId, homeTeam, awayTeam, kickoff)` unique constraint so a sync job
can upsert instead of wholesale-replacing fixtures the way standings do.

**Phase B — Shows + News toggles.** Shows now groups its 5 niche shows by
sport category (Football/Rugby/Hockey/Basketball/the Circuit bundle) using
`category-toggle.js`; the flagship stays a separate, always-visible card
above it, exactly as before — never part of the toggle. News needed no
code change: its existing sport-only filter-pill already did exactly what
was asked, and the client explicitly said no location/country dimension
should be added to it.

**Phase C — Scores schema + sync.** Seeded a second Kenyan league,
National Super League (football's second tier — shares the existing
Football `Sport` row, since Sport means "what sport," not "what tier"),
plus 12 `region: GLOBAL`, `source: API` leagues mapped to football-data.org
competition codes (their free tier: 12 competitions, 10 calls/minute,
delayed not live data — reconfirm this list against their current coverage
before relying on it long-term, free-tier lists do change). New
`server/jobs/syncLeagues.js`: paces calls ~6.5s apart to stay under the
rate limit, standings via the same delete-all-then-recreate transaction
the admin route already used, fixtures via upsert (so POSTPONED/manual
edits on a synced fixture survive the next sync). Only ever touches
`source: API` leagues — KPL/NSL are never written to by this job. No-ops
with a warning (doesn't crash) if `FOOTBALL_DATA_API_KEY` isn't set — see
`.env`, get a free key at football-data.org. Scheduled via `node-cron`
every 30 minutes from `server/index.js`; also runnable directly via
`npm run sync:leagues`. **`/scores.html` rebuilt**: sport-category toggle
at the top (today that's just "Football," since no other sport has real
league data yet); within a sport, Kenyan leagues render fully expanded by
default (not hidden behind a click — the client's explicit ask was that
they not get lost in a longer global list), with global leagues reachable
via a secondary single-select picker underneath, lazy-loaded one at a time
rather than fetching all 12 upfront.

**Not yet built**: Shop (Team/Kit models, sport→team→kit browsing) and
checkout (Order/OrderItem, Flutterwave integration) — Phases D and E.
Blocked on nothing structural, but E specifically needs a real Flutterwave
merchant account from the client before it can go past test-mode keys.

## 17. Phase D — Shop Catalog Goes Live (2026-08-19)

The Shop is no longer a waitlist page. New models: `Team` (name, slug,
sportId, optional leagueId, optional crestUrl) and `Kit` (teamId, label —
free text, open-ended, not fixed to Home/Away — priceKesCents, optional
photoUrl, optional sizesAvailable CSV). `Kit.photoUrl` is nullable
deliberately, matching `Article.coverImageUrl`'s existing honest-empty-
state pattern — a missing kit photo renders "Kit photo to be added," not a
broken image or a faked one.

New `server/routes/shop.js` (`/api/shop`): public `GET /teams` (optional
`?sport=` filter) and `GET /teams/:slug`, admin CRUD for both Team and Kit
— same `requireRole('ADMIN','EDITOR')` gate as everything else. New admin
page `admin/teams.html` + `admin/js/teams.js`, matching `admin/scores.html`'s
visual/structural pattern exactly (a "card" per team, inline editable rows
for its kits, add/save/delete per row) — added to every existing admin
page's sidebar.

**Public `/shop.html` rebuilt**: sport-category toggle (via
`category-toggle.js`, same component Shows and Scores use) → a team card
grid → clicking a team lazy-loads and expands its kit tiles (photo, label,
price) in place, no page navigation. **Checkout is not built yet** — the
page copy says so explicitly ("Checkout is coming soon — browse what's
available now"), matching this project's consistent refusal to imply a
capability that doesn't exist. The homepage's Shop promo band, previously
a waitlist form ("Coming Soon"), now just links to `/shop.html` ("Now
Open") — `initShopPromoForm()` and the old `#shop-promo-form` markup are
gone; the old dedicated `shop.js` waitlist-only script was replaced
outright (not extended) since the whole page's job changed. `SHOP_INTEREST`
stays a valid `Submission` type (Contact/footer form dropdown) even though
nothing currently posts to it automatically — a person could still submit
one through the general Contact channel if they want to.

**Seeded 4 real KPL teams** (Gor Mahia FC, AFC Leopards, Tusker FC,
Kakamega Homeboyz — the same four clubs already named in this seed data's
articles/episodes, kept consistent) each with Home + Away kits at a
placeholder price (KES 4,500) and no photo yet. NSL teams deliberately
NOT seeded — left for the admin to add once a confirmed current-season
roster is in hand, rather than guessing at lower-tier club names.

**Not yet built**: Phase E — `Order`/`OrderItem` models, Flutterwave
checkout (cart → order → hosted payment → webhook confirmation). Needs a
real Flutterwave merchant account before it can go past test-mode keys.

## 18. Phase E — Checkout Goes Live (Flutterwave, sandbox mode) (2026-08-19)

New `Order`/`OrderItem` models. No customer-account model — guest checkout
by name/email/phone, same precedent as `Submission`. Cart is client-side
only (`public/js/cart.js`, `localStorage`) — the server never sees it until
checkout is submitted, and never trusts client-sent prices: `POST
/api/orders` re-computes `totalKesCents` from each `Kit.priceKesCents` in
the database, snapshotting it onto `OrderItem.unitPriceKesCents` so a later
price change doesn't rewrite historical order totals.

**Flow**: Shop page → "Add to Cart" on a kit tile (size selector appears if
`sizesAvailable` is set) → cart section at the bottom of `/shop.html` shows
items + a checkout form (name/email/phone, phone required for M-Pesa STK
push) → submitting POSTs to `server/routes/orders.js`, which creates the
`Order` (`PENDING`) then calls Flutterwave's `/v3/payments` endpoint
server-side (secret key never touches the browser) and returns a hosted
checkout link → browser redirects there, cart is cleared client-side
immediately (the order already exists server-side) → Flutterwave handles
card 3DS and M-Pesa STK push natively → redirects back to
`/order-confirmation.html?orderId=...`, which **polls** `GET
/api/orders/:id` every 3s rather than trusting the redirect alone.

**The redirect is UX, not proof of payment** — `POST /api/orders/webhook`
is the authoritative source, verified against `FLW_SECRET_HASH` (a value
you set yourself in Flutterwave's dashboard webhook settings, matched
against the `verif-hash` request header) before anything in the body is
trusted; unsigned or mismatched requests get a 401, verified end-to-end
locally with a temporary test hash. Admin `admin/orders.html` lists every
order (date, customer, items, total, status) — no delete route, orders are
a permanent record like a real receipt, not something to tidy away.

**What actually needs the client**: `FLW_SECRET_KEY` and `FLW_SECRET_HASH`
in `.env` — free sandbox signup at
https://dashboard.flutterwave.com/signup, test keys under Settings > API
Keys. Without them, `POST /api/orders` still creates the order (status
`PENDING`, verified directly) but returns a clear 500 instead of silently
faking a successful checkout — confirmed this exact behavior end-to-end.
Live keys are a separate, later cutover once there's a real merchant
account — don't assume sandbox and live are interchangeable beyond the key
swap; Flutterwave's own dashboard is the source of truth for what else
that involves (business verification, settlement account, etc.).

This closes out the five-phase rebuild (§16–18): toggle navigation
(Shows/Scores/Shop all share `category-toggle.js`), Scores gone Kenya-first
+ global via football-data.org, and a real Shop with checkout. Nothing
here has been pushed to the `Maltilda-Nyaboke/Sportscast` GitHub remote yet
— ask before doing so, it's not the account this work was done under.

## 19. Scores & Fixtures Intake System (2026-08-19)

Manual entry for KPL/NSL got three real upgrades, aimed at "build a
season once, then just nudge it" rather than re-typing things repeatedly:

**Bulk fixture import** — `POST /api/leagues/:id/fixtures/bulk`, one line
per fixture (`Home Team vs Away Team | 2026-08-23T15:00`) in
`admin/scores.html`. Malformed lines are reported back per-line rather
than silently dropped or blocking the whole batch — the valid ones still
import. This is the actual "front-load the work once" step a new season
needs; before this, standing up a full fixture list meant clicking "+ Add
Fixture" one at a time.

**Postponement as one action, not a silent overwrite** — `Fixture` gained
`originalKickoff` (nullable). `PUT /api/leagues/fixtures/:fixtureId`
detects a transition *into* `POSTPONED` and preserves the fixture's
current kickoff there before applying the new one — a fixture postponed
twice keeps its very first scheduled date, not the most recent one. Both
the admin fixture row and the **public** Scores & Fixtures page now show
"was X, now Y" for a postponed fixture, not just a status badge.

**Per-league team-name autocomplete, no new model** — `GET
/api/leagues/:id/team-names` derives a deduped list from that league's
existing fixtures + standings (teams are still plain strings on those
rows, per §12's original design — this doesn't revive a relational Team
entity for Scores). Wired as an HTML5 `<datalist>` on every team-name
input in `admin/scores.html`. Once a league's first matchday is entered,
every subsequent entry autocompletes against it — the actual fix for
"Gor Mahia" vs "Gor Mahia FC" quietly becoming two different teams across
entries.

**Audit trail** — new `ChangeLog` model, one flat table (entity type/id,
action, a human-readable summary, who, when) rather than a generic
before/after field-differ — matches this codebase's preference for the
simplest thing that works. Every fixture/standings mutation in
`scores.js` writes one entry; `admin/scores.html`'s new "Recent Changes"
panel lists the last 50, most recent first.

**On selling this data as a subscription** (raised, discussed, deliberately
not started): the client's own manually-collected KPL/NSL data is fully
theirs to license out — the global leagues, sourced from football-data.org,
are not, and reselling those would need that provider's explicit
permission first. Decided to revisit "own this as a product" only after a
full season of clean, audited local-league data exists — that data is the
actual asset a customer would pay for, not this tooling. Also researched
(not wired in): free-tier APIs exist for rugby (Highlightly, 100 req/day)
and global basketball (API-Basketball, same family as API-Football) —
but API-Sports' own terms explicitly disclaim commercial/mass-media
rights on competition data, a materially different posture than
football-data.org's terms. Don't wire either in without reading their
current ToS directly first. Motorsport: Ergast (the long-standing free F1
API) shut down in late 2024; its community successor Jolpica-F1 is free
but volunteer-run on a small budget, not a stable commercial dependency —
and covers F1 only, not local Kenyan motorsport, which (like KPL) has no
API at all regardless.

## 20. Clubs & Players (2026-08-19)

New public concept: **Club** and **Player** — deliberately not named "Team,"
which already means the Shop's merch catalog (a completely different
thing). Same MANUAL/API split already established for `League`:

- **Local clubs (KPL, NSL)**: entered by hand via `admin/clubs.html` —
  name, crest, venue, then players one at a time (name, position,
  nationality, age, photo).
- **Global clubs**: filled in automatically by `server/jobs/syncSquads.js`,
  but only for leagues an admin has explicitly opted in via a checkbox on
  `admin/scores.html` (`League.syncSquads`) — not all leagues at once.

**Why Wikidata, not a commercial provider** — checked three paid/freemium
options first and ruled each out for a real reason, not by default:
- **API-Football free tier**: confirmed via a real test call that it only
  has data for seasons **2022–2024**, not the current season — a squad
  page built on it would show a 2–3-year-old roster as if it were today's.
  Its own terms also explicitly disclaim commercial/mass-media rights on
  competition data (verified directly against api-football.com/terms, not
  inferred from a sibling product).
- **football-data.org** (already trusted for scores/fixtures): squad data
  is gated behind a paid "deep data pack" add-on (~€29/mo) — not available
  on the free tier at all.
- **TheSportsDB, Sportmonks**: free tiers exist but are non-commercial-only
  or restricted to 1–2 minor leagues that don't overlap with what's
  already on the site.

Wikidata is free, explicitly public-domain (CC0), and — confirmed by
building and testing the actual queries, not assumed — genuinely current
for prominent clubs/players. The naive query ("team-membership statement
with no end-date = current") does **not** work: it pulled in Manchester
United players from the 1870s whose Wikidata entries simply never got an
end-date added. The reliable signal, found by inspecting real query
results rather than guessing: filtering for a team-membership statement
whose own "point in time" stats qualifier (P585 — when appearance/goal
counts were last updated for that stint) is recent. This trades
completeness for correctness — a club's fringe/reserve players without a
recently-updated stat line won't appear, but everyone who does appear is
genuinely verified current (spot-checked against Arsenal's real 2026
squad — Havertz, Saka, Rice, Saliba, Raya, Gyökeres, all correct).

`syncSquads.js` derives its team list from each league's own
`StandingRow` data (already authoritative for API leagues from the
football-data.org sync) rather than asking Wikidata "which teams are in
this league" — that query is historical/all-time on Wikidata, not
season-scoped, and much messier to filter reliably. Wikidata's public
endpoints soft-throttle bursts of requests (confirmed: hit real 429s at
1.5s spacing on a live run) despite publishing no hard quota — the job
retries with backoff rather than just spacing calls further apart and
hoping. Runs once daily via `node-cron` (squad rosters don't change often
enough to need more) — separately from the 30-minute league-scores sync.

**New pages**: public `/clubs.html` (sport → league → club, same
`category-toggle.js` component as Shows/Scores/Shop) and `/club.html`
(one club's crest, venue, and squad grid). Admin `admin/clubs.html` for
manual entry. "Clubs" added to the main nav and footer nav between Scores
and Shop.

**Deliberately not done**: Fixture/StandingRow team names still aren't
linked to Club records — they stay plain strings, matched by convention
(aided by the team-name autocomplete built in §19). Linking them would be
a bigger, riskier schema change for limited practical benefit right now.

## 21. Sky Sports-style secondary nav unified across Sport/Competition/Team, Tables regrouped (2026-08-26)

Client watched skysports.com and wanted the sport hub's secondary nav
(News/Watch/Scores & Fixtures/Tables/Transfers[football]/Teams/
Competitions — built in an earlier pass not otherwise logged in this file)
to persist as the *same* bar when
drilling into one competition or one team, scoped down rather than
replaced by a different, page-specific tab set — `competition.html` used
to have its own separate, narrower bar (Table/Fixtures/Results/Teams) and
`club.html` had none at all. Also wanted the Tables tab to visually
regroup like Sky's: a category tab bar with compact preview tables
side-by-side, not full stacked tables.

**New `public/js/subnav.js`**, extracted from `sport.js`'s tab mechanism
(`BASE_SPORT_TABS`, `SPORT_SPECIFIC_TABS`, `TAB_LOADERS`, the tab-bar
renderer) and generalized to take a `scope` object (`{sportSlug,
sportName, competition, club}`, at most one of the last two set) instead
of a bare sport slug — same "built once, used by several pages" reasoning
as `category-toggle.js`/`nav-dropdown.js` (§16). `sport.js` now only keeps
`loadOverviewTab` (the sport-hub-only digest shown before any tab is
picked) and its own bootstrap. `competition.js` and `club.js` were
rewritten to fetch their own detail, build a scope, render their own page
header, and hand off to the shared renderer — `club.html` keeps its Squad
grid as static content above the tabs (the one thing that doesn't map onto
the shared tab set, same as Sky's own team pages).

Two real gaps this surfaced, both put to the client directly rather than
decided silently:

- **`Article` had no per-team dimension** — only `competitionId`. Client
  chose to add real tagging: `Article.clubId` (mirrors `competitionId`
  exactly, migration `20260825223853_add_article_club`), a `club` query
  filter on `GET /api/articles` (`competition` filter added too, was
  missing despite the field existing), and a cascading `clubId` select in
  the admin article form (sport → competition → club, same cascade
  `competitionId` already had from sport). A club page's News/Watch/
  Transfers tabs only ever show that club's own tagged content — no
  fallback to the competition's wider feed, which would have silently
  shown a different team's news as if it were this team's own. An empty
  tag list shows an honest "No [x] yet for {team}" rather than borrowing
  content.
- **Club names don't reliably match Fixture/StandingRow team-name
  strings** (§20's already-accepted gap — "Gor Mahia FC" vs "Gor Mahia",
  confirmed live). Client chose best-effort fuzzy matching (strip FC/AFC,
  case-insensitive substring either direction) over skipping team-scoped
  fixtures — labeled in the UI as best-effort so it isn't mistaken for
  exact.

The Competitions tab stays sport-wide regardless of scope, deliberately —
a "browse sideways" affordance, same tab and query whether reached from
the sport hub, a competition page, or a team page.

**Tables tab rework** (`scores.js`): the existing region-first (Kenya,
then Global), category-second grouping stays — Sky's own flat category
list only works because their site is implicitly England-centric, this
one genuinely needs Kenya separated from foreign competitions first.
Within a region, `category-toggle.js` now replaces the old plain
subheading wherever that region spans more than one category (same guard
as before — a region with just one category still doesn't get a pointless
single-item pill). Each competition renders as a new compact
`.mini-table-card` (name + top 5 rows + "View full table →") in the
existing `.card-grid`, not the old full stacked-table treatment — its own
CSS class, not a reuse of `.data-table` (that one's sized for its own
horizontal-scroll context, would force scrolling inside every card).

**Jurisdictional policy, stated explicitly by the client**: the sport-wide
Teams browsing surfaces — the sport hub's Teams tab (`subnav.js`) and the
standalone `/clubs.html` page (`clubs.js`) — are strictly Kenyan teams,
never Global ones, filtered on `competition.region === 'KENYA'`. Global
clubs (Arsenal, Bayern, ...) keep their own `Club` rows (needed for their
own competition page's Teams tab, e.g. Premier League's own team list) —
this only restricts the two general "browse teams in this sport" surfaces,
not a specific competition's own page, where seeing its real teams is
still expected.

## 22. Rich club profile template for Kenyan teams (2026-08-26)

`club.html` was crest+name+squad. Client wanted a real profile — coach,
players, sponsorships — for Kenyan teams specifically, with News/Scores/
Fixtures staying exactly as their own nav-driven tabs underneath (the
subnav from §21, unchanged). Closes a gap that's sat in `site.css` since
before this file's own log started: a complete, entirely unused
`.profile-header`/`.profile-badge`/`.profile-name`/`.profile-meta` block,
explicitly commented "PROFILE HEADER (team/player)," never wired to any
page until now.

**Schema**: `Club` gains `owner String?` (simple field). New `Staff`
model — mirrors `Player`'s shape (name/nationality/photoUrl), `role`
instead of `position`. New `Sponsor` model — a real list per club (name/
logoUrl/website), not a single field, once the client confirmed a club can
have more than one sponsor. Both are Kenyan-club-only in practice (Global
clubs' data comes from Wikidata sync, which has no coach/sponsor concept),
enforced by template branching rather than a schema constraint.

**`server/routes/clubs.js`**: Staff/Sponsor CRUD added, mirroring the
existing Player CRUD routes' exact shape and role gating (`POST /:id/
staff`, `PUT /staff/:staffId`, `DELETE /staff/:staffId`, same pattern for
`/sponsors`). `GET /:slug` and club update now include/accept the new
fields.

**Admin** (`admin/clubs.html`/`admin/js/clubs.js`): the existing per-club
card gained two more sections using the exact same row-grid/add/save/
delete pattern already built for Players — not a new UI pattern, the same
one twice more. Both sections (like Players) only show their "add" row for
`source === 'MANUAL'` clubs. `owner` added to the "Add a Club" form only
(matching how `crestUrl`/`venue` are handled — creation-time fields, no
separate per-card edit UI exists for those either).

**Public** (`public/js/club.js`): branches on `club.competition.region`.
Kenyan clubs get the new profile — `.profile-header` badge, then Coach &
Staff / Squad / Sponsors as three static sections above the shared subnav
(Sponsors omitted entirely, not shown-empty, when a club has none — its
absence isn't a data gap worth flagging the way an empty squad is). Global
clubs keep the original simple template unchanged, verified live against
Arsenal FC's own page.

## 23. Player profile pages, with real article tagging (2026-08-26)

No page anywhere showed one player on their own — players only ever
appeared as un-linked cards in a club's squad grid. Same jurisdictional
split as Teams/club profiles: Kenyan players only ("across different
games" meant across every sport this site covers, not across every
country). The actual point, in the client's own words: an article or
podcast tagged to a specific player should show up on that player's own
page, the same way `Article.competitionId`/`clubId` already route content
to a competition's or a club's own page.

**Schema, two migrations not one**: `Player` had 126 existing rows —
unlike every prior schema addition this session, which only ever touched
empty tables — so a required unique `slug` needed a real backfill step in
between (add nullable → one-off backfill script, `slugify(name-club.slug)`
scoped by club, zero collisions across all 126 → make required + unique).
`Article` gains `playerId String?` mirroring `clubId`/`competitionId`
exactly. Both player-creation paths (`POST /:id/players` in
`clubs.js`, and `syncSquads.js`'s Wikidata sync) now generate a slug at
creation, same "never regenerated after creation" convention `Club`/
`Competition` slugs already follow.

**API**: `GET /api/clubs/players/:slug` (public, new) — same router as the
existing player PUT/DELETE, just a new read by slug. `GET /api/articles`
gains a `player` filter, same pattern as `club`/`competition`.

**Admin**: the sport → competition → club article-tagging cascade gains a
fourth level, `playerId`, fetching that one club's players on demand
(`GET /api/clubs/:slug` already returns them — the same endpoint the
public club page uses) since the club list endpoint doesn't include
players.

**Public** (`public/player.html` + `public/js/player.js`, new): a player
isn't a competition-scoped entity — no Scores/Fixtures/Tables of its own —
so this deliberately does not reuse `subnav.js`'s tab-bar machinery, which
would force a nonsensical Tables tab onto a page with nothing to show
there. Single-scroll layout instead: the same `.profile-header`/
`.profile-badge` treatment `club.js`'s Kenyan profile already uses, then a
News & Podcasts feed of whatever's tagged via `Article.playerId` (reuses
`subnav.js`'s existing `articleCardHtml`, which already handles both
`ARTICLE` and `VIDEO_POST` content types — no third card variant built).
`playerCardHtml` in `club.js` now links to a player's page, but only for
Kenyan clubs — Global clubs' player cards stay exactly as they were,
unlinked, verified live against Arsenal FC.

Verified live end-to-end: added a real player to Gor Mahia FC, tagged an
article to them through the new cascading admin select, confirmed it
appears on that player's new profile page and the squad card links there
correctly; confirmed Arsenal FC's squad cards are unaffected; confirmed a
nonexistent player slug fails gracefully rather than erroring.

## 24. Players tab in the secondary nav, Teams categorized like Tables (2026-08-26)

Two gaps in the shared subnav: no way to browse players except drilling
into one team's squad at a time, and the Teams tab grouped by a flat
competition heading while Tables (§21) already grouped by category
(Leagues/Cups/Continental/International) via `category-toggle.js`.
**Players appears at the sport hub and competition levels only, not on a
team's own page** — that page already shows its Squad as a static
section, and a Players tab there would just repeat the same roster.

New `GET /api/players` (`server/routes/players.js`, `sport`/`competition`
filters) enforces Kenya-only server-side — cleaner than the client-side
filter the Teams tab has used since §21, and the right layer for a
brand-new endpoint to get right from the start (the older client-side
filter in `clubs.js`/`subnav.js` was left as-is, not retrofitted — out of
scope for this pass).

`subnav.js`'s `getSportTabs` now takes the whole `scope`, not just a
sport slug — filters the `players` tab out whenever `scope.club` is set.
`playerCardHtml` moved from `club.js` into `subnav.js` (alongside its
other shared card renderers, `articleCardHtml`/`competitionTeamCardHtml`)
so both the new Players tab and `club.js`'s own Squad section can use it
without pulling in `club.js`'s page-bootstrap side effects.

`scores.js` gained `groupByCategory` (extracted from the existing
region+category grouping, which now calls it per-region — behavior
unchanged, re-verified against Tables) and a new shared
`renderCompetitionCategorizedGrid`, used by both the Teams tab (replacing
`clubs.js`'s old flat-by-competition `renderClubsSportPanel`) and the new
Players tab — category-toggled when more than one category exists, same
"no pointless single-item pill" guard Tables already has, with an honest
empty state Teams never had before.

Verified live: the Players tab lands between Teams and Competitions on
the sport hub, correctly scoped down on a competition's own page, and
absent from a team's own page; Teams and the standalone `/clubs.html`
both still work through the new shared grouping; the Tables tab (sharing
the refactored grouping logic) and a Global competition's own Teams tab
(e.g. Premier League, unaffected by the Kenya-only endpoint) both

---

## 25. Newsroom Monitoring Engine + Show/Season/Episode Data Model (2026-09-06 → 2026-09-13)

Two additive builds this stretch, neither previously logged here — the
2026-09-13 audit specifically flagged this gap, so closing it now.

**Monitoring engine** (`prisma/schema.prisma`'s `Source`/`MonitoredItem`,
`server/routes/sources.js` + `monitoring.js`, `server/jobs/runMonitoringFetch.js`
+ `runMonitoringEnrich.js`): an internal newsroom leads dashboard. A
`Source` (RSS feed, HTML page with CSS selectors, or a YouTube channel)
gets fetched on a cron (`MONITORING_FETCH_CRON`, default every 20 min),
upserted into `MonitoredItem` by `(sourceId, externalUrl)`, then enriched
separately (`MONITORING_ENRICH_CRON`, default every 10 min) via a forced
Claude Haiku tool-call that returns a structured summary/relevance
score/category tags — never free-text parsed. Nothing here reaches
readers automatically: an editor reviews the queue at
`admin/monitoring.html` and must explicitly hit "Promote," which creates
a `DRAFT` article (never auto-published) and marks the item `PROMOTED`.
Configuring a `Source` (`admin/sources.html`) is the one admin surface
that leaks technical/implementation language (raw CSS selectors, cron
syntax) into the newsroom UI — flagged, not yet fixed.

**Show → Season → Episode** (`prisma/schema.prisma`): added for the
flagship show only. `Episode` is a nullable-unique 1:1 with `Article`
(`articleId`), synced via `syncEpisodeForArticle()` in
`server/routes/articles.js` whenever a `VIDEO_POST` article's
`videoSeries` string matches a real `Show.name` — the 5 dormant niche
shows are untouched and stay entirely on the old `videoSeries`/
`episodeLabel`/`runtimeLabel`/`youtubeId` scalar fields on `Article`
itself (per the "dormant, not deleted" call — they were removed from
nav/`shows.html` but their content and code path still work). The
activation match is a plain string comparison with no validation: a
typo'd `videoSeries` silently produces no `Episode` row and no error.
Homepage's WATCH section (`js/home.js`'s `loadWatchSection`) pulls only
from the flagship show's real `Episode` rows via `GET /api/shows/the-sportscast`.

---

## 26. Wave 0 Stabilization (2026-09-13)

Following a full independent audit of this repo (prompted by a founder
directive to evaluate both this repo and the sibling Underdawgs Sports
Data platform before any further build-out — see the "Current State &
Target Architecture" artifact for the full report), a first pass of
low-risk, high-value fixes landed same-day:

- **Fixed a real stored-XSS gap**: `admin/js/monitoring.js` rendered a
  scraped `MonitoredItem.externalUrl` directly into an `href` with no
  escaping — a crafted URL from a compromised/malicious source could have
  broken attribute context or used a `javascript:` scheme in an
  admin-privileged session. Now escaped, and only rendered as a clickable
  link at all if it's a plain `http(s)://` URL.
- **Sessions now persist to disk**, not the default in-memory
  `MemoryStore` — `session-file-store`, writing to a `sessions/`
  directory alongside wherever the SQLite file already lives (so
  production's Railway volume covers it too). Every redeploy used to log
  out every admin; it no longer does. `SESSION_SECRET` is now required at
  boot (throws immediately if unset) rather than silently falling back to
  a public default string — moot in production, where a real secret was
  already set, but real hardening for any future environment that forgets
  to set one.
- **`trust proxy` + secure/SameSite cookies**: added `app.set('trust
  proxy', 1)` (required for Railway's TLS-terminating proxy) and marked
  the session cookie `secure`/`sameSite: 'lax'` when running on Railway.
- **Confirmed, not fixed** (already correct): production's
  `DATABASE_URL` genuinely points at `/data/dev.db`, which genuinely is a
  persistent Railway volume — the audit's SQLite-durability concern was
  real to check but turned out to already be handled.
- **Shop's dead-end pages now fail gracefully**: `shop.html`/
  `order-confirmation.html` were still reachable by direct URL (unlinked
  from nav, but not deleted) and called APIs that no longer exist,
  surfacing a raw "Request failed (404)" to anyone who landed there.
  `js/shop.js` and `js/order-confirmation.js` now show a deliberate "not
  available right now" message instead. The underlying legal-retirement
  decision (routes unmounted in `server/index.js`) was not revisited —
  this only fixes how the already-dormant state behaves.
- **`npm audit fix`** resolved the `body-parser` moderate vulnerability.
  One remaining moderate `qs` advisory is bundled inside Express itself
  with no newer patch release available yet — tracked, not ignorable,
  but not fixable by a dependency bump today.
- **Added `.github/workflows/ci.yml`**: this repo still has zero
  automated tests, so CI's job is narrower than usual — it applies every
  migration to a fresh throwaway SQLite database, boots the server and
  confirms it responds, and fails on any high/critical `npm audit`
  finding. A floor against a broken deploy, not real coverage.
- **`.gitignore`** now covers `prisma/*.db`/`prisma/*.db-journal`
  (previously only `prisma/dev.db` specifically) and `prisma/sessions/`.

Not done in this pass (deliberately — needs a founder decision, not an
engineering call): Shop's actual fate (remount vs. delete for good).
Resolved shortly after, in §27 below.

---

## 27. Wave 1 — Canonical Data Foundation, Sources Rewrite, Shop Deleted (2026-09-13)

Continuing same-day, once Wave 0 landed. Per the target architecture
artifact, Wave 1 was gated on the sibling Underdawgs Sports Data platform
holding one real (non-demo) competition's data — it now does.

**Kenya Cup real data**: imported into the Data Platform (Federation
"Kenya Rugby Union", Competition "Kenya Cup", 2026 season, 12 teams, full
standings) from this site's own already-live scrape of kenyacup.co.ke —
see that repo's `packages/database/scripts/import-kenya-cup.ts`. No
Fixture/Match rows created — this site's Kenya Cup scraper is
standings-only (`server/jobs/syncKenyaCup.js`), confirmed zero Fixture
rows exist for this competition anywhere.

**`CanonicalMapping` model** (`prisma/schema.prisma`): one generic table
(same shape as `ChangeLog` — entityType/entityId, not a canonicalId column
bolted onto every model that might need one) recording which of this
site's rows correspond to which row in the Data Platform. Populated for
Kenya Cup's Competition + all 12 Clubs
(`prisma/populate-kenya-cup-canonical-mapping.js`, one-off, safe to
re-run).

**Kenya Cup's competition page now reads live from the canonical
source**: `GET /api/competitions/:slug` (`server/routes/competitions.js`)
checks `CanonicalMapping` for the competition, and if found, fetches that
competition's current-season standings from the Data Platform's `/v1/*`
API (`server/lib/canonicalData.js` — server-to-server, never a browser
call, so no CORS exposure) in place of the local `StandingRow` table,
transformed to the exact shape `scores.js`'s `standingsTableHtml` already
renders — that renderer needed zero changes. **Fails soft by design**: no
mapping, a timeout (3s), or an empty response all fall back to local data
silently, logged not thrown — a canonical-source outage can never break a
page that worked yesterday. A `standingsSource` field
(`'underdawgs-data'` | `'local'`) on the response makes which source
served a given request visible/debuggable. Every other competition (no
mapping row) is entirely unaffected. Verified against the real production
Data Platform API (live network call, not mocked) and separately verified
the fallback path by pointing at an unreachable host.

**Sources admin page rewritten in plain language** (`admin/sources.html`
+ `admin/js/sources.js`) — per the target architecture's §4 (the one
admin surface where raw implementation language leaked through): fetch
method options reframed as plain either/or choices; the CSS-selector
fields (kept — removing them means building real scraping
auto-detection, out of scope here) relabeled as plain questions with a
note framing them as a one-time ask-a-developer step; the raw cron
expression field replaced with a plain-language frequency dropdown
(Every 20 minutes / hour / 6 hours / day / Custom…) that reverse-maps an
existing source's stored cron correctly whether it matches a preset or
not; removed a developer-facing file-path reference from the page's own
copy. Verified via CDP: created a real source, edited it, changed its
schedule, confirmed round-trip through save+reopen for both a preset and
a non-preset value.

**Shop's fate, finally resolved**: deleted the public-facing remnants —
`shop.html`, `order-confirmation.html`, `js/shop.js`, `js/cart.js`,
`js/order-confirmation.js` — rather than leave them as a permanent
"not available" stub. These were reachable-but-broken dead ends with
nothing dormant about them, a different situation from the server side.
`server/routes/shop.js`/`orders.js` and the `Team`/`Kit`/`Order`/
`OrderItem` Prisma models stay exactly as before — dormant, not deleted,
still unmounted in `server/index.js` — the legal-retirement decision
itself wasn't revisited, only the broken public pages it left behind.
Remounting Shop later means rebuilding those five pages too, not just
re-adding two `require`/`app.use` lines — noted directly in
`server/index.js`'s and `server/routes/orders.js`'s own comments so this
isn't a surprise for whoever picks it up.

---

## 28. The 5 Niche Shows — Actually Removed, Not Just Dormant (2026-09-13)

A founder decision, not an engineering call: the 5 niche shows (The
Hydration Break, The Ruck, Bully Off, Fast Break, The Circuit) had been
unreferenced from nav/`shows.html` since earlier this project (§7),
content left dormant. This time the explicit instruction was to actually
remove them, not just keep them dormant.

**Backed up first**: all 6 real articles (2 Hydration Break, 1 each of the
rest) exported in full (title/dek/body/every field) to
`backups/legacy-shows-backup-2026-09-13.json` before deleting anything —
irreversible actions get a recovery path even when explicitly authorized.

**Then deleted**: the 6 `Article` rows, in both the local dev database and
production. `public/js/shows-data.js` (the hardcoded 5-niche-show
taxonomy) was removed entirely — with the underlying content gone, it was
fully dead code, not just unused for now. `show.js` lost its legacy
`Article.videoSeries`-string-match fallback path along with it; the page
is DB-backed only now (`Show`/`Season`/`Episode`, flagship only).
`show.html` no longer includes the now-deleted script.

Verified locally before deploying: flagship show page unaffected, a
removed show's URL (`/show.html?slug=the-ruck`) now cleanly shows "Show
not found" rather than erroring, `shows.html` unaffected, and
`GET /api/articles?contentType=VIDEO_POST` confirms only "The Sportscast"
remains.

## 29. Article ↔ Data Platform Event link (2026-09-13)

Closes the "Article↔Fixture content-graph link... genuinely absent" half
of gap #17 (2026-09 remediation audit). An editor can now link an Article
to a company-level `Event` on the separate Underdawgs Sports Data
platform (a tournament, a signing, an athlete achievement — not the same
thing as a Fixture, and broader: most of what this site publishes isn't
fixture-shaped at all) by pasting its Data Platform id into the article
editor's new "Canonical Event" section.

**Never stores an unverified link**: `PUT /api/articles/:id/canonical-event`
live-fetches `GET /v1/events/:id` from the Data Platform before writing
anything — an id that doesn't resolve (typo, deleted row, wrong repo's
id) is rejected with a 422, same discipline as the zero-fabrication rule
applied to a cross-repo reference instead of to a fact. The mapping
itself reuses `CanonicalMapping` (already the Competition-standings
bridge's own table — one generic entityType/entityId table, not a new
one per relationship), keyed `localEntityType: 'ARTICLE'`.

**Fails soft on read**: the public article page (`server/lib/canonicalData.js`'s
new `fetchCanonicalEvent`) returns `null` — never throws — on no mapping,
a network error, or the Event having been deleted on the other side
since linking; the article renders exactly as it would with no link at
all. Verified end-to-end against a scratch SQLite copy and a local stub
standing in for the Data Platform (no real Event objects exist there yet
to link against — the architecture is real, the row to point at isn't,
same principle as every other "real architecture, no fabricated content"
build this session): reject-invalid-id (422), link, fetch, public-page
display, unlink, and fail-soft-during-an-outage all behave as designed.

## 30. Follow system gets a durable (still anonymous) mirror (2026-09-13)

Gap #5 (2026-09 remediation audit): the Follow system (`public/js/
follows.js`) was localStorage-only — real, working, but doesn't survive a
storage wipe/device change, and nothing server-side ever sees a follow at
all. No visitor accounts exist yet, so this doesn't become an
authenticated preference system; it stays anonymous, but durable.

New `Follow` model (`anonymousId`/`entityType`/`entitySlug`/`name`/
`href`) — `anonymousId` is a random token `follows.js` generates once per
browser (`crypto.randomUUID()`, localStorage-persisted), identifying a
device, never a person. New `server/routes/follows.js`
(`GET/POST/DELETE /api/follows`, entityType allow-listed, no auth needed
since there's no account to require).

The interaction pattern on the page is unchanged: `toggleFollow()` still
writes to localStorage first and updates the button instantly, then
fires a best-effort `syncFollowToServer()` call that's swallowed on
failure — offline, an ad-blocker, whatever — never delaying or breaking
the local toggle. This is a durability layer added underneath the
existing UX, not a redesign of it, so it carries over unchanged again if
this ever becomes a real authenticated preference system later (same
reasoning the original 2026-08 comment gave for the localStorage design).

Verified end-to-end against a scratch SQLite copy: create/list/upsert
(re-following updates the row, not a duplicate)/delete, plus rejecting an
invalid anonymousId and an unlisted entityType.

## 31. PWA foundation (2026-09-13)

The Mobile/PWA Strategy chapter of the 2026-09 remediation audit was
tagged DEFER PWA in full — this is deliberately just the foundation, not
an offline-first rebuild: sports scores/articles change constantly, and
this site has no asset-versioning scheme (no hashed filenames), so
caching anything dynamic would risk showing a visitor stale data with no
way to bust it. That risk shaped every choice below.

`public/manifest.json` (name/icons — reuses the already-existing real
`favicon-192.png`/`favicon-512.png`, no new assets generated) and
`public/sw.js` are new; all 13 public HTML pages get a
`<link rel="manifest">` + `theme-color` meta tag, and `site.js` registers
the service worker on `DOMContentLoaded`.

**What the service worker actually does**: stale-while-revalidate ONLY
for same-origin static assets under `/css/`, `/js/`, `/brand/`, or
`manifest.json` — every repeat visit gets these instantly from cache while
a background fetch refreshes them for next time. Every HTML document
(navigation) and everything under `/api/` is explicitly bypassed
(`event.respondWith` is never called for them) — always network, never
cached, so a visitor is never shown a stale page shell or stale sports
data. Scope is site-root, so `/admin/*` pages (which also load `site.js`)
are technically SW-controlled too, but the same bypass rules mean nothing
admin-specific or dynamic is ever affected.

Verified with a real headless-Chrome/CDP session (not just a syntax
check): registration reaches `activated` state, the manifest link and
theme-color resolve in the live DOM, repeat navigation populates the
cache with exactly the expected static paths and nothing under `/api/`,
and `/admin/index.html` itself is confirmed never cached (HTML always
network-only, including for admin).

## 32. Playwright e2e acceptance suite (2026-09-13)

Closes gap #11 — "no automated browser/UI acceptance suite," previously
tagged DEFER, this repo's own CI header comment used to say so directly
("There are no automated tests in this repo yet"). `playwright.config.js`
runs the suite against a real, freshly `prisma migrate deploy`'d +
seeded (`prisma/seed.js`) throwaway SQLite database and a real running
`server/index.js` — never a mocked API, never the developer's own
`dev.db`. New `e2e` CI job, kept separate from the existing
`boot-and-migrate` job so a slower/flakier UI test never blocks the fast
deploy-readiness check.

Three real golden-path tests, not just page-loads: (1) the admin CMS
create → publish → confirm-on-the-real-public-article-page path, the
same proof structure used to verify every feature manually this session,
now automated; (2) an admin activating a Sport (`isActive` defaults to
`false` — seed data alone never populates `/sports.html`, so this
exercises the real toggle workflow, not a shortcut around it) and
confirming it appears on the public sports index; (3) the PWA foundation
(§31) actually wired on a real page — manifest link, registered service
worker.

Found and fixed one real test-timing bug while building this: `articles.js`'s
`initArticlesPage()` wires `#new-article-btn`'s click handler only after
several awaited setup calls resolve, so a click before that resolves
silently does nothing — not a product bug (a real user always waits for
the page to render before clicking), but the test needed to wait for
that same signal (`#sportId` having options) rather than racing it.

## 33. Fan engagement: Polls (e.g. "Player of the Match") (2026-09-13)

Lightweight fan engagement, one poll per article, created by an editor
(never auto-generated — a poll only exists where an editor put real
question/options in it, matching this project's zero-fabrication
principle applied to a feature that has no "facts" to fabricate, just
empty vote counts waiting for real visitors). New `Poll`/`PollOption`/
`PollVote` models; `server/routes/polls.js` (`GET/POST/DELETE
/api/articles/:id/poll`, `POST /api/polls/:id/vote`).

Voting is anonymous — reuses Follow's `anonymousId` device-token scheme
(moved `getAnonymousId()` from `follows.js` into `site.js` so both
features, and any future one, share the same identity rather than each
minting its own). One vote per poll per device, enforced by
`PollVote`'s own unique constraint at the DB level, not just hidden
client-side after voting — confirmed by hitting the vote endpoint twice
with the same anonymousId and getting a 409 both from curl and from a
real double-click in the browser.

Admin: the article editor's new "Poll" section (question + dynamic
add/remove option inputs) only appears once editing an existing article,
same reasoning as the Canonical Event section (§29) — a poll needs a
real article to attach to. Public: the article page renders clickable
options if this device hasn't voted, or percentage-bar results (with the
visitor's own choice marked) if it has — verified end-to-end with a real
headless-Chrome session: poll renders, a click actually votes, results
show correctly, and a page reload remembers the vote (no vote buttons
shown again) without needing an account.

## 34. Small real gaps closed: login rate-limiting, dead STEWARD reference, undefined .btn-link (2026-09-13)

Three independent, previously-flagged findings, fixed together as one small pass:

- **No login rate-limiting** (flagged in an earlier security pass as the one open item, "mitigated only by bcrypt cost"). `server/index.js` now scopes an `express-rate-limit` limiter to `/api/auth/login` specifically (10 attempts / 15 min), the exact same pattern the Data Platform's `apps/api` already uses. Verified: an 11th rapid attempt from one client returns 429, an unrelated route is unaffected.
- **Dead `STEWARD` role reference** (`server/routes/taxonomy.js`'s `POST /sports`) — `User.role` has only ever supported `ADMIN`/`EDITOR` (the schema field's own comment says so); `STEWARD` could never match a real user, so this was inert, misleading dead code, not a real permission. Removed.
- **`.btn-link` was entirely undefined** in `public/css/site.css` — every use (`public/index.html`'s "All episodes →", two spots in `public/js/scores.js`, and this session's own admin Unlink/Delete-poll buttons) rendered as an unstyled default anchor. Added a real rule matching the button family's typography (Montserrat, uppercase, letter-spacing) but with no box — this one's always an inline text link, never a boxed CTA. Verified via computed style in a real headless-Chrome session.
