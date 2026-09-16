const express = require('express');
const prisma = require('../db');
const { slugify } = require('../utils/slugify');
const { requireRole } = require('../middleware/auth');
const { fetchCanonicalTeam, verifyCanonicalTeam, fetchCanonicalAthlete, verifyCanonicalAthlete } = require('../lib/canonicalData');

const router = express.Router();

// ---- Public: list clubs, optionally filtered by competition ----
router.get('/', async (req, res) => {
  const where = req.query.competition ? { competition: { slug: req.query.competition } } : {};
  const clubs = await prisma.club.findMany({
    where,
    include: { competition: { include: { sport: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ clubs });
});

// ---- Public: one club + its players ----
router.get('/:slug', async (req, res) => {
  const club = await prisma.club.findUnique({
    where: { slug: req.params.slug },
    include: {
      competition: { include: { sport: true } },
      players: { orderBy: { name: 'asc' } },
      staff: { orderBy: { name: 'asc' } },
      sponsors: { orderBy: { name: 'asc' } },
    },
  });
  if (!club) return res.status(404).json({ error: 'Club not found' });

  // Fails soft — see lib/canonicalData.js. A Data Platform outage, or a
  // club/player with no mapping at all, just means these come back null,
  // never a broken club page. Fetched in parallel (one club's roster can
  // be dozens of players; sequential would multiply the Data Platform's
  // own worst-case 3s timeout by every unlinked player).
  const [canonicalTeam, playersWithCanonicalAthlete] = await Promise.all([
    fetchCanonicalTeam(club.id),
    Promise.all(club.players.map(async (p) => ({ ...p, canonicalAthlete: await fetchCanonicalAthlete(p.id) }))),
  ]);

  res.json({ club: { ...club, canonicalTeam, players: playersWithCanonicalAthlete } });
});

// ---- Admin: create a club ----
router.post('/', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, competitionId, crestUrl, venue, owner } = req.body;
  if (!name || !competitionId) return res.status(400).json({ error: 'name and competitionId are required' });
  const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
  if (!competition) return res.status(400).json({ error: 'Competition not found' });
  const club = await prisma.club.create({
    data: { name, slug: slugify(`${name}-${competition.slug}`), competitionId, crestUrl: crestUrl || null, venue: venue || null, owner: owner || null, source: 'MANUAL' },
  });
  res.status(201).json({ club });
});

// ---- Admin: update a club ----
router.put('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, crestUrl, venue, owner } = req.body;
  const existing = await prisma.club.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Club not found' });
  const club = await prisma.club.update({
    where: { id: req.params.id },
    data: {
      name: name ?? existing.name,
      crestUrl: crestUrl !== undefined ? (crestUrl || null) : existing.crestUrl,
      venue: venue !== undefined ? (venue || null) : existing.venue,
      owner: owner !== undefined ? (owner || null) : existing.owner,
    },
  });
  res.json({ club });
});

// ---- Admin: delete a club (and its players/staff/sponsors) ----
router.delete('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.player.deleteMany({ where: { clubId: req.params.id } });
  await prisma.staff.deleteMany({ where: { clubId: req.params.id } });
  await prisma.sponsor.deleteMany({ where: { clubId: req.params.id } });
  await prisma.club.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ---- Admin: fetch a club's current canonical Team link, if any ----
router.get('/:id/canonical-team', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const canonicalTeam = await fetchCanonicalTeam(req.params.id);
  res.json({ canonicalTeam });
});

// ---- Admin: link a club to a canonical Data Platform Team ----
// Never stores a canonicalId that hasn't just been live-verified to
// exist — same reasoning as articles.js's canonical-event link.
router.put('/:id/canonical-team', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { canonicalTeamId } = req.body;
  if (!canonicalTeamId) return res.status(400).json({ error: 'canonicalTeamId is required' });

  const club = await prisma.club.findUnique({ where: { id: req.params.id } });
  if (!club) return res.status(404).json({ error: 'Club not found' });

  const team = await verifyCanonicalTeam(canonicalTeamId);
  if (!team) {
    return res.status(422).json({ error: 'No Data Platform Team with that id could be verified (check the id, or the Data Platform may be unreachable — try again).' });
  }

  await prisma.canonicalMapping.upsert({
    where: {
      localEntityType_localId_provider: { localEntityType: 'CLUB', localId: club.id, provider: 'underdawgs-data' },
    },
    update: { canonicalEntityType: 'Team', canonicalId: canonicalTeamId },
    create: { localEntityType: 'CLUB', localId: club.id, canonicalEntityType: 'Team', canonicalId: canonicalTeamId },
  });

  res.json({ canonicalTeam: team });
});

router.delete('/:id/canonical-team', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.canonicalMapping.deleteMany({
    where: { localEntityType: 'CLUB', localId: req.params.id, provider: 'underdawgs-data' },
  });
  res.json({ ok: true });
});

