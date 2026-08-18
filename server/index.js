require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const taxonomyRoutes = require('./routes/taxonomy');
const scoresRoutes = require('./routes/scores');
const submissionRoutes = require('./routes/submissions');
const { syncLeagues } = require('./jobs/syncLeagues');

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
