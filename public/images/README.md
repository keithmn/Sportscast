# Image drop-in conventions

Corrected 2026-09-13 — this file previously described slots that had gone stale relative to the actual code (see below); it now says what's really wired up.

- `shows/the-sportscast.jpg` — **still real.** Flagship cover art, used on the homepage, `/shows.html`, and as the fallback social-share image on `/show.html?slug=the-sportscast`. Compressed 2026-09-13 (3.1MB → ~700KB, resized to 1200px wide) — the original was an unoptimized raw phone photo; nothing before that date changed how it's referenced, only its file size.
- `hero.jpg` — **no longer wired up.** The homepage hero section this backed was removed 2026-08-20 ("homepage strictly for news, no hero/podcast/shop promos" — see `public/index.html`'s own comment). The file still sits in this folder (real content, not deleted), but no code path reads it anymore.
- `shows/the-hydration-break.jpg`, `shows/the-ruck.jpg`, `shows/bully-off.jpg`, `shows/fast-break.jpg`, `shows/the-circuit.jpg` — **no longer wired up.** These 5 niche shows' actual content (their Article rows) was deleted 2026-09-13 (see `BLUEPRINT.md` §28), not just unreferenced — `shows.js`/`shows.html` never read these filenames at all now. The image files still sit in this folder untouched.
- `og-default.jpg` — never existed in this folder; if the intent was still real, dropping one in wouldn't currently be picked up by any code path either (double-check before assuming this one works).

Everything else (article/episode cover photos) goes through the CMS rather than a fixed filename:
- **Article/episode covers:** paste a URL into the "Cover Image URL" field in the admin (`/admin/articles.html`) when creating/editing a story or episode. Shows up on the article page, and now also as a thumbnail on story cards, the archive list, and episode lists.

This site is media/content only — player/team profiles, transfers, and standings (previously proxied from the separate "Underdoggs Data" service) were removed on 2026-07-08. That data venture still exists as its own separate future product; it's just no longer wired into this site.