// ---- Admin: add a player to a club ----
router.post('/:id/players', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, position, nationality, age, photoUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const club = await prisma.club.findUnique({ where: { id: req.params.id } });
  if (!club) return res.status(400).json({ error: 'Club not found' });
  // Scoped by club, same convention as Club.slug itself (scoped by
  // competition) — a common player name can't collide across clubs. Same
  // duplicate-slug fallback used elsewhere in this file (articles.js's own
  // title-slug collision handling): append a short suffix if it does.
  let slug = slugify(`${name}-${club.slug}`);
  if (await prisma.player.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
  const player = await prisma.player.create({
    data: {
      clubId: req.params.id,
      name,
      slug,
      position: position || null,
      nationality: nationality || null,
      age: age ? Number(age) : null,
      photoUrl: photoUrl || null,
    },
  });
  res.status(201).json({ player });
});

// ---- Public: one player's profile ----
router.get('/players/:slug', async (req, res) => {
  const player = await prisma.player.findUnique({
    where: { slug: req.params.slug },
    include: { club: { include: { competition: { include: { sport: true } } } } },
  });
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const canonicalAthlete = await fetchCanonicalAthlete(player.id);
  res.json({ player: { ...player, canonicalAthlete } });
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

// ---- Admin: fetch a player's current canonical Athlete link, if any ----
router.get('/players/:playerId/canonical-athlete', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const canonicalAthlete = await fetchCanonicalAthlete(req.params.playerId);
  res.json({ canonicalAthlete });
});

// ---- Admin: link a player to a canonical Data Platform Athlete ----
router.put('/players/:playerId/canonical-athlete', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { canonicalAthleteId } = req.body;
  if (!canonicalAthleteId) return res.status(400).json({ error: 'canonicalAthleteId is required' });

  const player = await prisma.player.findUnique({ where: { id: req.params.playerId } });
  if (!player) return res.status(404).json({ error: 'Player not found' });

  const athlete = await verifyCanonicalAthlete(canonicalAthleteId);
  if (!athlete) {
    return res.status(422).json({ error: 'No Data Platform Athlete with that id could be verified (check the id, or the Data Platform may be unreachable — try again).' });
  }

  await prisma.canonicalMapping.upsert({
    where: {
      localEntityType_localId_provider: { localEntityType: 'PLAYER', localId: player.id, provider: 'underdawgs-data' },
    },
    update: { canonicalEntityType: 'Athlete', canonicalId: canonicalAthleteId },
    create: { localEntityType: 'PLAYER', localId: player.id, canonicalEntityType: 'Athlete', canonicalId: canonicalAthleteId },
  });

  res.json({ canonicalAthlete: athlete });
});

router.delete('/players/:playerId/canonical-athlete', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.canonicalMapping.deleteMany({
    where: { localEntityType: 'PLAYER', localId: req.params.playerId, provider: 'underdawgs-data' },
  });
  res.json({ ok: true });
});

// ---- Admin: add a staff member (coach/assistant/etc.) to a club ----
router.post('/:id/staff', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, role, nationality, photoUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const staff = await prisma.staff.create({
    data: { clubId: req.params.id, name, role: role || null, nationality: nationality || null, photoUrl: photoUrl || null },
  });
  res.status(201).json({ staff });
});

// ---- Admin: update a staff member ----
router.put('/staff/:staffId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const existing = await prisma.staff.findUnique({ where: { id: req.params.staffId } });
  if (!existing) return res.status(404).json({ error: 'Staff member not found' });
  const { name, role, nationality, photoUrl } = req.body;
  const staff = await prisma.staff.update({
    where: { id: req.params.staffId },
    data: {
      name: name ?? existing.name,
      role: role !== undefined ? (role || null) : existing.role,
      nationality: nationality !== undefined ? (nationality || null) : existing.nationality,
      photoUrl: photoUrl !== undefined ? (photoUrl || null) : existing.photoUrl,
    },
  });
  res.json({ staff });
});

// ---- Admin: delete a staff member ----
router.delete('/staff/:staffId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.staff.delete({ where: { id: req.params.staffId } });
  res.json({ ok: true });
});

// ---- Admin: add a sponsor to a club ----
router.post('/:id/sponsors', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, logoUrl, website } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const sponsor = await prisma.sponsor.create({
    data: { clubId: req.params.id, name, logoUrl: logoUrl || null, website: website || null },
  });
  res.status(201).json({ sponsor });
});

// ---- Admin: update a sponsor ----
router.put('/sponsors/:sponsorId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const existing = await prisma.sponsor.findUnique({ where: { id: req.params.sponsorId } });
  if (!existing) return res.status(404).json({ error: 'Sponsor not found' });
  const { name, logoUrl, website } = req.body;
  const sponsor = await prisma.sponsor.update({
    where: { id: req.params.sponsorId },
    data: {
      name: name ?? existing.name,
      logoUrl: logoUrl !== undefined ? (logoUrl || null) : existing.logoUrl,
      website: website !== undefined ? (website || null) : existing.website,
    },
  });
  res.json({ sponsor });
});

// ---- Admin: delete a sponsor ----
router.delete('/sponsors/:sponsorId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.sponsor.delete({ where: { id: req.params.sponsorId } });
  res.json({ ok: true });
});

module.exports = router;
