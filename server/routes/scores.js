const express = require('express');
const prisma = require('../db');
const { slugify } = require('../utils/slugify');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// ---- Public: list leagues ----
router.get('/', async (req, res) => {
  const leagues = await prisma.league.findMany({
    include: { sport: true },
    orderBy: { name: 'asc' },
  });
  res.json({ leagues });
});

// ---- Public: single league with standings + fixtures ----
router.get('/:slug', async (req, res) => {
  const league = await prisma.league.findUnique({
    where: { slug: req.params.slug },
    include: {
      sport: true,
      standings: { orderBy: { position: 'asc' } },
      fixtures: { orderBy: { kickoff: 'asc' } },
    },
  });
  if (!league) return res.status(404).json({ error: 'League not found' });
  res.json({ league });
});

// ---- Admin: create a league ----
router.post('/', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, sportId, source } = req.body;
  if (!name || !sportId) return res.status(400).json({ error: 'name and sportId are required' });
  const league = await prisma.league.create({
    data: { name, slug: slugify(name), sportId, source: source === 'API' ? 'API' : 'MANUAL' },
  });
  res.status(201).json({ league });
});

// ---- Admin: replace a league's standings table wholesale ----
// Simplest correct approach for a small, manually-curated table: the admin
// re-submits the full table on every save rather than editing rows one at a
// time, so there's no drift between row order and league table position.
router.put('/:id/standings', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });

  await prisma.$transaction([
    prisma.standingRow.deleteMany({ where: { leagueId: req.params.id } }),
    prisma.standingRow.createMany({
      data: rows.map((r, i) => ({
        leagueId: req.params.id,
        position: r.position ?? i + 1,
        teamName: r.teamName,
        played: r.played || 0,
        won: r.won || 0,
        drawn: r.drawn || 0,
        lost: r.lost || 0,
        goalsFor: r.goalsFor || 0,
        goalsAgainst: r.goalsAgainst || 0,
        points: r.points || 0,
      })),
    }),
  ]);

  const standings = await prisma.standingRow.findMany({
    where: { leagueId: req.params.id },
    orderBy: { position: 'asc' },
  });
  res.json({ standings });
});

// ---- Admin: add a fixture ----
router.post('/:id/fixtures', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { homeTeam, awayTeam, kickoff, status } = req.body;
  if (!homeTeam || !awayTeam || !kickoff) {
    return res.status(400).json({ error: 'homeTeam, awayTeam, and kickoff are required' });
  }
  const fixture = await prisma.fixture.create({
    data: {
      leagueId: req.params.id,
      homeTeam,
      awayTeam,
      kickoff: new Date(kickoff),
      status: status || 'SCHEDULED',
    },
  });
  res.status(201).json({ fixture });
});

// ---- Admin: update a fixture (score, status, reschedule) ----
router.put('/fixtures/:fixtureId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const existing = await prisma.fixture.findUnique({ where: { id: req.params.fixtureId } });
  if (!existing) return res.status(404).json({ error: 'Fixture not found' });

  const { homeTeam, awayTeam, kickoff, homeScore, awayScore, status } = req.body;
  const fixture = await prisma.fixture.update({
    where: { id: req.params.fixtureId },
    data: {
      homeTeam: homeTeam ?? existing.homeTeam,
      awayTeam: awayTeam ?? existing.awayTeam,
      kickoff: kickoff ? new Date(kickoff) : existing.kickoff,
      homeScore: homeScore !== undefined ? homeScore : existing.homeScore,
      awayScore: awayScore !== undefined ? awayScore : existing.awayScore,
      status: status ?? existing.status,
    },
  });
  res.json({ fixture });
});

// ---- Admin: delete a fixture ----
router.delete('/fixtures/:fixtureId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.fixture.delete({ where: { id: req.params.fixtureId } });
  res.json({ ok: true });
});

module.exports = router;
