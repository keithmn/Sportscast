const express = require('express');
const prisma = require('../db');
const { slugify } = require('../utils/slugify');
const { requireRole } = require('../middleware/auth');
const { fetchCanonicalStandings } = require('../lib/canonicalData');
const { resolveClubsForFixture, resolveClubIdForTeamName } = require('../lib/clubResolution');

const router = express.Router();

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function logChange(entityType, entityId, action, summary, userName) {
  return prisma.changeLog.create({ data: { entityType, entityId, action, summary, userName } }).catch((err) => {
    // A logging failure should never block the real mutation it's describing.
    console.error('[competitions] Failed to write change log:', err.message);
  });
}

// ---- Public: list competitions, optionally scoped to one sport (used by
// the per-sport hub's Competitions tab, e.g. ?sport=football) ----
router.get('/', async (req, res) => {
  const competitions = await prisma.competition.findMany({
    where: req.query.sport ? { sport: { slug: req.query.sport } } : undefined,
    include: { sport: true },
    orderBy: { name: 'asc' },
  });
  res.json({ competitions });
});

// ---- Admin: recent changes across all competitions, most recent first ----
router.get('/changelog', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const entries = await prisma.changeLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ entries });
});

// ---- Public: single competition with standings + fixtures ----
router.get('/:slug', async (req, res) => {
  const competition = await prisma.competition.findUnique({
    where: { slug: req.params.slug },
    include: {
      sport: true,
      standings: { orderBy: { position: 'asc' } },
      fixtures: {
        orderBy: { kickoff: 'asc' },
        include: {
          homeClub: { select: { id: true, name: true, slug: true, crestUrl: true } },
          awayClub: { select: { id: true, name: true, slug: true, crestUrl: true } },
        },
      },
    },
  });
  if (!competition) return res.status(404).json({ error: 'Competition not found' });

  // Prefer the canonical Underdawgs Sports Data platform's standings when
  // this competition has one — currently just Kenya Cup. Fails soft: any
  // problem reaching it (timeout, no mapping, empty response) means
  // competition.standings stays exactly what it already was above, so a
  // canonical-source outage can never break this page.
  const canonicalStandings = await fetchCanonicalStandings(competition.id);
  if (canonicalStandings) {
    competition.standings = canonicalStandings;
    competition.standingsSource = 'underdawgs-data';
  } else {
    competition.standingsSource = 'local';
  }

  res.json({ competition });
});

// ---- Admin: known team names for a competition (autocomplete) — derived
// from existing fixtures + standings, not a separate table, so there's
// nothing extra to maintain: the first matchday's entries become the
// reference list for every entry after. ----
router.get('/:id/team-names', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const [fixtures, standings] = await Promise.all([
    prisma.fixture.findMany({ where: { competitionId: req.params.id }, select: { homeTeam: true, awayTeam: true } }),
    prisma.standingRow.findMany({ where: { competitionId: req.params.id }, select: { teamName: true } }),
  ]);
  const names = new Set();
  fixtures.forEach((f) => { names.add(f.homeTeam); names.add(f.awayTeam); });
  standings.forEach((s) => names.add(s.teamName));
  res.json({ teamNames: Array.from(names).sort() });
});

// ---- Admin: create a competition ----
const VALID_CATEGORIES = ['LEAGUE', 'CUP', 'CONTINENTAL', 'INTERNATIONAL'];

router.post('/', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, sportId, source, category } = req.body;
  if (!name || !sportId) return res.status(400).json({ error: 'name and sportId are required' });
  if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
  }
  const competition = await prisma.competition.create({
    data: { name, slug: slugify(name), sportId, source: source === 'API' ? 'API' : 'MANUAL', category: category || 'LEAGUE' },
  });
  await logChange('COMPETITION', competition.id, 'CREATE', `Added competition "${competition.name}"`, req.session.user.name);
  res.status(201).json({ competition });
});

// ---- Admin: toggle a competition's squad-sync flag ----
// Deliberately opt-in, one competition at a time — Wikidata's soft rate
// limits mean syncing every competition's full squads at once isn't
// realistic; this is the control for choosing which competitions actually
// get Club/Player data.
router.put('/:id/sync-squads', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { syncSquads } = req.body;
  const competition = await prisma.competition.update({
    where: { id: req.params.id },
    data: { syncSquads: Boolean(syncSquads) },
  });
  await logChange('COMPETITION', competition.id, 'UPDATE', `${syncSquads ? 'Enabled' : 'Disabled'} squad sync for "${competition.name}"`, req.session.user.name);
  res.json({ competition });
});

