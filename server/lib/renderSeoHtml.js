// Wave 4 — this app is plain `express.static(public/)` with no
// server-side templating layer at all (confirmed: grep of server/ for
// any HTML-generation library returns nothing). That's exactly why
// club.html/player.html/competition.html were hardcoded `noindex` and
// article.html/show.html only ever got a real per-entity <title> client-
// side, via JS, after the static HTML had already reached the browser —
// too late for a crawler or social-preview bot that doesn't execute JS.
//
// This is the smallest real fix for that: read the static template file
// fresh per request (no caching — these are small files and this only
// runs for entity detail pages, not the whole site), and do a handful of
// targeted string replacements for <title>/description/OG tags before
// sending it. Not a templating engine, not a build step — just enough to
// get real metadata into the HTML the server actually sends.

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');


const SITE_URL = (process.env.SITE_URL || 'https://sportscast-production-c267.up.railway.app').replace(/\/$/, '');
function absoluteUrl(url) {
  return /^https?:\/\//.test(url) ? url : `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Reads templateFilename from public/, injects real per-entity SEO meta,
 * and returns the resulting HTML string. `meta`:
 *   - title (required)
 *   - description (optional)
 *   - ogImage (optional — absolute or root-relative URL)
 *   - indexable (default false) — only pages backed by a real,
 *     confirmed-to-exist entity should ever pass true; the 404 case
 *     (entity not found) should never flip a page indexable.
 */
function renderSeoHtml(templateFilename, meta) {
  const filePath = path.join(PUBLIC_DIR, templateFilename);
  let html = fs.readFileSync(filePath, 'utf8');

  const title = escapeAttr(meta.title);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);

  if (meta.description) {
    const desc = escapeAttr(meta.description);
    if (/<meta name="description"/.test(html)) {
      html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${desc}">`);
    } else {
      html = html.replace('</title>', `</title>\n  <meta name="description" content="${desc}">`);
    }

    if (/<meta property="og:description"/.test(html)) {
      html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${desc}">`);
    } else {
      html = html.replace('</title>', `</title>\n  <meta property="og:description" content="${desc}">`);
    }
  }

  if (/<meta property="og:title"/.test(html)) {
    html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}">`);
  } else {
    html = html.replace('</title>', `</title>\n  <meta property="og:title" content="${title}">`);
  }

  if (meta.ogImage) {
    // Social crawlers (WhatsApp, X, Facebook) ignore a root-relative
    // og:image, so make it absolute against SITE_URL. The existing tag's
    // attributes other than content (e.g. id="og-image", which show.js
    // sets at runtime) are kept — dropping the id crashed show.html.
    const img = escapeAttr(absoluteUrl(meta.ogImage));
    if (/<meta property="og:image"/.test(html)) {
      html = html.replace(/<meta property="og:image"[^>]*>/, (tag) => tag.replace(/content="[^"]*"/, `content="${img}"`));
    } else {
      html = html.replace('</title>', `</title>\n  <meta property="og:image" content="${img}">`);
    }
  }

  // Structured data (2026-10-20): schema.org JSON-LD so search engines can
  // read a match's teams, date, venue and status. "<" is escaped so the
  // JSON can never close the script tag early.
  if (meta.jsonLd) {
    const json = JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c');
    html = html.replace('</head>', `  <script type="application/ld+json">${json}</script>\n</head>`);
  }

  // Only ever removes noindex — never adds it. A page this function was
  // never called for (or called with indexable left false/omitted) keeps
  // whatever the static file already says, which for the entity pages
  // this powers is noindex until a real, found entity says otherwise.
  if (meta.indexable) {
    html = html.replace(/\s*<meta name="robots" content="noindex">\n?/, '\n');
  }

  return html;
}

module.exports = { renderSeoHtml };
