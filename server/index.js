require('dotenv').config();

// Polyfill: undici (pulled in transitively by cheerio, used by
// syncKenyaCup.js) references the global File constructor at module-load
// time. Some Node 18 patch releases (e.g. the one this app runs on in
// production) don't expose it as a global even though node:buffer has
// carried it since 18.13 — without this, requiring cheerio anywhere
// crashes the entire process on boot, not just the scraper.
if (typeof globalThis.File === 'undefined') {
  globalThis.File = require('node:buffer').File;
}

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const canonicalSearchRoutes = require('./routes/canonicalSearch');
const publicSearchRoutes = require('./routes/publicSearch');
const taxonomyRoutes = require('./routes/taxonomy');
const competitionRoutes = require('./routes/competitions');
const fixtureRoutes = require('./routes/fixtures');
const submissionRoutes = require('./routes/submissions');
const clubRoutes = require('./routes/clubs');
const playerRoutes = require('./routes/players');
const sourceRoutes = require('./routes/sources');
const monitoringRoutes = require('./routes/monitoring');
const showRoutes = require('./routes/shows');
const followRoutes = require('./routes/follows');
const pollRoutes = require('./routes/polls');
// Kits/Shop (Team/Kit/Order/OrderItem) retired for legal reasons.
// server/routes/shop.js and server/routes/orders.js stay on disk, dormant
// not deleted, unmounted here. The public-facing pages (shop.html,
// order-confirmation.html, js/shop.js, js/cart.js,
// js/order-confirmation.js) were themselves actually deleted 2026-09-13 —
// unlike the server side, they were reachable-but-broken dead ends with
// nothing dormant about them, not a clean unreferenced state. Remounting
// this later means rebuilding those pages too, not just re-adding these
// two requires.
const { syncLeagues } = require('./jobs/syncLeagues');
const { syncSquads } = require('./jobs/syncSquads');
const { syncKenyaCup } = require('./jobs/syncKenyaCup');
const { syncTheSportsDB } = require('./jobs/syncTheSportsDB');
const { syncBallDontLie } = require('./jobs/syncBallDontLie');
const { runMonitoringFetch } = require('./jobs/runMonitoringFetch');
const { runMonitoringEnrich } = require('./jobs/runMonitoringEnrich');

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set — refusing to start with a guessable session-signing key.');
}

// Sessions persist to disk (not the default in-memory MemoryStore), keyed
// off the same directory Prisma's own SQLite file lives in — /data on
// Railway (the persistent volume, see DATABASE_URL), a local prisma/
// subfolder in dev. This means an admin login now survives a redeploy
// instead of every deploy silently logging every admin out.
const rawDbPath = (process.env.DATABASE_URL || 'file:./dev.db').replace(/^file:/, '');
const dbDir = path.isAbsolute(rawDbPath)
  ? path.dirname(rawDbPath)
  : path.join(__dirname, '..', 'prisma', path.dirname(rawDbPath));
const sessionsDir = path.join(dbDir, 'sessions');

const app = express();

// Railway terminates TLS at its own proxy and forwards plain HTTP to this
// process — without trust proxy, Express never sees the connection as
// secure, so the secure-cookie setting below would silently stop sessions
// from persisting at all in production.
app.set('trust proxy', 1);

// Wave 1 (security audit): no security headers existed at all before
// this — no CSP, no X-Frame-Options, no HSTS. Default helmet's CSP is
// too strict for this app as-is: every public/admin page here builds its
// HTML by string-templating in JS (public/js/*.js, public/admin/js/*.js)
// and relies heavily on inline event-handler attributes (onerror= for
// image fallbacks especially — grep confirms this across most page
// scripts) rather than addEventListener, and cover/crest/photo images
// come from arbitrary admin-entered URLs, not a fixed asset host.
// Migrating every inline handler to real event listeners so CSP could
// drop 'unsafe-inline' would be a much larger, separate pass — this
// configures the CSP to match how the app actually behaves today
// (confirmed by reading the code, not guessed) rather than either
// disabling it outright or shipping a policy that breaks image
// fallbacks and the YouTube embeds across every article/episode page.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      // Helmet defaults script-src-attr to 'none', which (per CSP Level
      // 3) overrides scriptSrc above specifically for inline event-
      // handler attributes (onerror=, onclick=) — confirmed by curling
      // this server's own response headers before adding this override,
      // not assumed. Without it every onerror-based image fallback
      // across public/js and public/admin/js would silently stop firing.
      scriptSrcAttr: ["'unsafe-inline'"],
      // Every public page's <head> links Google Fonts directly (confirmed
      // by grepping every public/*.html and public/admin/*.html for an
      // external href/src, not assumed — that grep found nothing else
      // external). style-src has to allow the stylesheet host itself,
      // separately from font-src allowing the actual woff2 files.
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'https:', 'data:'],
      frameSrc: ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      connectSrc: ["'self'"],
    },
  },
}));

