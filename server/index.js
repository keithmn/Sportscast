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
const scoresRoutes = require('./routes/scores');
const submissionRoutes = require('./routes/submissions');
const shopRoutes = require('./routes/shop');
const orderRoutes = require('./routes/orders');
const clubRoutes = require('./routes/clubs');
const { syncLeagues } = require('./jobs/syncLeagues');
const { syncSquads } = require('./jobs/syncSquads');
const { syncKenyaCup } = require('./jobs/syncKenyaCup');
const { syncTheSportsDB } = require('./jobs/syncTheSportsDB');

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
app.use('/api/leagues', scoresRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/clubs', clubRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Underdoggs Sports Cast running at http://localhost:${PORT}`);
});

// Global (API-sourced) league standings/fixtures — never Kenyan leagues,
// which stay newsroom-entered. Runs every 30 minutes; syncLeagues() itself
// no-ops with a warning if FOOTBALL_DATA_API_KEY isn't set, so this is safe
// to leave scheduled even before that key exists.
const SYNC_INTERVAL_CRON = process.env.SYNC_INTERVAL_CRON || '*/30 * * * *';
cron.schedule(SYNC_INTERVAL_CRON, () => {
  syncLeagues().catch((err) => console.error('[syncLeagues] Unhandled error:', err));
});

// Squad rosters change far less often than scores — once a day is plenty,
// and keeps this well clear of Wikidata's soft rate limits even across a
// run that touches several leagues' full squads.
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
