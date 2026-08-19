const express = require('express');
const prisma = require('../db');
const { slugify } = require('../utils/slugify');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// ---- Public: list clubs, optionally filtered by league ----
router.get('/', async (req, res) => {
  const where = req.query.league ? { league: { slug: req.query.league } } : {};
  const clubs = await prisma.club.findMany({
    where,
    include: { league: { include: { sport: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ clubs });
});

// ---- Public: one club + its players ----
router.get('/:slug', async (req, res) => {
  const club = await prisma.club.findUnique({
    where: { slug: req.params.slug },
    include: { league: { include: { sport: true } }, players: { orderBy: { name: 'asc' } } },
  });
  if (!club) return res.status(404).json({ error: 'Club not found' });
  res.json({ club });
});

// ---- Admin: create a club ----
router.post('/', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, leagueId, crestUrl, venue } = req.body;
  if (!name || !leagueId) return res.status(400).json({ error: 'name and leagueId are required' });
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return res.status(400).json({ error: 'League not found' });
  const club = await prisma.club.create({
    data: { name, slug: slugify(`${name}-${league.slug}`), leagueId, crestUrl: crestUrl || null, venue: venue || null, source: 'MANUAL' },
  });
  res.status(201).json({ club });
});

// ---- Admin: update a club ----
router.put('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, crestUrl, venue } = req.body;
  const existing = await prisma.club.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Club not found' });
  const club = await prisma.club.update({
    where: { id: req.params.id },
    data: {
      name: name ?? existing.name,
      crestUrl: crestUrl !== undefined ? (crestUrl || null) : existing.crestUrl,
      venue: venue !== undefined ? (venue || null) : existing.venue,
    },
  });
  res.json({ club });
});

// ---- Admin: delete a club (and its players) ----
router.delete('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.player.deleteMany({ where: { clubId: req.params.id } });
  await prisma.club.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ---- Admin: add a player to a club ----
router.post('/:id/players', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, position, nationality, age, photoUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const player = await prisma.player.create({
    data: {
      clubId: req.params.id,
      name,
      position: position || null,
      nationality: nationality || null,
      age: age ? Number(age) : null,
      photoUrl: photoUrl || null,
    },
  });
  res.status(201).json({ player });
});

// ---- Admin: update a player ----
router.put('/players/:playerId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const existing = await prisma.player.findUnique({ where: { id: req.params.playerId } });
  if (!existing) return res.status(404).json({ error: 'Player not found' });
  const { name, position, nationality, age, photoUrl } = req.body;
  const player = await prisma.player.update({
    where: { id: req.params.playerId },
    data: {
      name: name ?? existing.name,
      position: position !== undefined ? (position || null) : existing.position,
      nationality: nationality !== undefined ? (nationality || null) : existing.nationality,
      age: age !== undefined ? (age ? Number(age) : null) : existing.age,
      photoUrl: photoUrl !== undefined ? (photoUrl || null) : existing.photoUrl,
    },
  });
  res.json({ player });
});

// ---- Admin: delete a player ----
router.delete('/players/:playerId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.player.delete({ where: { id: req.params.playerId } });
  res.json({ ok: true });
});

module.exports = router;