app.use(express.json());
app.use(session({
  store: new FileStore({ path: sessionsDir, logFn: () => {}, retries: 0 }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
    secure: !!process.env.RAILWAY_ENVIRONMENT,
    sameSite: 'lax',
  },
}));

// Login brute-forcing was flagged as the one open item in an earlier
// security pass (BLUEPRINT.md's audit notes: "no login rate-limiting,
// mitigated only by bcrypt cost") — this is that fix. Scoped to the login
// route specifically (not every /api/auth/* route), matching the Data
// Platform's own identical pattern (apps/api/src/index.ts).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — try again later.' },
});
app.use('/api/auth/login', loginLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/canonical-search', canonicalSearchRoutes);
app.use('/api/search', publicSearchRoutes);
app.use('/api', taxonomyRoutes); // /api/sports, /api/tags, /api/authors
app.use('/api/competitions', competitionRoutes);
app.use('/api/fixtures', fixtureRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/sources', sourceRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/shows', showRoutes);
app.use('/api/follows', followRoutes);
// Mounted at /api, not /api/polls — polls.js's own routes already carry
// full paths (/articles/:articleId/poll, /polls/:pollId/vote), matching
// taxonomy.js's convention for the same reason (/api/sports, /api/tags,
// /api/authors all coexisting under one router).
app.use('/api', pollRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Underdoggs Sports Cast running at http://localhost:${PORT}`);
});

// Global (API-sourced) competition standings/fixtures — never Kenyan
// competitions, which stay newsroom-entered. Runs every 30 minutes; syncLeagues() itself
// no-ops with a warning if FOOTBALL_DATA_API_KEY isn't set, so this is safe
// to leave scheduled even before that key exists.
const SYNC_INTERVAL_CRON = process.env.SYNC_INTERVAL_CRON || '*/30 * * * *';
cron.schedule(SYNC_INTERVAL_CRON, () => {
  syncLeagues().catch((err) => console.error('[syncLeagues] Unhandled error:', err));
});

// Squad rosters change far less often than scores — once a day is plenty,
// and keeps this well clear of Wikidata's soft rate limits even across a
// run that touches several competitions' full squads.
const SQUAD_SYNC_CRON = process.env.SQUAD_SYNC_CRON || '0 3 * * *';
cron.schedule(SQUAD_SYNC_CRON, () => {
  syncSquads().catch((err) => console.error('[syncSquads] Unhandled error:', err));
});

// Kenya Cup standings, scraped from kenyacup.co.ke (no real API exists) —
// deliberately infrequent given this is "no known prohibition," not
// "confirmed permission," and rugby doesn't play midweek anyway.
const KENYA_CUP_SYNC_CRON = process.env.KENYA_CUP_SYNC_CRON || '0 4 * * *';
cron.schedule(KENYA_CUP_SYNC_CRON, () => {
  syncKenyaCup().catch((err) => console.error('[syncKenyaCup] Unhandled error:', err));
});

// International fixtures (Six Nations, EuroLeague, world-title boxing, PDC
// Darts) via TheSportsDB's free tier — daily is plenty, these aren't
// Kenya-specific so there's no local urgency, and it keeps well clear of
// any rate limit.
const THESPORTSDB_SYNC_CRON = process.env.THESPORTSDB_SYNC_CRON || '30 4 * * *';
cron.schedule(THESPORTSDB_SYNC_CRON, () => {
  syncTheSportsDB().catch((err) => console.error('[syncTheSportsDB] Unhandled error:', err));
});

// NBA fixtures via balldontlie.io — added alongside TheSportsDB's EuroLeague
// feed, not instead of it, so Basketball carries both competitions plus the
// local KBF Premier League. syncBallDontLie() itself no-ops with a warning
// if BALLDONTLIE_API_KEY isn't set. Offset by 5 minutes from the
// TheSportsDB slot purely so the two never overlap on a shared host.
const BALLDONTLIE_SYNC_CRON = process.env.BALLDONTLIE_SYNC_CRON || '35 4 * * *';
cron.schedule(BALLDONTLIE_SYNC_CRON, () => {
  syncBallDontLie().catch((err) => console.error('[syncBallDontLie] Unhandled error:', err));
});

// Monitoring engine (internal newsroom leads dashboard — see
// prisma/schema.prisma's Source/MonitoredItem block and BLUEPRINT.md §11).
// Fetch and enrich run on separate cadences deliberately: fetching is
// cheap and safe to run often, enrichment calls a paid LLM API per item,
// so it runs less frequently and just picks up whatever fetch has queued.
const MONITORING_FETCH_CRON = process.env.MONITORING_FETCH_CRON || '*/20 * * * *';
cron.schedule(MONITORING_FETCH_CRON, () => {
  runMonitoringFetch().catch((err) => console.error('[runMonitoringFetch] Unhandled error:', err));
});

const MONITORING_ENRICH_CRON = process.env.MONITORING_ENRICH_CRON || '*/10 * * * *';
cron.schedule(MONITORING_ENRICH_CRON, () => {
  runMonitoringEnrich().catch((err) => console.error('[runMonitoringEnrich] Unhandled error:', err));
});
