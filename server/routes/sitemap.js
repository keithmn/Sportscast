// Wave 7 — this site had no sitemap.xml/robots.txt at all before this
// (confirmed: neither existed anywhere in public/ or server/). Lists the
// static top-level pages plus every real, publicly-reachable entity page
// this app has dedicated SEO metadata for (server/routes/seoPages.js):
// Article, Show, Competition, Club, Sport. Deliberately excludes Player
// and Fixture/Match — same reasoning the sibling Data Platform repo's
// own sitemap used: high-cardinality, still reachable via internal links
// from the pages that ARE listed, not worth the crawl-budget cost of
// enumerating every one individually. `<lastmod>` is only emitted where
// the model actually has an `updatedAt` column (Article, Show) — omitted
// elsewhere rather than fabricated from `createdAt` or left out entirely
// wrong, matching this repo's "unknown is valid" discipline extended to
// metadata, not just sports data.
const express = require('express');
const prisma = require('../db');

const router = express.Router();

// No prior SITE_URL/BASE_URL convention existed anywhere in this
// codebase (confirmed via grep) — a sitemap is the first thing here that
// genuinely needs an absolute origin (the spec requires absolute URLs).
// Defaults to the real production origin so a fresh deploy with no env
// var set still produces a correct sitemap rather than a broken one.
const SITE_URL = (process.env.SITE_URL || 'https://sportscast-production-c267.up.railway.app').replace(/\/$/, '');

const STATIC_PATHS = ['/', '/news.html', '/scores.html', '/shows.html', '/sports.html', '/clubs.html', '/other.html', '/search.html'];

function xmlEscape(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function urlEntry(loc, lastmod) {
  const lastmodTag = lastmod ? `\n    <lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : '';
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>${lastmodTag}\n  </url>`;
}

router.get('/sitemap.xml', async (req, res) => {
  try {
    const [articles, shows, competitions, clubs, sports] = await Promise.all([
      prisma.article.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
      prisma.show.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
      prisma.competition.findMany({ select: { slug: true } }),
      prisma.club.findMany({ select: { slug: true } }),
      prisma.sport.findMany({ select: { slug: true } }),
    ]);

    const entries = [
      ...STATIC_PATHS.map((p) => urlEntry(`${SITE_URL}${p}`)),
      ...articles.map((a) => urlEntry(`${SITE_URL}/article.html?slug=${encodeURIComponent(a.slug)}`, a.updatedAt)),
      ...shows.map((s) => urlEntry(`${SITE_URL}/show.html?slug=${encodeURIComponent(s.slug)}`, s.updatedAt)),
      ...competitions.map((c) => urlEntry(`${SITE_URL}/competition.html?slug=${encodeURIComponent(c.slug)}`)),
      ...clubs.map((c) => urlEntry(`${SITE_URL}/club.html?slug=${encodeURIComponent(c.slug)}`)),
      ...sports.map((s) => urlEntry(`${SITE_URL}/sport.html?sport=${encodeURIComponent(s.slug)}`)),
    ];

    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`,
    );
  } catch (err) {
    // A broken sitemap must never take the site down — fall back to just
    // the static paths, which need no DB access at all, rather than 500.
    console.error('[sitemap] Failed to build full sitemap, falling back to static paths only:', err.message);
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${STATIC_PATHS.map((p) => urlEntry(`${SITE_URL}${p}`)).join('\n')}\n</urlset>\n`,
    );
  }
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

module.exports = router;
