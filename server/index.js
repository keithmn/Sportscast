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
const session = require('express-session');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const taxonomyRoutes = require('./routes/taxonomy');
const competitionRoutes = require('./routes/competitions');
const fixtureRoutes = require('./routes/fixtures');
const submissionRoutes = require('./routes/submissions');
const clubRoutes = require('./routes/clubs');
const playerRoutes = require('./routes/players');
const sourceRoutes = require('./routes/sources');
const monitoringRoutes = require('./routes/monitoring');
// Kits/Shop (Team/Kit/Order/OrderItem) retired for legal reasons — routes,
// pages, and Prisma models left on disk (dormant, not deleted) but
// unmounted here so nothing reachable actually depends on them. See
// server/routes/shop.js and server/routes/orders.js.
const { syncLeagues } = require('./jobs/syncLeagues');
const { syncSquads } = require('./jobs/syncSquads');
const { syncKenyaCup } = require('./jobs/syncKenyaCup');
const { syncTheSportsDB } = require('./jobs/syncTheSportsDB');
const { syncBallDontLie } = require('./jobs/syncBallDontLie');
const { runMonitoringFetch } = require('./jobs/runMonitoringFetch');
const { runMonitoringEnrich } = require('./jobs/runMonitoringEnrich');

const app = express();

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 },
}));

app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api', taxonomyRoutes); // /api/sports, /api/tags, /api/authors
app.use('/api/competitions', competitionRoutes);
app.use('/api/fixtures', fixtureRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/sources', sourceRoutes);
app.use('/api/monitoring', monitoringRoutes);

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