// ---- Admin: replace a competition's standings table wholesale ----
// Simplest correct approach for a small, manually-curated table: the admin
// re-submits the full table on every save rather than editing rows one at a
// time, so there's no drift between row order and table position.
router.put('/:id/standings', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });

  await prisma.$transaction([
    prisma.standingRow.deleteMany({ where: { competitionId: req.params.id } }),
    prisma.standingRow.createMany({
      data: rows.map((r, i) => ({
        competitionId: req.params.id,
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
  await logChange('STANDINGS', req.params.id, 'UPDATE', `Replaced standings table (${rows.length} teams)`, req.session.user.name);

  const standings = await prisma.standingRow.findMany({
    where: { competitionId: req.params.id },
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
  const { homeClubId, awayClubId } = await resolveClubsForFixture(prisma, req.params.id, homeTeam, awayTeam);
  const fixture = await prisma.fixture.create({
    data: {
      competitionId: req.params.id,
      homeTeam,
      awayTeam,
      homeClubId,
      awayClubId,
      kickoff: new Date(kickoff),
      status: status || 'SCHEDULED',
    },
  });
  await logChange('FIXTURE', fixture.id, 'CREATE', `Added fixture: ${homeTeam} vs ${awayTeam}, ${fmtDate(fixture.kickoff)}`, req.session.user.name);
  res.status(201).json({ fixture });
});

// ---- Admin: bulk-import a whole season's fixtures at once — the actual
// "build it once" step. One line per fixture: "Home Team vs Away Team |
// 2026-08-23T15:00". Skips blank lines; a malformed line is reported back
// rather than silently dropped, so a typo doesn't quietly lose a fixture. ----
router.post('/:id/fixtures/bulk', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { fixtures } = req.body;
  if (!Array.isArray(fixtures) || !fixtures.length) {
    return res.status(400).json({ error: 'fixtures must be a non-empty array' });
  }

  const clubs = await prisma.club.findMany({ where: { competitionId: req.params.id }, select: { id: true, name: true } });

  const errors = [];
  const toCreate = [];
  fixtures.forEach((f, i) => {
    if (!f.homeTeam || !f.awayTeam || !f.kickoff) {
      errors.push(`Line ${i + 1}: missing homeTeam, awayTeam, or kickoff`);
      return;
    }
    const kickoff = new Date(f.kickoff);
    if (Number.isNaN(kickoff.getTime())) {
      errors.push(`Line ${i + 1}: "${f.kickoff}" isn't a valid date`);
      return;
    }
    toCreate.push({
      competitionId: req.params.id,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      homeClubId: resolveClubIdForTeamName(f.homeTeam, clubs),
      awayClubId: resolveClubIdForTeamName(f.awayTeam, clubs),
      kickoff,
      status: 'SCHEDULED',
    });
  });

  if (toCreate.length) {
    await prisma.fixture.createMany({ data: toCreate });
    await logChange('FIXTURE', req.params.id, 'BULK_IMPORT', `Bulk imported ${toCreate.length} fixture(s)`, req.session.user.name);
  }

  res.status(errors.length && !toCreate.length ? 400 : 201).json({ created: toCreate.length, errors });
});

// ---- Admin: update a fixture (score, status, reschedule) ----
// A status change TO POSTPONED is treated specially: the fixture's current
// kickoff is preserved as originalKickoff (once — a fixture postponed twice
// keeps its very first scheduled date, not the most recent one) before the
// new kickoff is applied, so "was X, now Y" survives instead of silently
// overwriting the original date.
router.put('/fixtures/:fixtureId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const existing = await prisma.fixture.findUnique({ where: { id: req.params.fixtureId } });
  if (!existing) return res.status(404).json({ error: 'Fixture not found' });

  const { homeTeam, awayTeam, kickoff, homeScore, awayScore, status } = req.body;
  const newKickoff = kickoff ? new Date(kickoff) : existing.kickoff;
  const isNewlyPostponed = status === 'POSTPONED' && existing.status !== 'POSTPONED';
  const newHomeTeam = homeTeam ?? existing.homeTeam;
  const newAwayTeam = awayTeam ?? existing.awayTeam;
  const teamNamesChanged = newHomeTeam !== existing.homeTeam || newAwayTeam !== existing.awayTeam;
  const { homeClubId, awayClubId } = teamNamesChanged
    ? await resolveClubsForFixture(prisma, existing.competitionId, newHomeTeam, newAwayTeam)
    : { homeClubId: existing.homeClubId, awayClubId: existing.awayClubId };

  const fixture = await prisma.fixture.update({
    where: { id: req.params.fixtureId },
    data: {
      homeTeam: newHomeTeam,
      awayTeam: newAwayTeam,
      homeClubId,
      awayClubId,
      kickoff: newKickoff,
      originalKickoff: isNewlyPostponed ? (existing.originalKickoff ?? existing.kickoff) : existing.originalKickoff,
      homeScore: homeScore !== undefined ? homeScore : existing.homeScore,
      awayScore: awayScore !== undefined ? awayScore : existing.awayScore,
      status: status ?? existing.status,
    },
  });

  let summary;
  if (isNewlyPostponed) {
    summary = `Postponed ${fixture.homeTeam} vs ${fixture.awayTeam}: ${fmtDate(existing.kickoff)} → ${fmtDate(newKickoff)}`;
  } else if (status === 'FINISHED' && existing.status !== 'FINISHED') {
    summary = `Result: ${fixture.homeTeam} ${fixture.homeScore ?? 0}-${fixture.awayScore ?? 0} ${fixture.awayTeam}`;
  } else {
    summary = `Updated fixture: ${fixture.homeTeam} vs ${fixture.awayTeam}`;
  }
  await logChange('FIXTURE', fixture.id, 'UPDATE', summary, req.session.user.name);

  res.json({ fixture });
});

// ---- Admin: delete a fixture ----
router.delete('/fixtures/:fixtureId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const existing = await prisma.fixture.findUnique({ where: { id: req.params.fixtureId } });
  await prisma.fixture.delete({ where: { id: req.params.fixtureId } });
  if (existing) {
    await logChange('FIXTURE', existing.id, 'DELETE', `Removed fixture: ${existing.homeTeam} vs ${existing.awayTeam}`, req.session.user.name);
  }
  res.json({ ok: true });
});

module.exports = router;
