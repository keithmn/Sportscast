# Image drop-in conventions

Drop real photos at these exact paths and they appear automatically — no code changes needed. Nothing here is required; every slot gracefully falls back to the current design if the file doesn't exist yet.

- `hero.jpg` — homepage hero background (behind "Where Kenyan Sports Live."). Recommended: wide landscape, a moment from a match/event, ~1920x1080+.
- `og-default.jpg` — the image used when the homepage/shows/archive pages are shared on social media (WhatsApp, Twitter/X, Facebook link previews). Recommended: 1200x630, brand-forward (logo/wordmark visible).
- `shows/the-sportscast.jpg` — flagship cover art, used on the homepage, /shows.html, and as the fallback social-share image on /show.html?slug=the-sportscast.
- `shows/the-hydration-break.jpg`, `shows/the-ruck.jpg`, `shows/bully-off.jpg`, `shows/fast-break.jpg`, `shows/the-circuit.jpg` — same, one per niche show. Recommended: square-ish, works as both a small card thumbnail and a wide header banner.

Everything else (article/episode cover photos) goes through the CMS rather than a fixed filename:
- **Article/episode covers:** paste a URL into the "Cover Image URL" field in the admin (`/admin/articles.html`) when creating/editing a story or episode. Shows up on the article page, and now also as a thumbnail on story cards, the archive list, and episode lists.

This site is media/content only — player/team profiles, transfers, and standings (previously proxied from the separate "Underdoggs Data" service) were removed on 2026-07-08. That data venture still exists as its own separate future product; it's just no longer wired into this site.
