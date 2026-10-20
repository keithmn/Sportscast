const express = require('express');
const prisma = require('../db');
const { requireRole, isEditor } = require('../middleware/auth');
const { fetchCanonicalFixture } = require('../lib/canonicalData');

const router = express.Router();

// East Africa Time is a fixed UTC+3 offset (no DST) — safe to hardcode
// rather than pull in a timezone library. Fixture.kickoff is stored via a
// bare `new Date(...)` with no timezone awareness (server/routes/
// competitions.js, sync jobs), so a "date" query has to compute its own
// day window explicitly in EAT — trusting server-local/UTC would put a
// late-evening Nairobi kickoff on the wrong calendar day for this
// audience.
function eatDayWindow(dateStr) {
  const start = new Date(`${dateStr}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ---- Public: fixtures for one sport on one calendar day, across every
// competition — powers the sport hub's date-filtered Scores & Fixtures
// tab. Each fixture carries its competition (id/name/slug/category/region)
// so the client can group results and offer a competition filter. ----
router.get('/', async (req, res) => {
  const { sport, date } = req.query;
  if (!sport || !date) return res.status(400).json({ error: 'sport and date query params are required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

  const { start, end } = eatDayWindow(date);
  if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'invalid date' });

  const fixtures = await prisma.fixture.findMany({
    where: {
      competition: { sport: { slug: sport }, isActive: true },
      kickoff: { gte: start, lt: end },
    },
    include: {
      competition: { select: { id: true, name: true, slug: true, category: true, jurisdiction: true, format: true, tier: true, region: true } },
      homeClub: { select: { id: true, name: true, slug: true, crestUrl: true, venue: true } },
      awayClub: { select: { id: true, name: true, slug: true, crestUrl: true } },
      venue: { select: { id: true, name: true, slug: true, city: true } },
    },
    orderBy: { kickoff: 'asc' },
  });

  res.json({ fixtures });
});

// ---- Public: the nearest days either side of `date` that have fixtures
// for this sport — lets the date-strip Scores tab turn "nothing on today"
// into "last results Sat 17 Oct / next fixtures Tue 20 Oct" instead of a
// dead end. Dates are Nairobi calendar days, like the route above. ----
router.get('/nearest', async (req, res) => {
  const { sport, date } = req.query;
  if (!sport || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'sport and date (YYYY-MM-DD) are required' });
  const { start, end } = eatDayWindow(date);
  if (Number.isNaN(start.getTime())) return res.status(400).json({ error: 'invalid date' });
  const where = { competition: { sport: { slug: sport }, isActive: true } };
  const [before, after] = await Promise.all([
    prisma.fixture.findFirst({ where: { ...where, kickoff: { lt: start } }, orderBy: { kickoff: 'desc' }, select: { kickoff: true } }),
    prisma.fixture.findFirst({ where: { ...where, kickoff: { gte: end } }, orderBy: { kickoff: 'asc' }, select: { kickoff: true } }),
  ]);
  // Nairobi is UTC+3 year-round (no DST), so shifting by 3h gives the EAT calendar day.
  const eatDay = (d) => (d ? new Date(d.kickoff.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10) : null);
  res.json({ previous: eatDay(before), next: eatDay(after) });
});

// ---- Public: a small cross-sport "what's on" list for the homepage teaser
// — not scoped to one sport or one calendar day like the route above.
// Anything not FINISHED (SCHEDULED/LIVE/POSTPONED), soonest kickoff first,
// across every active sport. Registered before any '/:id'-shaped route
// would need to exist, so it can't collide with one later. ----
router.get('/upcoming', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 6, 20);
  // A POSTPONED fixture whose kickoff never got updated to a real new date
  // shouldn't camp at the front of an ascending sort forever — a 3-hour
  // grace period still catches a fixture that's LIVE right now (kickoff
  // just before "now"), without letting months-old backlog dominate this
  // teaser. That backlog still lives on the full Scores & Fixtures page.
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000);
  // Only the next three weeks — with little on, an open-ended list padded
  // the homepage with a Six Nations game four months away. Kenyan
  // competitions come first, each group soonest first.
  const until = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);

  const candidates = await prisma.fixture.findMany({
    where: {
      status: { not: 'FINISHED' },
      kickoff: { gte: since, lte: until },
      competition: { sport: { isActive: true }, isActive: true },
    },
    include: {
      competition: { select: { id: true, name: true, slug: true, category: true, jurisdiction: true, format: true, tier: true, region: true, sport: { select: { name: true, slug: true } } } },
      homeClub: { select: { id: true, name: true, slug: true, crestUrl: true, venue: true } },
      awayClub: { select: { id: true, name: true, slug: true, crestUrl: true } },
      venue: { select: { id: true, name: true, slug: true, city: true } },
    },
    orderBy: { kickoff: 'asc' },
    take: 100,
  });
  const fixtures = [
    ...candidates.filter((f) => f.competition.region === 'KENYA'),
    ...candidates.filter((f) => f.competition.region !== 'KENYA'),
  ].slice(0, limit);

  res.json({ fixtures });
});

// ---- Admin: today's fixtures across every sport/competition (Wave 4 —
// dashboard.js's "Fixtures" bucket). The public GET / above needs a
// sport param and is scoped to one; this is the cross-sport count the
// dashboard's "what needs attention today" view actually needs. ----
router.get('/today', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { start, end } = eatDayWindow(new Date().toISOString().slice(0, 10));
  const fixtures = await prisma.fixture.findMany({
    where: { kickoff: { gte: start, lt: end }, competition: { isActive: true } },
    include: { competition: { select: { name: true, slug: true } } },
    orderBy: { kickoff: 'asc' },
  });
  res.json({ fixtures });
});

// ---- Admin: recently-finished fixtures with no match report yet (Wave 9
// §8.8 — a real dashboard gap: the existing "match underway" alert only
// covers LIVE fixtures, nothing flagged once a fixture finishes without
// ever getting a report). Scoped to the last 7 days — this repo also
// syncs global leagues via football-data.org/TheSportsDB/BallDontLie,
// and most of those FINISHED fixtures were never going to get a
// Sportscast report at all; an unbounded all-time query would make this
// card permanently, uselessly huge rather than "what needs attention
// now." ----
router.get('/missing-reports', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fixtures = await prisma.fixture.findMany({
    where: { status: 'FINISHED', kickoff: { gte: sevenDaysAgo }, articles: { none: {} }, competition: { isActive: true } },
    include: { competition: { select: { name: true, slug: true } } },
    orderBy: { kickoff: 'desc' },
  });
  res.json({ fixtures });
});

// ---- Admin: upcoming fixtures still missing match details — the research
// desk's to-do list for the week (dashboard card). Next 7 days, visible
// competitions only, not finished, with no venue or no broadcaster set.
// ---- Admin: Kenyan results overdue — kicked off more than 3 hours ago
// (last 30 days) and still not FINISHED or POSTPONED. The dashboard's
// "enter these results" list; the public pages show these as "Result
// pending" until then. ----
// Correspondents see only their own competitions'.
router.get('/overdue', requireRole('ADMIN', 'EDITOR', 'CORRESPONDENT'), async (req, res) => {
  const now = Date.now();
  const scope = req.session.user.role === 'CORRESPONDENT' ? { id: { in: req.session.user.competitionIds || [] } } : {};
  const fixtures = await prisma.fixture.findMany({
    where: {
      status: { in: ['SCHEDULED', 'LIVE'] },
      kickoff: { lt: new Date(now - 3 * 60 * 60 * 1000), gte: new Date(now - 30 * 24 * 60 * 60 * 1000) },
      competition: { region: 'KENYA', isActive: true, ...scope },
    },
    include: { competition: { select: { id: true, name: true, slug: true } } },
    orderBy: { kickoff: 'asc' },
  });
  res.json({ fixtures });
});

// ---- Admin: rounds with a team missing — for each Kenyan league's
// current season, any round (e.g. "Matchweek 2") where a team in the
// table has no fixture. Catches a fixture that was never entered, which
// otherwise just silently isn't there. ----
router.get('/round-gaps', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const seasons = await prisma.competitionSeason.findMany({
    where: { isCurrent: true, competition: { region: 'KENYA', isActive: true, format: 'LEAGUE' } },
    include: {
      competition: { select: { id: true, name: true, slug: true } },
      standings: { select: { teamName: true } },
      fixtures: { where: { round: { not: null } }, select: { round: true, homeTeam: true, awayTeam: true } },
    },
  });
  const gaps = [];
  for (const season of seasons) {
    const teams = season.standings.map((r) => r.teamName);
    if (!teams.length) continue;
    const rounds = new Map();
    season.fixtures.forEach((f) => {
      if (!rounds.has(f.round)) rounds.set(f.round, new Set());
      rounds.get(f.round).add(f.homeTeam).add(f.awayTeam);
    });
    for (const [round, playing] of rounds) {
      const missing = teams.filter((t) => !playing.has(t));
      // An odd-sized league always has one team resting; only flag more.
      if (missing.length > teams.length % 2) gaps.push({ competition: season.competition, round, missing });
    }
  }
  res.json({ gaps });
});

// ---- Admin: correspondents' results waiting for an editor to confirm ----
router.get('/provisional', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const fixtures = await prisma.fixture.findMany({
    where: { resultProvisional: true, status: 'FINISHED' },
    include: { competition: { select: { id: true, name: true, slug: true } } },
    orderBy: { kickoff: 'asc' },
  });
  res.json({ fixtures });
});

router.get('/missing-info', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fixtures = await prisma.fixture.findMany({
    where: {
      kickoff: { gte: now, lt: weekAhead },
      status: { notIn: ['FINISHED', 'POSTPONED'] },
      competition: { isActive: true, region: 'KENYA' },
      OR: [{ venueId: null }, { broadcaster: null }],
    },
    include: { competition: { select: { name: true, slug: true } }, venue: { select: { name: true } } },
    orderBy: { kickoff: 'asc' },
  });
  res.json({
    fixtures: fixtures.map((f) => ({
      id: f.id, homeTeam: f.homeTeam, awayTeam: f.awayTeam, kickoff: f.kickoff, competition: f.competition,
      missing: [!f.venueId && 'venue', !f.broadcaster && 'broadcaster'].filter(Boolean),
    })),
  });
});

// ---- Admin: search local fixtures by team name, for the "attach fixture
// to a match report" picker on the article form (Wave 4 — there are 4,700+
// fixtures, far too many for a plain <select>). Registered before /:id for
// the same reason /upcoming is. ----
router.get('/search', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ fixtures: [] });

  const fixtures = await prisma.fixture.findMany({
    where: {
      OR: [
        { homeTeam: { contains: q } },
        { awayTeam: { contains: q } },
      ],
    },
    include: { competition: { select: { name: true } } },
    orderBy: { kickoff: 'desc' },
    take: 15,
  });
  res.json({ fixtures });
});

// ---- Public: a single fixture (Wave 4 — Match Hub). Registered last, per
// the /upcoming route's own comment above, so a literal path never gets
// swallowed as an :id. ----
router.get('/:id', async (req, res) => {
  const fixture = await prisma.fixture.findUnique({
    where: { id: req.params.id },
    include: {
      competition: { include: { sport: true } },
      homeClub: { select: { id: true, name: true, slug: true, crestUrl: true, venue: true } },
      awayClub: { select: { id: true, name: true, slug: true, crestUrl: true } },
      venue: { select: { id: true, name: true, slug: true, city: true } },
      // Published corrections (2026-10-19): the match page says what changed.
      corrections: { where: { status: 'APPLIED', revertedAt: null }, select: { id: true, beforeHome: true, beforeAway: true, beforeStatus: true, reason: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  // Hidden competitions (Competition.isActive false) 404 publicly, same as
  // their competition page — editors can still open them.
  if (!fixture || (!fixture.competition.isActive && !isEditor(req))) return res.status(404).json({ error: 'Fixture not found' });
  // Wave 9 §8.2 — same embed-in-the-public-response pattern
  // articles.js's GET /:slug uses for canonicalEvent. Fails soft to null
  // (no mapping, network error, Data Platform down) — the match page
  // always has its own local data to fall back to.
  const canonicalFixture = await fetchCanonicalFixture(fixture.id);
  res.json({ fixture: { ...fixture, canonicalFixture } });
});

module.exports = router;
