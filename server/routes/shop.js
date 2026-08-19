const express = require('express');
const prisma = require('../db');
const { slugify } = require('../utils/slugify');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// ---- Public: list teams, optionally filtered by sport ----
router.get('/teams', async (req, res) => {
  const where = req.query.sport ? { sport: { slug: req.query.sport } } : {};
  const teams = await prisma.team.findMany({
    where,
    include: { sport: true, league: true, kits: { where: { active: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ teams });
});

// ---- Public: one team + all its active kits ----
router.get('/teams/:slug', async (req, res) => {
  const team = await prisma.team.findUnique({
    where: { slug: req.params.slug },
    include: { sport: true, league: true, kits: { where: { active: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json({ team });
});

// ---- Admin: create a team ----
router.post('/teams', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, sportId, leagueId, crestUrl } = req.body;
  if (!name || !sportId) return res.status(400).json({ error: 'name and sportId are required' });
  const team = await prisma.team.create({
    data: { name, slug: slugify(name), sportId, leagueId: leagueId || null, crestUrl: crestUrl || null },
  });
  res.status(201).json({ team });
});

// ---- Admin: update a team ----
router.put('/teams/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, sportId, leagueId, crestUrl } = req.body;
  const team = await prisma.team.update({
    where: { id: req.params.id },
    data: {
      ...(name ? { name, slug: slugify(name) } : {}),
      ...(sportId ? { sportId } : {}),
      leagueId: leagueId || null,
      crestUrl: crestUrl || null,
    },
  });
  res.json({ team });
});

// ---- Admin: delete a team (and its kits) ----
router.delete('/teams/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.kit.deleteMany({ where: { teamId: req.params.id } });
  await prisma.team.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ---- Admin: add a kit to a team ----
router.post('/teams/:id/kits', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { label, priceKesCents, photoUrl, sizesAvailable } = req.body;
  if (!label || !priceKesCents) return res.status(400).json({ error: 'label and priceKesCents are required' });
  const kit = await prisma.kit.create({
    data: {
      teamId: req.params.id,
      label,
      priceKesCents: Math.round(Number(priceKesCents)),
      photoUrl: photoUrl || null,
      sizesAvailable: sizesAvailable || null,
    },
  });
  res.status(201).json({ kit });
});

// ---- Admin: update a kit ----
router.put('/kits/:kitId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const existing = await prisma.kit.findUnique({ where: { id: req.params.kitId } });
  if (!existing) return res.status(404).json({ error: 'Kit not found' });

  const { label, priceKesCents, photoUrl, sizesAvailable, active } = req.body;
  const kit = await prisma.kit.update({
    where: { id: req.params.kitId },
    data: {
      label: label ?? existing.label,
      priceKesCents: priceKesCents !== undefined ? Math.round(Number(priceKesCents)) : existing.priceKesCents,
      photoUrl: photoUrl !== undefined ? (photoUrl || null) : existing.photoUrl,
      sizesAvailable: sizesAvailable !== undefined ? (sizesAvailable || null) : existing.sizesAvailable,
      active: active !== undefined ? Boolean(active) : existing.active,
    },
  });
  res.json({ kit });
});

// ---- Admin: delete a kit ----
router.delete('/kits/:kitId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.kit.delete({ where: { id: req.params.kitId } });
  res.json({ ok: true });
});

module.exports = router;
