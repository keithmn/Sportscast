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

**Stack:** Node.js + Express + Prisma (SQLite) + vanilla HTML/CSS/JS. No frontend framework, no build step. This is intentional — the site is simple enough that a framework would be overhead, and it means anyone can open a `.html` file and understand the whole page.

```
server/
  index.js              — app entrypoint, route mounting, static file serving
  db.js                 — Prisma client singleton
  middleware/auth.js     — requireRole() session-based auth guard
  routes/
    auth.js              — login/logout/me
    articles.js          — full CRUD for articles (public GET, admin-gated writes)
    taxonomy.js          — sports/tags/authors (read + admin-write)
    scores.js            — leagues/standings/fixtures (public GET, admin-gated writes) — see §12
  utils/slugify.js

prisma/
  schema.prisma          — User, Author, Sport, Tag, Article (CMS-only, see §7), League/StandingRow/Fixture (see §12)
  seed.js                — demo data: sports, authors, articles, show episodes, news briefs, empty league shell
  dev.db                 — SQLite file (gitignored, regenerate via migrate+seed)

public/
  index.html             — homepage (own inline <style>, doesn't use site.css)
  shows.html             — Shows hub (flagship + 5 niche show cards)
  show.html?slug=X        — per-show episode archive
  news.html               — News & Articles: "Latest" briefs strip + "Stories" features grid, one shared sport filter — see §11
  scores.html              — standings/fixtures, football-only — see §12
  article.html            — single article/episode view
  sport.html?sport=X       — per-sport article listing (see §7 for what this lost)
  css/site.css             — shared stylesheet for every page except index.html
  js/
    site.js                — renderNav()/renderFooter(), shared across all pages but index.html
    home.js, shows.js, show.js, sport.js, article.js, news.js, scores.js — per-page logic
    shows-data.js           — the fixed show taxonomy (not a DB model, see §5)
  admin/                   — newsroom CMS (login, dashboard, article editor, scores.html for standings/fixtures entry)
  images/                  — real photography, see §6
```

**Why index.html doesn't share site.css:** it was built first, with its own animation/hero treatment, before site.css existed as a shared file. This means **any brand/color/nav change has to be made in two places** — `index.html`'s own `<style>` block *and* `site.css`. This is real, known duplication, not an oversight. Grep before you edit; check both.

**Run it:**
```bash
npm install
npm run prisma:migrate   # or: npx prisma migrate deploy (schema already exists)
npm run seed
npm run dev              # http://localhost:3000
```
Demo logins (password `underdoggs2026`): `admin@underdoggs.co.ke`, `editor@underdoggs.co.ke`.

**Env vars** (`.env`): `DATABASE_URL`, `SESSION_SECRET`, `PORT`. `DATA_SERVICE_URL` still exists in `.env` but is **dead** — leftover from the removed data-service integration (§7). Harmless, but delete it if you're cleaning up.

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
