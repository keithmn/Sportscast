const express = require('express');
const prisma = require('../db');

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
      competition: { sport: { slug: sport } },
      kickoff: { gte: start, lt: end },
    },
    include: {
      competition: { select: { id: true, name: true, slug: true, category: true, region: true } },
      homeClub: { select: { id: true, name: true, slug: true, crestUrl: true } },
      awayClub: { select: { id: true, name: true, slug: true, crestUrl: true } },
    },
    orderBy: { kickoff: 'asc' },
  });

  res.json({ fixtures });
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

  const fixtures = await prisma.fixture.findMany({
    where: {
      status: { not: 'FINISHED' },
      kickoff: { gte: since },
      competition: { sport: { isActive: true } },
    },
    include: {
      competition: { select: { id: true, name: true, slug: true, category: true, region: true, sport: { select: { name: true, slug: true } } } },
      homeClub: { select: { id: true, name: true, slug: true, crestUrl: true } },
      awayClub: { select: { id: true, name: true, slug: true, crestUrl: true } },
    },
    orderBy: { kickoff: 'asc' },
    take: limit,
  });

  res.json({ fixtures });
});

module.exports = router;
