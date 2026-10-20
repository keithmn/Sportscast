const express = require('express');
const prisma = require('../db');
const { slugify } = require('../utils/slugify');
const { requireRole, isEditor } = require('../middleware/auth');
const { fetchCanonicalStandings, fetchCanonicalCompetition, verifyCanonicalCompetition, fetchCanonicalFixture, verifyCanonicalFixture, listCanonicalFixtureCandidates } = require('../lib/canonicalData');
const { resolveClubsForFixture, resolveClubIdForTeamName } = require('../lib/clubResolution');
const { getOrCreateCurrentSeason } = require('../lib/seasonResolution');
const { resolveVenue } = require('../lib/venueResolution');
const { pointsRuleFor, computeTable } = require('../lib/pointsRules');
const { JURISDICTIONS, FORMATS, TEAM_TYPES, classificationFor, parseClassification } = require('../lib/competitionClassification');
const { outcomeProblem, sanityWarnings, newGameWarnings, outcomeSuffix, isScore } = require('../lib/resultRules');
const { sendPushToFollowers } = require('../lib/push');

const router = express.Router();

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Admin kickoff inputs (datetime-local, and the bulk-import format
// "2026-10-10T15:00") carry no timezone. Parsed as-is on the server they
// became UTC — fine on a laptop in Nairobi, 3 hours off on Railway, where
// the container runs UTC (a 22:00 kickoff would land on the next day).
// The newsroom enters Kenyan local times, so an offset-less value is read
// as Africa/Nairobi (UTC+3, no DST). Values that already carry an offset
// or "Z" pass through unchanged.
function parseKickoff(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value.trim())) {
    return new Date(`${value.trim()}+03:00`);
  }
  return new Date(value);
}

// Fire-and-forget, same as logChange below — a push failure (or even just
// the extra queries) must never delay or break the admin's response.
// Wave 3's one wired trigger: a real result on a followed club or
// competition. Sync-job-sourced results (API-fed leagues) aren't wired
// yet — see BLUEPRINT.md's entry for why that's a deliberate, separate
// scoping decision, not an oversight.
function notifyFixtureResult(fixture, { correction = false } = {}) {
  if (fixture.homeScore == null || fixture.awayScore == null) return; // never announce a score we don't have
  if (fixture.resultProvisional || fixture.status !== 'FINISHED') return; // only confirmed results
  (async () => {
    const [competition, clubs] = await Promise.all([
      prisma.competition.findUnique({ where: { id: fixture.competitionId }, select: { slug: true, name: true } }),
      prisma.club.findMany({ where: { id: { in: [fixture.homeClubId, fixture.awayClubId].filter(Boolean) } }, select: { slug: true } }),
    ]);
    const targets = [
      ...(competition ? [{ entityType: 'competition', entitySlug: competition.slug }] : []),
      ...clubs.map((c) => ({ entityType: 'club', entitySlug: c.slug })),
    ];
    await sendPushToFollowers(targets, {
      title: `${correction ? 'Correction — full-time' : 'Full-time'}: ${fixture.homeTeam} ${fixture.homeScore}-${fixture.awayScore} ${fixture.awayTeam}${outcomeSuffix(fixture)}`,
      body: competition ? competition.name : 'Result posted',
      url: `/match.html?id=${fixture.id}`,
    });
  })().catch((err) => console.error('[push] Fixture-result notification failed:', err.message));
}

// Optional match details (venue/round/broadcaster/source). `undefined`
// means "not sent, leave as is"; an empty string clears the field.
function detailText(value) {
  if (value === undefined) return undefined;
  const t = String(value ?? '').trim();
  return t ? t.slice(0, 200) : null;
}

// An optional source link from an editor: '' or missing means none; it
// must be a plain http(s) URL, since the public match page links it.
function sourceUrlOrError(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const url = String(value).trim();
  if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 500) return new Error('The source link must be a full web address starting with http:// or https://');
  return url;
}

// Results entry: editors for every competition; a CORRESPONDENT only for
// the competitions they report on (and their scores stay provisional).
function requireResultsAccess(req, res, next) {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  if (user.mustChangePassword) return res.status(403).json({ error: 'Set your own password first (Account page).', mustChangePassword: true });
  if (['ADMIN', 'EDITOR'].includes(user.role)) return next();
  if (user.role === 'CORRESPONDENT' && (user.competitionIds || []).includes(req.params.id)) return next();
  return res.status(403).json({ error: "You can't enter results for this competition" });
}

function logChange(entityType, entityId, action, summary, userName) {
  return prisma.changeLog.create({ data: { entityType, entityId, action, summary, userName } }).catch((err) => {
    // A logging failure should never block the real mutation it's describing.
    console.error('[competitions] Failed to write change log:', err.message);
  });
}

// ---- Public: list competitions, optionally scoped to one sport (used by
// the per-sport hub's Competitions tab, e.g. ?sport=football) ----
// Inactive competitions (Competition.isActive — foreign club leagues
// switched off for Kenyan-first coverage) are hidden from the public;
// the admin page passes ?includeInactive=1 so editors can still see and
// re-enable them.

router.get('/', async (req, res) => {
  const showInactive = req.query.includeInactive === '1' && isEditor(req);
  const competitions = await prisma.competition.findMany({
    where: {
      ...(req.query.sport ? { sport: { slug: req.query.sport } } : {}),
      ...(showInactive ? {} : { isActive: true }),
    },
    include: { sport: true },
    orderBy: { name: 'asc' },
  });
  // hasData: does the current season have any standings or fixtures? The
  // public pages hide empty shells (Division One zones, CAF, SVNS before
  // anything is entered) instead of showing "Standings haven't been
  // entered" — the competition page itself stays reachable by URL.
  const seasons = await prisma.competitionSeason.findMany({
    where: { isCurrent: true, competitionId: { in: competitions.map((c) => c.id) } },
    select: { id: true, competitionId: true },
  });
  const seasonIds = seasons.map((s) => s.id);
  const [standingSeasons, fixtureSeasons] = await Promise.all([
    prisma.standingRow.groupBy({ by: ['seasonId'], where: { seasonId: { in: seasonIds } } }),
    prisma.fixture.groupBy({ by: ['seasonId'], where: { seasonId: { in: seasonIds } } }),
  ]);
  const withData = new Set([...standingSeasons, ...fixtureSeasons].map((r) => r.seasonId));
  const competitionsWithData = new Set(seasons.filter((s) => withData.has(s.id)).map((s) => s.competitionId));
  competitions.forEach((c) => { c.hasData = competitionsWithData.has(c.id); });
  // The level/format/team-type labels travel with the list so the public
  // pages and the admin share one definition (competitionClassification.js).
  res.json({ competitions, classification: { jurisdictions: JURISDICTIONS, formats: FORMATS, teamTypes: TEAM_TYPES } });
});

// ---- Rights record (internal; CompetitionRights) ----
const RIGHTS_STATUSES = ['UNREVIEWED', 'PERMISSION_PENDING', 'CLEARED', 'LEGAL_HOLD'];
router.get('/:id/rights', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const rights = await prisma.competitionRights.findUnique({ where: { competitionId: req.params.id } });
  res.json({ rights: rights || { competitionId: req.params.id, status: 'UNREVIEWED', notes: null }, statuses: RIGHTS_STATUSES });
});

// Legal decisions are an admin's. LEGAL_HOLD takes the competition off
// the public site at once; it stays off until the hold is lifted.
router.put('/:id/rights', requireRole('ADMIN'), async (req, res) => {
  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition) return res.status(404).json({ error: 'Competition not found' });
  const status = req.body.status;
  if (!RIGHTS_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${RIGHTS_STATUSES.join(', ')}` });
  const notes = req.body.notes !== undefined ? (String(req.body.notes).trim().slice(0, 4000) || null) : undefined;
  const rights = await prisma.competitionRights.upsert({
    where: { competitionId: competition.id },
    create: { competitionId: competition.id, status, notes: notes ?? null, updatedBy: req.session.user.name },
    update: { status, ...(notes !== undefined ? { notes } : {}), updatedBy: req.session.user.name },
  });
  if (status === 'LEGAL_HOLD' && competition.isActive) {
    await prisma.competition.update({ where: { id: competition.id }, data: { isActive: false } });
  }
  await logChange('COMPETITION', competition.id, 'UPDATE', `Rights: ${status.replace('_', ' ').toLowerCase()}${status === 'LEGAL_HOLD' ? ' — taken off the public site' : ''}`, req.session.user.name);
  res.json({ rights });
});

// ---- Admin: show/hide a competition on the public site ----
router.put('/:id/active', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  if (typeof req.body.isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false' });
  if (req.body.isActive) {
    const rights = await prisma.competitionRights.findUnique({ where: { competitionId: req.params.id } });
    if (rights && rights.status === 'LEGAL_HOLD') return res.status(409).json({ error: 'This competition is on legal hold — an admin has to lift the hold (Settings → Rights) before it can be shown.' });
  }
  const competition = await prisma.competition.update({ where: { id: req.params.id }, data: { isActive: req.body.isActive } });
  await logChange('COMPETITION', competition.id, 'UPDATE', `${competition.isActive ? 'Showed' : 'Hid'} ${competition.name} on the public site`, req.session.user.name);
  res.json({ competition });
});

// ---- Admin: change a competition's jurisdiction / format / team type /
// governing body ----
router.put('/:id/classification', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { data, error } = parseClassification(req.body || {});
  if (error) return res.status(400).json({ error });
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to change' });
  const existing = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Competition not found' });
  const competition = await prisma.competition.update({ where: { id: existing.id }, data });
  const level = JURISDICTIONS.find((j) => j.key === competition.jurisdiction).label;
  await logChange('COMPETITION', competition.id, 'UPDATE', `Classified "${competition.name}" as ${level} · ${competition.format} · ${competition.teamType}${competition.tier ? ` · tier ${competition.tier}` : ''}${competition.governingBody ? ` (${competition.governingBody})` : ''}`, req.session.user.name);
  res.json({ competition });
});

// ---- Admin: recent changes across all competitions, most recent first ----
// ?competition=<id> narrows it to one competition: its own entries plus
// its fixtures' (ChangeLog keys fixture entries by fixture id).
router.get('/changelog', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  let where = {};
  if (req.query.competition) {
    const fixtureIds = (await prisma.fixture.findMany({ where: { competitionId: String(req.query.competition) }, select: { id: true } })).map((f) => f.id);
    where = { OR: [{ entityId: String(req.query.competition) }, { entityType: 'FIXTURE', entityId: { in: fixtureIds } }] };
  }
  const entries = await prisma.changeLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: req.query.competition ? 100 : 50 });
  res.json({ entries });
});

// ---- Admin: coverage report — how complete and how fresh each Kenyan
// competition is over the last ?days= (default 30): results entered,
// results on time against the competition's target, match details for
// the next fortnight, stories. On demand; the Coverage page renders it and
// can copy it as text for WhatsApp. ----
router.get('/admin/coverage', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 120);
  const now = Date.now();
  const since = new Date(now - days * 86400000);
  const ahead = new Date(now + 14 * 86400000);
  const competitions = await prisma.competition.findMany({
    where: { region: 'KENYA', isActive: true },
    include: { sport: { select: { name: true, slug: true } }, rights: { select: { status: true } } },
  });
  const rows = [];
  for (const c of competitions) {
    const [played, upcoming, stories] = await Promise.all([
      prisma.fixture.findMany({ where: { competitionId: c.id, kickoff: { gte: since, lt: new Date(now - 3 * 3600000) }, status: { not: 'POSTPONED' } }, select: { id: true, kickoff: true, status: true, homeScore: true } }),
      prisma.fixture.findMany({ where: { competitionId: c.id, kickoff: { gte: new Date(now), lt: ahead } }, select: { venueId: true, broadcaster: true } }),
      prisma.article.findMany({ where: { status: 'PUBLISHED', publishedAt: { gte: since }, OR: [{ competitions: { some: { id: c.id } } }, { fixture: { competitionId: c.id } }] }, select: { publishedAt: true } }),
    ]);
    if (!played.length && !upcoming.length && !stories.length) continue;
    const withResult = played.filter((f) => f.status === 'FINISHED' && f.homeScore != null);
    // When was each result first entered? The first result entry in the change log.
    const logs = withResult.length ? await prisma.changeLog.findMany({
      where: { entityType: 'FIXTURE', entityId: { in: withResult.map((f) => f.id) }, OR: [{ summary: { startsWith: 'Result' } }, { summary: { startsWith: 'Added result' } }, { summary: { startsWith: 'Confirmed result' } }] },
      select: { entityId: true, createdAt: true }, orderBy: { createdAt: 'asc' },
    }) : [];
    const firstEntry = new Map();
    logs.forEach((l) => { if (!firstEntry.has(l.entityId)) firstEntry.set(l.entityId, l.createdAt); });
    const target = c.resultTargetHours || 12;
    const timed = withResult.filter((f) => firstEntry.has(f.id));
    const delays = timed.map((f) => (firstEntry.get(f.id).getTime() - f.kickoff.getTime()) / 3600000);
    const onTime = delays.filter((h) => h <= target + 2).length; // + the game itself
    rows.push({
      competition: { id: c.id, name: c.name, slug: c.slug, sport: c.sport.name },
      rightsStatus: c.rights ? c.rights.status : 'UNREVIEWED',
      resultTargetHours: target,
      played: played.length,
      withResult: withResult.length,
      timedResults: timed.length,
      onTime,
      medianHoursToResult: delays.length ? Math.round(delays.sort((a, b) => a - b)[Math.floor(delays.length / 2)] * 10) / 10 : null,
      upcoming: upcoming.length,
      upcomingWithVenue: upcoming.filter((f) => f.venueId).length,
      upcomingWithBroadcaster: upcoming.filter((f) => f.broadcaster).length,
      stories: stories.length,
      lastStoryAt: stories.length ? stories.map((a) => a.publishedAt).sort((a, b) => b - a)[0] : null,
    });
  }
  rows.sort((a, b) => b.played - a.played || a.competition.name.localeCompare(b.competition.name));
  res.json({ days, rows });
});

// ---- Admin: rename a competition or set whether it's Kenyan ----
// The slug (and so every link and follow) stays the same on a rename.
router.put('/:id/details', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const existing = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Competition not found' });
  const data = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: 'A competition needs a name' });
    data.name = name;
  }
  if (req.body.region !== undefined) {
    if (!['KENYA', 'GLOBAL'].includes(req.body.region)) return res.status(400).json({ error: 'region must be KENYA or GLOBAL' });
    data.region = req.body.region;
  }
  for (const field of ['dataSource', 'attribution']) {
    if (req.body[field] !== undefined) data[field] = String(req.body[field]).trim().slice(0, 160) || null;
  }
  if (req.body.resultTargetHours !== undefined) {
    const h = req.body.resultTargetHours === '' || req.body.resultTargetHours === null ? null : Number(req.body.resultTargetHours);
    if (h !== null && (!Number.isInteger(h) || h < 1 || h > 168)) return res.status(400).json({ error: 'The result target is a whole number of hours, 1 to 168' });
    data.resultTargetHours = h;
  }
  const competition = await prisma.competition.update({ where: { id: existing.id }, data });
  await logChange('COMPETITION', competition.id, 'UPDATE', `Details: ${existing.name !== competition.name ? `renamed "${existing.name}" → "${competition.name}"` : 'updated'}${existing.region !== competition.region ? ` ${competition.region === 'KENYA' ? 'marked Kenyan' : 'marked international'}` : ''}`.trim(), req.session.user.name);
  res.json({ competition });
});

// ---- Public: single competition with standings + fixtures ----
// ?season=<id> scopes standings/fixtures to a specific past season; with no
// param (the common case), this defaults to whichever CompetitionSeason is
// currently marked isCurrent. A competition that predates the season model
// and has never had a fixture/standings write since (so getOrCreateCurrentSeason
// was never called for it) may have zero CompetitionSeason rows at all —
// that's not an error, it just means nothing to scope by, so every existing
// row (all seasonId: null) is returned unscoped, identical to pre-season-model
// behavior.
router.get('/:slug', async (req, res) => {
  const competition = await prisma.competition.findUnique({
    where: { slug: req.params.slug },
    include: { sport: true },
  });
  if (!competition || (!competition.isActive && !isEditor(req))) return res.status(404).json({ error: 'Competition not found' });

  const allSeasons = await prisma.competitionSeason.findMany({
    where: { competitionId: competition.id },
    orderBy: { createdAt: 'desc' },
  });
  // A planned season (not started yet) is for editors only.
  const seasons = isEditor(req) ? allSeasons : allSeasons.filter((s) => s.isCurrent || !s.startsOn || s.startsOn <= new Date());
  const currentSeason = seasons.find((s) => s.isCurrent) || null;
  const requestedSeasonId = req.query.season && seasons.some((s) => s.id === req.query.season)
    ? req.query.season
    : null;
  const scopeSeasonId = requestedSeasonId || currentSeason?.id || null;
  const seasonWhere = scopeSeasonId ? { seasonId: scopeSeasonId } : undefined;

  const [standings, fixtures] = await Promise.all([
    prisma.standingRow.findMany({
      where: { competitionId: competition.id, ...seasonWhere },
      orderBy: { position: 'asc' },
    }),
    prisma.fixture.findMany({
      where: { competitionId: competition.id, ...seasonWhere },
      orderBy: { kickoff: 'asc' },
      include: {
        homeClub: { select: { id: true, name: true, slug: true, crestUrl: true, venue: true } },
        awayClub: { select: { id: true, name: true, slug: true, crestUrl: true } },
        venue: { select: { id: true, name: true, slug: true, city: true } },
      },
    }),
  ]);
  competition.standings = standings;
  competition.fixtures = fixtures;
  // Whether the table can be rebuilt from scores (lib/pointsRules.js) —
  // the admin page shows the "Recalculate table" button only then.
  competition.tableFromResults = !!pointsRuleFor(competition.sport.slug);
  competition.seasons = seasons;
  // "Updated …" under the table: the newest change to this season's rows.
  competition.tableUpdatedAt = competition.standings && competition.standings.length
    ? competition.standings.reduce((latest, r) => (r.updatedAt > latest ? r.updatedAt : latest), competition.standings[0].updatedAt)
    : null;
  competition.currentSeasonId = currentSeason?.id || null;
  competition.viewingSeasonId = scopeSeasonId;

  // Prefer the canonical Underdawgs Sports Data platform's standings when
  // this competition has one — currently just Kenya Cup. Fails soft: any
  // problem reaching it (timeout, no mapping, empty response) means
  // competition.standings stays exactly what it already was above, so a
  // canonical-source outage can never break this page. Fetched alongside
  // (not after) fetchCanonicalCompetition — two separate Data Platform
  // calls, each with its own 3s timeout; sequential would let a slow
  // canonical source add up to 6s to this page instead of 3.
  const [canonicalStandings, canonicalCompetition] = await Promise.all([
    fetchCanonicalStandings(competition.id),
    fetchCanonicalCompetition(competition.id),
  ]);
  if (canonicalStandings) {
    competition.standings = canonicalStandings;
    competition.standingsSource = 'underdawgs-data';
  } else {
    competition.standingsSource = 'local';
  }
  competition.canonicalCompetition = canonicalCompetition;

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

// ---- Admin: fetch a competition's current canonical Competition link, if any ----
router.get('/:id/canonical-competition', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const canonicalCompetition = await fetchCanonicalCompetition(req.params.id);
  res.json({ canonicalCompetition });
});

// ---- Admin: link a competition to a canonical Data Platform Competition ----
// This is what fetchCanonicalStandings' fallback (used by the public
// GET /:slug above) actually keys off of — creating this mapping through
// the admin UI is what makes a competition's real standings start
// appearing here, the same way the one-off script did for Kenya Cup.
router.put('/:id/canonical-competition', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { canonicalCompetitionId } = req.body;
  if (!canonicalCompetitionId) return res.status(400).json({ error: 'canonicalCompetitionId is required' });

  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition) return res.status(404).json({ error: 'Competition not found' });

  const canonicalCompetition = await verifyCanonicalCompetition(canonicalCompetitionId);
  if (!canonicalCompetition) {
    return res.status(422).json({ error: 'No Data Platform Competition with that id could be verified (check the id, or the Data Platform may be unreachable — try again).' });
  }

  await prisma.canonicalMapping.upsert({
    where: {
      localEntityType_localId_provider: { localEntityType: 'COMPETITION', localId: competition.id, provider: 'underdawgs-data' },
    },
    update: { canonicalEntityType: 'Competition', canonicalId: canonicalCompetitionId },
    create: { localEntityType: 'COMPETITION', localId: competition.id, canonicalEntityType: 'Competition', canonicalId: canonicalCompetitionId },
  });

  res.json({ canonicalCompetition });
});

router.delete('/:id/canonical-competition', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.canonicalMapping.deleteMany({
    where: { localEntityType: 'COMPETITION', localId: req.params.id, provider: 'underdawgs-data' },
  });
  res.json({ ok: true });
});

// ---- Admin: list a competition's seasons, most recent first ----
router.get('/:id/seasons', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const seasons = await prisma.competitionSeason.findMany({
    where: { competitionId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ seasons });
});

// ---- Admin: archive the current season and start a new one ----
// One-way, forward-only action: every fixture/standings write path resolves
// "the current season" via getOrCreateCurrentSeason, so the new season
// starts empty (no fixtures, no standings) the moment this returns — there's
// nothing else to wire up for that to take effect. The just-archived
// season's data is untouched and stays reachable via the public ?season=
// selector.
// A season with a startsOn in the future is PLANNED (2026-10-19): it's
// created but not current, so the public page keeps showing the season
// being played; the nightly rolloverSeasons job makes it current on its
// start date. Without startsOn it becomes current at once, as before.
router.post('/:id/seasons', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { label } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'label is required' });
  const trimmedLabel = label.trim();
  const startsOn = req.body.startsOn ? parseKickoff(`${String(req.body.startsOn).slice(0, 10)}T00:00`) : null;
  const endsOn = req.body.endsOn ? parseKickoff(`${String(req.body.endsOn).slice(0, 10)}T23:59`) : null;
  if ((startsOn && Number.isNaN(startsOn.getTime())) || (endsOn && Number.isNaN(endsOn.getTime()))) return res.status(400).json({ error: "The season dates aren't valid" });
  if (startsOn && endsOn && endsOn <= startsOn) return res.status(400).json({ error: 'The season has to end after it starts' });
  const planned = startsOn && startsOn.getTime() > Date.now();

  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition) return res.status(404).json({ error: 'Competition not found' });

  const existing = await prisma.competitionSeason.findUnique({
    where: { competitionId_label: { competitionId: req.params.id, label: trimmedLabel } },
  });
  if (existing) return res.status(409).json({ error: `A season labeled "${trimmedLabel}" already exists for this competition.` });

  if (planned) {
    const season = await prisma.competitionSeason.create({ data: { competitionId: req.params.id, label: trimmedLabel, isCurrent: false, startsOn, endsOn } });
    await logChange('COMPETITION', competition.id, 'UPDATE', `Planned season "${season.label}" for "${competition.name}" — starts ${fmtDate(startsOn)}`, req.session.user.name);
    return res.status(201).json({ season, planned: true });
  }
  const [, season] = await prisma.$transaction([
    prisma.competitionSeason.updateMany({ where: { competitionId: req.params.id, isCurrent: true }, data: { isCurrent: false } }),
    prisma.competitionSeason.create({ data: { competitionId: req.params.id, label: trimmedLabel, isCurrent: true, startsOn, endsOn } }),
  ]);
  await logChange('COMPETITION', competition.id, 'UPDATE', `Started new season "${season.label}" for "${competition.name}"`, req.session.user.name);
  res.status(201).json({ season, planned: false });
});

// ---- Admin: rename a season or set its dates ----
router.put('/seasons/:seasonId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const season = await prisma.competitionSeason.findUnique({ where: { id: req.params.seasonId } });
  if (!season) return res.status(404).json({ error: 'Season not found' });
  const data = {};
  if (req.body.label !== undefined) {
    const label = String(req.body.label).trim();
    if (!label) return res.status(400).json({ error: 'A season needs a name, e.g. 2026/27' });
    const clash = await prisma.competitionSeason.findUnique({ where: { competitionId_label: { competitionId: season.competitionId, label } } });
    if (clash && clash.id !== season.id) return res.status(409).json({ error: `There's already a season called "${label}"` });
    data.label = label;
  }
  for (const [field, time] of [['startsOn', '00:00'], ['endsOn', '23:59']]) {
    if (req.body[field] === undefined) continue;
    data[field] = req.body[field] ? parseKickoff(`${String(req.body[field]).slice(0, 10)}T${time}`) : null;
    if (data[field] && Number.isNaN(data[field].getTime())) return res.status(400).json({ error: "The season dates aren't valid" });
  }
  const updated = await prisma.competitionSeason.update({ where: { id: season.id }, data });
  await logChange('COMPETITION', season.competitionId, 'UPDATE', `Season "${updated.label}" updated`, req.session.user.name);
  res.json({ season: updated });
});

// True when two squashed names differ by at most one or two letters
// (kenyapremierleague / kenyanpremierleague), scaled to their length.
function nearlySame(a, b) {
  if (a === b) return true;
  const limit = Math.max(a.length, b.length) >= 12 ? 2 : 1;
  if (Math.abs(a.length - b.length) > limit) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length] <= limit;
}

// ---- Admin: create a competition ----
// Takes jurisdiction/format/teamType/governingBody (competitionClassification.js);
// a name the site already knows (e.g. re-adding "CHAN") is classified from
// the known map when the editor leaves the fields out. The superseded
// `category` field is no longer written — the schema default fills it.
router.post('/', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, sportId, source } = req.body;
  if (!name || !sportId) return res.status(400).json({ error: 'name and sportId are required' });
  const { data: classification, error } = parseClassification(req.body);
  if (error) return res.status(400).json({ error });
  const slug = slugify(name);
  // "Kenya Premier league" next to "Kenyan Premier League" is almost
  // always the same competition added twice. Refuse a near-identical name
  // unless the editor confirms it really is a different competition.
  if (!req.body.confirmNew) {
    const squash = (n) => String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
    const all = await prisma.competition.findMany({ select: { name: true, slug: true } });
    const similar = all.filter((c) => c.slug === slug || nearlySame(squash(c.name), squash(name)));
    if (similar.length) {
      return res.status(409).json({ error: `Already on the site: ${similar.map((c) => c.name).join(', ')}. Add it anyway only if it's a different competition.`, similar });
    }
  }
  const competition = await prisma.competition.create({
    data: { name, slug, sportId, source: source === 'API' ? 'API' : 'MANUAL', ...classificationFor(slug), ...classification },
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
  // Squad sync rebuilds squads from Wikidata for clubs matched by name.
  // On a newsroom-run Kenyan competition it would overwrite (and for
  // name matches like "AFC Leopards", wipe) squads editors entered, so
  // it's only for API-sourced competitions.
  const target = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'Competition not found' });
  if (syncSquads && target.source !== 'API') {
    return res.status(400).json({ error: "Squad sync is only for competitions synced from an outside feed — it would overwrite this competition's hand-entered squads." });
  }
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
//
// Scoped to the current season only — deleteMany below only ever touches
// rows already tagged with this season's id, so a past (archived) season's
// standings are never at risk of being wiped by a save to the current one.
router.put('/:id/standings', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });

  const season = await getOrCreateCurrentSeason(prisma, req.params.id);

  await prisma.$transaction([
    prisma.standingRow.deleteMany({ where: { competitionId: req.params.id, seasonId: season.id } }),
    prisma.standingRow.createMany({
      data: rows.map((r, i) => ({
        competitionId: req.params.id,
        seasonId: season.id,
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
    where: { competitionId: req.params.id, seasonId: season.id },
    orderBy: { position: 'asc' },
  });
  res.json({ standings });
});

// ---- Admin: add a fixture ----
router.post('/:id/fixtures', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { homeTeam, awayTeam, kickoff, status, venue, round, broadcaster, sourceUrl } = req.body;
  if (!homeTeam || !awayTeam || !kickoff) {
    return res.status(400).json({ error: 'homeTeam, awayTeam, and kickoff are required' });
  }
  const [{ homeClubId, awayClubId }, season, venueResult] = await Promise.all([
    resolveClubsForFixture(prisma, req.params.id, homeTeam, awayTeam),
    getOrCreateCurrentSeason(prisma, req.params.id),
    resolveVenue(prisma, venue),
  ]);
  const fixture = await prisma.fixture.create({
    data: {
      competitionId: req.params.id,
      seasonId: season.id,
      homeTeam,
      awayTeam,
      homeClubId,
      awayClubId,
      kickoff: parseKickoff(kickoff),
      status: status || 'SCHEDULED',
      venueId: venueResult.venueId,
      round: detailText(round) ?? null,
      broadcaster: detailText(broadcaster) ?? null,
      sourceUrl: detailText(sourceUrl) ?? null,
    },
  });
  await logChange('FIXTURE', fixture.id, 'CREATE', `Added fixture: ${homeTeam} vs ${awayTeam}, ${fmtDate(fixture.kickoff)}`, req.session.user.name);
  res.status(201).json({ fixture, createdVenue: venueResult.created ? venue.trim() : null });
});

// ---- Admin: bulk-import a whole season's fixtures at once — the actual
// "build it once" step. One line per fixture: "Home Team vs Away Team |
// 2026-08-23T15:00", optionally followed by "| Venue | Round | Broadcaster".
// Skips blank lines; a malformed line is reported back rather than
// silently dropped, so a typo doesn't quietly lose a fixture. Venue names
// not already on the list are created and listed in the response, so a
// misspelt duplicate gets noticed. ----
router.post('/:id/fixtures/bulk', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { fixtures } = req.body;
  if (!Array.isArray(fixtures) || !fixtures.length) {
    return res.status(400).json({ error: 'fixtures must be a non-empty array' });
  }

  const [clubs, season] = await Promise.all([
    prisma.club.findMany({ where: { competitionId: req.params.id }, select: { id: true, name: true } }),
    getOrCreateCurrentSeason(prisma, req.params.id),
  ]);

  const errors = [];
  // Validate every line first, without writing anything — a line that
  // duplicates an existing fixture (or another line) used to make
  // createMany fail on the unique key, a raw 500 that also left any venues
  // already created for earlier lines behind.
  const candidates = [];
  for (const [i, f] of fixtures.entries()) {
    if (!f.homeTeam || !f.awayTeam || !f.kickoff) {
      errors.push(`Line ${i + 1}: missing homeTeam, awayTeam, or kickoff`);
      continue;
    }
    const kickoff = parseKickoff(f.kickoff);
    if (Number.isNaN(kickoff.getTime())) {
      errors.push(`Line ${i + 1}: "${f.kickoff}" isn't a valid date`);
      continue;
    }
    candidates.push({ i, f, kickoff });
  }
  const sameFixture = (a, b) => a.homeTeam === b.homeTeam && a.awayTeam === b.awayTeam && a.kickoff.getTime() === b.kickoff.getTime();
  const already = candidates.length
    ? await prisma.fixture.findMany({
      where: { competitionId: req.params.id, OR: candidates.map(({ f, kickoff }) => ({ homeTeam: f.homeTeam, awayTeam: f.awayTeam, kickoff })) },
      select: { homeTeam: true, awayTeam: true, kickoff: true },
    })
    : [];
  const unique = [];
  for (const c of candidates) {
    const probe = { homeTeam: c.f.homeTeam, awayTeam: c.f.awayTeam, kickoff: c.kickoff };
    if (already.some((x) => sameFixture(x, probe))) errors.push(`Line ${c.i + 1}: ${c.f.homeTeam} vs ${c.f.awayTeam} at that kick-off already exists — skipped`);
    else if (unique.some((u) => sameFixture({ homeTeam: u.f.homeTeam, awayTeam: u.f.awayTeam, kickoff: u.kickoff }, probe))) errors.push(`Line ${c.i + 1}: duplicates an earlier line — skipped`);
    else unique.push(c);
  }

  const toCreate = [];
  const venueCache = await prisma.venue.findMany({ select: { id: true, name: true } });
  const createdVenues = [];
  for (const { f, kickoff } of unique) {
    const { venueId, created } = await resolveVenue(prisma, f.venue, venueCache);
    if (created) createdVenues.push(f.venue.trim());
    toCreate.push({
      competitionId: req.params.id,
      seasonId: season.id,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      homeClubId: resolveClubIdForTeamName(f.homeTeam, clubs),
      awayClubId: resolveClubIdForTeamName(f.awayTeam, clubs),
      kickoff,
      status: 'SCHEDULED',
      venueId,
      round: detailText(f.round) ?? null,
      broadcaster: detailText(f.broadcaster) ?? null,
      sourceUrl: detailText(f.sourceUrl) ?? null,
    });
  }

  if (toCreate.length) {
    await prisma.fixture.createMany({ data: toCreate });
    await logChange('FIXTURE', req.params.id, 'BULK_IMPORT', `Bulk imported ${toCreate.length} fixture(s)`, req.session.user.name);
  }

  res.status(errors.length && !toCreate.length ? 400 : 201).json({ created: toCreate.length, errors, createdVenues });
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

  const { homeTeam, awayTeam, kickoff, homeScore, awayScore, status, venue, round, broadcaster, sourceUrl } = req.body;
  const newKickoff = kickoff ? parseKickoff(kickoff) : existing.kickoff;
  if (Number.isNaN(newKickoff.getTime())) return res.status(400).json({ error: "The kick-off date isn't valid" });
  // A full-time result needs both scores — "Full time" with empty boxes
  // used to save a scoreless result and push "0-0" to followers.
  const finalStatus = status ?? existing.status;
  const finalHome = homeScore !== undefined ? homeScore : existing.homeScore;
  const finalAway = awayScore !== undefined ? awayScore : existing.awayScore;
  const scoreOk = (n) => n === null || (Number.isInteger(n) && n >= 0 && n <= 999);
  if (!scoreOk(finalHome) || !scoreOk(finalAway)) return res.status(400).json({ error: 'Scores must be whole numbers from 0 to 999' });
  if (finalStatus === 'FINISHED' && (finalHome === null || finalAway === null)) {
    return res.status(400).json({ error: 'A full-time result needs both scores' });
  }
  const venueResult = venue !== undefined ? await resolveVenue(prisma, venue) : null;
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
      ...(venueResult ? { venueId: venueResult.venueId } : {}),
      ...(detailText(round) !== undefined ? { round: detailText(round) } : {}),
      ...(detailText(broadcaster) !== undefined ? { broadcaster: detailText(broadcaster) } : {}),
      ...(detailText(sourceUrl) !== undefined ? { sourceUrl: detailText(sourceUrl) } : {}),
    },
  });

  const isNewlyFinished = status === 'FINISHED' && existing.status !== 'FINISHED';
  // Editing a published score here is a correction too: recorded, shown
  // on the match page, and followers are told.
  const corrected = existing.status === 'FINISHED' && !existing.resultProvisional && fixture.status === 'FINISHED'
    && (fixture.homeScore !== existing.homeScore || fixture.awayScore !== existing.awayScore);
  if (corrected) {
    await prisma.fixtureCorrection.create({
      data: {
        fixtureId: fixture.id, userName: req.session.user.name, reason: String(req.body.correctionReason || 'Edited on the Competitions page').slice(0, 300),
        beforeHome: existing.homeScore, beforeAway: existing.awayScore, beforeStatus: existing.status,
        afterHome: fixture.homeScore, afterAway: fixture.awayScore, afterStatus: fixture.status,
      },
    });
    notifyFixtureResult(fixture, { correction: true });
  }
  let summary;
  if (isNewlyPostponed) {
    summary = `Postponed ${fixture.homeTeam} vs ${fixture.awayTeam}: ${fmtDate(existing.kickoff)} → ${fmtDate(newKickoff)}`;
  } else if (isNewlyFinished) {
    summary = `Result: ${fixture.homeTeam} ${fixture.homeScore}-${fixture.awayScore} ${fixture.awayTeam}`;
  } else {
    summary = `Updated fixture: ${fixture.homeTeam} vs ${fixture.awayTeam}`;
  }
  await logChange('FIXTURE', fixture.id, 'UPDATE', summary, req.session.user.name);

  if (isNewlyFinished) notifyFixtureResult(fixture);

  res.json({ fixture, createdVenue: venueResult?.created ? String(venue).trim() : null });
});

// ---- Admin: add games straight from the Results page ----
// For a result (or fixture) that isn't in the system yet — a game the
// fixture list missed, or a whole round typed in after the fact. Each game:
// { homeTeam, awayTeam, kickoff ('YYYY-MM-DDTHH:MM', Nairobi time),
// homeScore?, awayScore?, round?, venue? } — both scores make it a
// finished result (followers get the full-time push), neither makes it a
// fixture. Every game is checked before any is created, and a game that
// already exists (same teams, same Nairobi day) is refused so it can't be
// entered twice — its score goes in the round list instead.
router.post('/:id/games', requireResultsAccess, async (req, res) => {
  const { games } = req.body;
  if (!Array.isArray(games) || !games.length) return res.status(400).json({ error: 'Add at least one game' });
  if (games.length > 40) return res.status(400).json({ error: 'At most 40 games at a time' });
  const sourceUrl = sourceUrlOrError(req.body.sourceUrl);
  if (sourceUrl instanceof Error) return res.status(400).json({ error: sourceUrl.message });
  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition) return res.status(404).json({ error: 'Competition not found' });

  const ok = (n) => Number.isInteger(n) && n >= 0 && n <= 999;
  const nairobiDay = (d) => new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const errors = [];
  const clean = games.map((g, i) => {
    const row = `Game ${i + 1}`;
    const homeTeam = String(g.homeTeam || '').trim();
    const awayTeam = String(g.awayTeam || '').trim();
    const kickoff = parseKickoff(g.kickoff);
    const hasHome = g.homeScore !== undefined && g.homeScore !== null && g.homeScore !== '';
    const hasAway = g.awayScore !== undefined && g.awayScore !== null && g.awayScore !== '';
    const homeScore = hasHome ? Number(g.homeScore) : null;
    const awayScore = hasAway ? Number(g.awayScore) : null;
    if (!homeTeam || !awayTeam) errors.push(`${row}: both teams are needed`);
    else if (homeTeam.toLowerCase() === awayTeam.toLowerCase()) errors.push(`${row}: a team can't play itself`);
    if (Number.isNaN(kickoff.getTime())) errors.push(`${row}: the date and time aren't valid`);
    if (hasHome !== hasAway) errors.push(`${row}: enter both scores, or neither for a fixture`);
    else if (hasHome && (!ok(homeScore) || !ok(awayScore))) errors.push(`${row}: scores must be whole numbers from 0 to 999`);
    return { homeTeam, awayTeam, kickoff, homeScore, awayScore, round: g.round, venue: g.venue };
  });
  if (!errors.length) {
    const seen = new Set();
    const season = await getOrCreateCurrentSeason(prisma, competition.id);
    const existing = await prisma.fixture.findMany({ where: { competitionId: competition.id, seasonId: season.id }, select: { homeTeam: true, awayTeam: true, kickoff: true } });
    const key = (h, a, d) => `${h.toLowerCase()}|${a.toLowerCase()}|${nairobiDay(d)}`;
    const existingKeys = new Set(existing.map((f) => key(f.homeTeam, f.awayTeam, f.kickoff)));
    clean.forEach((g, i) => {
      if (Number.isNaN(g.kickoff.getTime())) return;
      const k = key(g.homeTeam, g.awayTeam, g.kickoff);
      if (existingKeys.has(k)) errors.push(`Game ${i + 1}: ${g.homeTeam} v ${g.awayTeam} on that day is already in the fixture list — enter its score there`);
      else if (seen.has(k)) errors.push(`Game ${i + 1}: the same game appears twice`);
      seen.add(k);
    });
  }
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const season = await getOrCreateCurrentSeason(prisma, competition.id);
  if (!req.body.confirm) {
    const sport = await prisma.sport.findUnique({ where: { id: competition.sportId } });
    const warnings = [];
    for (const g of clean) {
      const dayStart = new Date(`${nairobiDay(g.kickoff)}T00:00:00+03:00`);
      const sameDay = await prisma.fixture.findMany({ where: { competitionId: competition.id, kickoff: { gte: dayStart, lt: new Date(dayStart.getTime() + 86400000) } }, select: { homeTeam: true, awayTeam: true } });
      warnings.push(...newGameWarnings(g, sameDay));
      if (g.homeScore !== null) warnings.push(...sanityWarnings(g, g, sport ? sport.slug : ''));
    }
    if (warnings.length) return res.status(409).json({ needsConfirm: true, warnings, error: warnings.join(' ') });
  }
  const isCorrespondent = req.session.user.role === 'CORRESPONDENT';
  // resolveVenue's cache is the venue list itself (it appends new ones),
  // so a misspelt venue typed twice in one save is created once.
  const venueCache = await prisma.venue.findMany({ select: { id: true, name: true } });
  const created = [];
  for (const g of clean) {
    const [{ homeClubId, awayClubId }, venueResult] = await Promise.all([
      resolveClubsForFixture(prisma, competition.id, g.homeTeam, g.awayTeam),
      resolveVenue(prisma, g.venue, venueCache),
    ]);
    const finished = g.homeScore !== null;
    const fixture = await prisma.fixture.create({
      data: {
        competitionId: competition.id,
        seasonId: season.id,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        homeClubId,
        awayClubId,
        kickoff: g.kickoff,
        status: finished ? 'FINISHED' : 'SCHEDULED',
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        venueId: venueResult.venueId,
        round: detailText(g.round) ?? null,
        sourceUrl: finished ? sourceUrl : null,
        resultProvisional: finished && isCorrespondent,
      },
    });
    await logChange('FIXTURE', fixture.id, 'CREATE', finished
      ? `Added result: ${g.homeTeam} ${g.homeScore}-${g.awayScore} ${g.awayTeam}, ${fmtDate(g.kickoff)}`
      : `Added fixture: ${g.homeTeam} vs ${g.awayTeam}, ${fmtDate(g.kickoff)}`, req.session.user.name);
    if (finished && !isCorrespondent) notifyFixtureResult(fixture);
    created.push(fixture);
  }
  res.status(201).json({ created: created.length, fixtures: created });
});

// ---- Admin: import results from a federation's spreadsheet ----
// Rows pasted from Google Sheets/Excel (the Results page parses them):
// { date: 'YYYY-MM-DD', time?: 'HH:MM', home, away, homeScore?, awayScore?,
//   round?, venue? }. Each row is matched to this season's fixture with the
// same two teams (club names and aliases understood) within a day of the
// date, then: fills in the result, adds a missing game, skips one already
// right, or reports a CONFLICT — a published score is never overwritten
// here; an editor corrects it on the Results page with a reason.
// dryRun: true returns the plan without writing anything.
router.post('/:id/import-results', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { rows, dryRun } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Paste at least one row' });
  if (rows.length > 300) return res.status(400).json({ error: 'At most 300 rows at a time' });
  const sourceUrl = sourceUrlOrError(req.body.sourceUrl);
  if (sourceUrl instanceof Error) return res.status(400).json({ error: sourceUrl.message });
  const competition = await prisma.competition.findUnique({ where: { id: req.params.id }, include: { sport: true } });
  if (!competition) return res.status(404).json({ error: 'Competition not found' });
  const season = await getOrCreateCurrentSeason(prisma, competition.id);
  const fixtures = await prisma.fixture.findMany({ where: { competitionId: competition.id, seasonId: season.id } });
  const { sameTeam } = require('../lib/watchMatching');
  const DAY = 86400000;

  const plan = rows.map((row, i) => {
    const line = i + 1;
    const home = String(row.home || '').trim();
    const away = String(row.away || '').trim();
    const hasScore = row.homeScore !== undefined && row.homeScore !== null && row.homeScore !== '' && row.awayScore !== undefined && row.awayScore !== null && row.awayScore !== '';
    const homeScore = hasScore ? Number(row.homeScore) : null;
    const awayScore = hasScore ? Number(row.awayScore) : null;
    const kickoff = /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || '')) ? parseKickoff(`${row.date}T${/^\d{1,2}:\d{2}$/.test(String(row.time || '')) ? String(row.time).padStart(5, '0') : '15:00'}`) : null;
    if (!home || !away || !kickoff || Number.isNaN(kickoff.getTime())) return { line, action: 'BAD', note: 'Needs a date, a home team and an away team' };
    if (hasScore && (!isScore(homeScore) || !isScore(awayScore))) return { line, action: 'BAD', note: 'Scores must be whole numbers' };
    const near = fixtures.filter((f) => Math.abs(f.kickoff.getTime() - kickoff.getTime()) <= 1.5 * DAY);
    let fixture = near.find((f) => sameTeam(f.homeTeam, home) && sameTeam(f.awayTeam, away));
    let swapped = false;
    if (!fixture) { fixture = near.find((f) => sameTeam(f.homeTeam, away) && sameTeam(f.awayTeam, home)); swapped = Boolean(fixture); }
    const base = { line, home, away, date: row.date, homeScore, awayScore };
    if (!fixture) return { ...base, action: hasScore ? 'NEW_RESULT' : 'NEW_FIXTURE', kickoff, round: row.round, venue: row.venue };
    const [h, a] = swapped ? [awayScore, homeScore] : [homeScore, awayScore];
    const match = { ...base, fixtureId: fixture.id, fixture: `${fixture.homeTeam} v ${fixture.awayTeam}` };
    if (!hasScore) return { ...match, action: 'SAME', note: 'Already in the fixture list' };
    if (fixture.status === 'FINISHED' && !fixture.resultProvisional) {
      return fixture.homeScore === h && fixture.awayScore === a
        ? { ...match, action: 'SAME', note: 'Result already on the site' }
        : { ...match, action: 'CONFLICT', note: `The site has ${fixture.homeScore}–${fixture.awayScore}; the sheet says ${h}–${a}. Not changed — correct it on the Results page if the sheet is right.` };
    }
    return { ...match, action: 'RESULT', homeScore: h, awayScore: a };
  });
  const counts = plan.reduce((acc, p) => ({ ...acc, [p.action]: (acc[p.action] || 0) + 1 }), {});
  if (dryRun) return res.json({ plan, counts });

  const who = req.session.user.name;
  const venueCache = await prisma.venue.findMany({ select: { id: true, name: true } });
  for (const p of plan) {
    if (p.action === 'RESULT') {
      const f = await prisma.fixture.update({ where: { id: p.fixtureId }, data: { homeScore: p.homeScore, awayScore: p.awayScore, status: 'FINISHED', resultProvisional: false, ...(sourceUrl ? { sourceUrl } : {}) } });
      await logChange('FIXTURE', f.id, 'UPDATE', `Result (imported): ${f.homeTeam} ${f.homeScore}-${f.awayScore} ${f.awayTeam}`, who);
      notifyFixtureResult(f);
    } else if (p.action === 'NEW_RESULT' || p.action === 'NEW_FIXTURE') {
      const [{ homeClubId, awayClubId }, venueResult] = await Promise.all([resolveClubsForFixture(prisma, competition.id, p.home, p.away), resolveVenue(prisma, p.venue, venueCache)]);
      const finished = p.action === 'NEW_RESULT';
      const f = await prisma.fixture.create({
        data: {
          competitionId: competition.id, seasonId: season.id, homeTeam: p.home, awayTeam: p.away, homeClubId, awayClubId, kickoff: p.kickoff,
          status: finished ? 'FINISHED' : 'SCHEDULED', homeScore: p.homeScore, awayScore: p.awayScore,
          venueId: venueResult.venueId, round: detailText(p.round) ?? null, sourceUrl: finished ? sourceUrl : null,
        },
      });
      await logChange('FIXTURE', f.id, 'CREATE', finished ? `Added result (imported): ${f.homeTeam} ${f.homeScore}-${f.awayScore} ${f.awayTeam}` : `Added fixture (imported): ${f.homeTeam} vs ${f.awayTeam}`, who);
      if (finished) notifyFixtureResult(f);
    }
  }
  await logChange('COMPETITION', competition.id, 'BULK_IMPORT', `Imported a results sheet: ${Object.entries(counts).map(([k, v]) => `${v} ${k.toLowerCase().replace('_', ' ')}`).join(', ')}`, who);
  res.json({ plan, counts });
});

// ---- Admin: save a whole round's results at once ----
// Match day used to mean one Save click per fixture. This takes every
// score from the round panel in one request and applies them in a single
// transaction — all saved or none, so a typo can't leave a round half
// entered. Same semantics as the single-fixture PUT above for each row:
// marks it FINISHED, logs the result, and sends the same full-time push.
// Each row: { fixtureId, homeScore, awayScore } for a full-time result,
// optionally with decidedBy (EXTRA_TIME | PENALTIES | AWARDED | WALKOVER),
// homePenalties/awayPenalties and resultNote; or { fixtureId, status:
// 'POSTPONED', kickoff? } (kickoff = the new date, if known); or
// { fixtureId, status: 'ABANDONED', homeScore?, awayScore?, resultNote }.
// Top level: sourceUrl (stored on finished rows, linked from the match
// page), confirm (true = save despite the warnings below),
// corrections ({ [fixtureId]: reason } — required when changing a result
// that's already published).
//
// - Unusual scores, a result before kick-off etc. come back as 409
//   { needsConfirm, warnings } until sent again with confirm: true.
// - Changing a published result is a correction: recorded (who, before,
//   after, why), shown on the match page, and followers are told. With
//   CORRECTIONS_NEED_SECOND_EDITOR=true it waits for another editor.
// - A CORRESPONDENT's results are provisional: shown as such, no push,
//   kept out of rebuilt tables, until an editor saves them again.
router.put('/:id/fixtures/results', requireResultsAccess, async (req, res) => {
  const { results } = req.body;
  if (!Array.isArray(results) || !results.length) {
    return res.status(400).json({ error: 'results must be a non-empty array' });
  }
  const sourceUrl = sourceUrlOrError(req.body.sourceUrl);
  if (sourceUrl instanceof Error) return res.status(400).json({ error: sourceUrl.message });
  const corrections = req.body.corrections || {};
  const isCorrespondent = req.session.user.role === 'CORRESPONDENT';
  const secondEditor = process.env.CORRECTIONS_NEED_SECOND_EDITOR === 'true';

  const errors = [];
  const seenIds = new Set();
  results.forEach((r, i) => {
    const row = `Row ${i + 1}`;
    if (!r.fixtureId) { errors.push(`${row}: missing fixtureId`); return; }
    if (seenIds.has(r.fixtureId)) errors.push(`${row}: the same fixture appears more than once`);
    seenIds.add(r.fixtureId);
    const status = r.status || 'FINISHED';
    if (!['FINISHED', 'POSTPONED', 'ABANDONED'].includes(status)) { errors.push(`${row}: status must be FINISHED, POSTPONED or ABANDONED`); return; }
    if (status === 'FINISHED' && (!isScore(r.homeScore) || !isScore(r.awayScore))) errors.push(`${row}: scores must be whole numbers from 0 to 999`);
    if (status === 'ABANDONED' && (r.homeScore != null || r.awayScore != null) && (!isScore(r.homeScore) || !isScore(r.awayScore))) errors.push(`${row}: the score when it was abandoned must be two whole numbers, or none`);
    if (status === 'POSTPONED' && r.kickoff && Number.isNaN(parseKickoff(r.kickoff).getTime())) errors.push(`${row}: the new date isn't valid`);
    if (status === 'FINISHED') { const problem = outcomeProblem(r); if (problem) errors.push(`${row}: ${problem}`); }
    if (r.resultNote && String(r.resultNote).length > 200) errors.push(`${row}: keep the note under 200 characters`);
  });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const ids = results.map((r) => r.fixtureId);
  const existing = await prisma.fixture.findMany({ where: { id: { in: ids }, competitionId: req.params.id }, include: { competition: { include: { sport: true } } } });
  if (existing.length !== ids.length) {
    return res.status(400).json({ error: 'One or more fixtures were not found in this competition — reload the page and try again.' });
  }
  const byId = new Map(existing.map((f) => [f.id, f]));

  // A correction = changing a published, confirmed result.
  const isCorrection = (r, before) => before.status === 'FINISHED' && !before.resultProvisional && (
    (r.status || 'FINISHED') !== 'FINISHED' || r.homeScore !== before.homeScore || r.awayScore !== before.awayScore
    || (r.decidedBy || null) !== before.decidedBy || (r.homePenalties ?? null) !== before.homePenalties || (r.awayPenalties ?? null) !== before.awayPenalties);
  const missingReasons = results.filter((r) => isCorrection(r, byId.get(r.fixtureId)) && !String(corrections[r.fixtureId] || '').trim());
  if (missingReasons.length) {
    return res.status(400).json({ error: `Say why you're changing ${missingReasons.map((r) => { const f = byId.get(r.fixtureId); return `${f.homeTeam} ${f.homeScore}–${f.awayScore} ${f.awayTeam}`; }).join(', ')} — it's already published.`, needsReason: missingReasons.map((r) => r.fixtureId) });
  }
  if (isCorrespondent && results.some((r) => isCorrection(r, byId.get(r.fixtureId)))) {
    return res.status(403).json({ error: 'A published result can only be changed by an editor — tell the newsroom what is wrong.' });
  }

  if (!req.body.confirm) {
    const warnings = results.flatMap((r) => ((r.status || 'FINISHED') === 'FINISHED' ? sanityWarnings(byId.get(r.fixtureId), r, byId.get(r.fixtureId).competition.sport.slug) : []));
    if (warnings.length) return res.status(409).json({ needsConfirm: true, warnings, error: warnings.join(' ') });
  }

  const now = new Date();
  const ops = [];
  const outcomes = []; // { fixtureId, kind } for logging and pushes after the write
  for (const r of results) {
    const before = byId.get(r.fixtureId);
    const status = r.status || 'FINISHED';
    if (status === 'POSTPONED') {
      ops.push(prisma.fixture.update({
        where: { id: before.id },
        data: {
          status: 'POSTPONED', homeScore: null, awayScore: null, decidedBy: null, homePenalties: null, awayPenalties: null, resultProvisional: false,
          originalKickoff: before.originalKickoff || before.kickoff,
          ...(r.kickoff ? { kickoff: parseKickoff(r.kickoff) } : {}),
        },
      }));
      outcomes.push({ id: before.id, kind: 'POSTPONED' });
      continue;
    }
    const after = {
      status,
      homeScore: r.homeScore ?? null,
      awayScore: r.awayScore ?? null,
      decidedBy: status === 'FINISHED' ? (r.decidedBy || null) : null,
      homePenalties: r.decidedBy === 'PENALTIES' ? r.homePenalties : null,
      awayPenalties: r.decidedBy === 'PENALTIES' ? r.awayPenalties : null,
      resultNote: r.resultNote !== undefined ? (String(r.resultNote).trim() || null) : before.resultNote,
      resultProvisional: isCorrespondent,
      ...(sourceUrl && status === 'FINISHED' ? { sourceUrl } : {}),
    };
    if (isCorrection(r, before)) {
      const record = {
        fixtureId: before.id, userName: req.session.user.name, reason: String(corrections[before.id]).trim().slice(0, 300),
        beforeHome: before.homeScore, beforeAway: before.awayScore, beforeStatus: before.status,
        afterHome: after.homeScore, afterAway: after.awayScore, afterStatus: after.status,
        afterDecidedBy: after.decidedBy, afterHomePenalties: after.homePenalties, afterAwayPenalties: after.awayPenalties,
      };
      if (secondEditor) {
        ops.push(prisma.fixtureCorrection.create({ data: { ...record, status: 'PENDING' } }));
        outcomes.push({ id: before.id, kind: 'CORRECTION_PENDING' });
        continue; // the published score stays until another editor approves
      }
      ops.push(prisma.fixtureCorrection.create({ data: record }));
      outcomes.push({ id: before.id, kind: 'CORRECTION' });
    } else if (before.status === 'FINISHED' && before.resultProvisional && !isCorrespondent) {
      outcomes.push({ id: before.id, kind: 'CONFIRMED' }); // an editor confirming a correspondent's score
    } else if (before.status !== status || before.homeScore !== after.homeScore || before.awayScore !== after.awayScore) {
      outcomes.push({ id: before.id, kind: status === 'ABANDONED' ? 'ABANDONED' : isCorrespondent ? 'PROVISIONAL' : 'RESULT' });
    }
    ops.push(prisma.fixture.update({ where: { id: before.id }, data: after }));
  }
  await prisma.$transaction(ops);

  const updated = await prisma.fixture.findMany({ where: { id: { in: ids } } });
  const byIdAfter = new Map(updated.map((f) => [f.id, f]));
  for (const { id, kind } of outcomes) {
    const f = byIdAfter.get(id);
    const before = byId.get(id);
    const score = `${f.homeTeam} ${f.homeScore}-${f.awayScore} ${f.awayTeam}${outcomeSuffix(f)}`;
    const who = req.session.user.name;
    if (kind === 'POSTPONED') {
      const moved = f.kickoff.getTime() !== before.kickoff.getTime();
      if (before.status !== 'POSTPONED' || moved) await logChange('FIXTURE', id, 'UPDATE', `Postponed: ${f.homeTeam} vs ${f.awayTeam}${moved ? ` — now ${fmtDate(f.kickoff)}` : ' — new date not known yet'}`, who);
    } else if (kind === 'RESULT' || kind === 'CONFIRMED') {
      await logChange('FIXTURE', id, 'UPDATE', `${kind === 'CONFIRMED' ? 'Confirmed result' : 'Result'}: ${score}`, who);
      notifyFixtureResult(f);
    } else if (kind === 'PROVISIONAL') {
      await logChange('FIXTURE', id, 'UPDATE', `Provisional result (correspondent): ${score}`, who);
    } else if (kind === 'ABANDONED') {
      await logChange('FIXTURE', id, 'UPDATE', `Abandoned: ${f.homeTeam} vs ${f.awayTeam}${f.homeScore != null ? ` at ${f.homeScore}-${f.awayScore}` : ''}`, who);
    } else if (kind === 'CORRECTION') {
      await logChange('FIXTURE', id, 'UPDATE', `Corrected: ${before.homeScore}-${before.awayScore} → ${score} (${corrections[id]})`, who);
      notifyFixtureResult(f, { correction: true });
    } else if (kind === 'CORRECTION_PENDING') {
      await logChange('FIXTURE', id, 'UPDATE', `Correction waiting for a second editor: ${before.homeTeam} ${before.homeScore}-${before.awayScore} → ${results.find((r) => r.fixtureId === id).homeScore}-${results.find((r) => r.fixtureId === id).awayScore}`, who);
    }
  }
  res.json({ saved: results.length, pending: outcomes.filter((o) => o.kind === 'CORRECTION_PENDING').length, provisional: isCorrespondent });
});

// ---- Corrections: the list, undo, and the second-editor approval ----
router.get('/corrections/pending', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const corrections = await prisma.fixtureCorrection.findMany({
    where: { status: 'PENDING' },
    include: { fixture: { select: { id: true, homeTeam: true, awayTeam: true, kickoff: true, competition: { select: { id: true, name: true, slug: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ corrections });
});

async function applyCorrection(correction, data, userName, summary) {
  const f = await prisma.fixture.update({ where: { id: correction.fixtureId }, data });
  await logChange('FIXTURE', f.id, 'UPDATE', summary(f), userName);
  return f;
}

router.post('/corrections/:id/approve', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const c = await prisma.fixtureCorrection.findUnique({ where: { id: req.params.id } });
  if (!c || c.status !== 'PENDING') return res.status(404).json({ error: 'No pending correction with that id' });
  if (c.userName === req.session.user.name) return res.status(403).json({ error: 'A different editor has to approve your correction' });
  const f = await applyCorrection(c, {
    status: c.afterStatus, homeScore: c.afterHome, awayScore: c.afterAway,
    decidedBy: c.afterDecidedBy, homePenalties: c.afterHomePenalties, awayPenalties: c.afterAwayPenalties, resultProvisional: false,
  }, req.session.user.name, (fx) => `Approved correction: ${c.beforeHome}-${c.beforeAway} → ${fx.homeTeam} ${fx.homeScore}-${fx.awayScore} ${fx.awayTeam} (${c.reason})`);
  await prisma.fixtureCorrection.update({ where: { id: c.id }, data: { status: 'APPLIED', decidedBy: req.session.user.name, decidedAt: new Date() } });
  notifyFixtureResult(f, { correction: true });
  res.json({ ok: true });
});

router.post('/corrections/:id/reject', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const c = await prisma.fixtureCorrection.findUnique({ where: { id: req.params.id } });
  if (!c || c.status !== 'PENDING') return res.status(404).json({ error: 'No pending correction with that id' });
  await prisma.fixtureCorrection.update({ where: { id: c.id }, data: { status: 'REJECTED', decidedBy: req.session.user.name, decidedAt: new Date() } });
  await logChange('FIXTURE', c.fixtureId, 'UPDATE', `Rejected correction to ${c.afterHome}-${c.afterAway}`, req.session.user.name);
  res.json({ ok: true });
});

// Undo an applied correction: the result goes back to what it was.
router.post('/corrections/:id/revert', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const c = await prisma.fixtureCorrection.findUnique({ where: { id: req.params.id } });
  if (!c || c.status !== 'APPLIED' || c.revertedAt) return res.status(404).json({ error: 'Nothing to undo for that correction' });
  const f = await applyCorrection(c, { status: c.beforeStatus, homeScore: c.beforeHome, awayScore: c.beforeAway }, req.session.user.name,
    (fx) => `Undid correction: back to ${fx.homeTeam} ${fx.homeScore}-${fx.awayScore} ${fx.awayTeam}`);
  await prisma.fixtureCorrection.update({ where: { id: c.id }, data: { revertedAt: new Date(), status: 'REVERTED' } });
  notifyFixtureResult(f, { correction: true });
  res.json({ ok: true });
});

// ---- Admin: rebuild the current season's table from its results ----
// Standings were hand-typed, separately from results — after every round
// someone re-entered every row. This computes them from the season's
// FINISHED fixtures instead, using the sport's rule from
// lib/pointsRules.js. Sports whose tables need more than final scores
// (rugby's bonus points) aren't listed there and keep manual entry.
// Explicit button, never automatic — a table may carry federation
// decisions (points deductions, awarded matches) that results alone don't
// show. Head-to-head tie-breaks (used by some leagues) aren't applied;
// editors can still adjust by hand afterwards.
router.post('/:id/standings/recalculate', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const competition = await prisma.competition.findUnique({ where: { id: req.params.id }, include: { sport: true } });
  if (!competition) return res.status(404).json({ error: 'Competition not found' });
  const rule = pointsRuleFor(competition.sport.slug);
  if (!rule) {
    return res.status(400).json({ error: `${competition.sport.name} tables can't be rebuilt from scores alone (e.g. bonus points) — standings still need manual entry.` });
  }
  const season = await getOrCreateCurrentSeason(prisma, competition.id);
  const fixtures = await prisma.fixture.findMany({
    where: { competitionId: competition.id, seasonId: season.id, status: 'FINISHED', resultProvisional: false, homeScore: { not: null }, awayScore: { not: null } },
  });
  if (!fixtures.length) return res.status(400).json({ error: 'No finished fixtures with scores in the current season yet.' });

  const ranked = computeTable(fixtures.map((f) => ({ home: f.homeTeam, away: f.awayTeam, homeScore: f.homeScore, awayScore: f.awayScore })), rule);

  await prisma.$transaction([
    prisma.standingRow.deleteMany({ where: { competitionId: competition.id, seasonId: season.id } }),
    prisma.standingRow.createMany({ data: ranked.map((r, i) => ({ ...r, competitionId: competition.id, seasonId: season.id, position: i + 1 })) }),
  ]);
  await logChange('COMPETITION', competition.id, 'UPDATE', `Recalculated ${competition.name} table from ${fixtures.length} result(s)`, req.session.user.name);
  res.json({ standings: ranked.length, fromResults: fixtures.length });
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

// ---- Canonical Fixture/Match linking (Wave 9 pre-OS refinement §8.2) ----
// Closes the one core entity that never had a canonical integration at
// all before this — see UNDERDAWGS_DOMAIN_CONTRACT.md's "Fixture" entry.
router.get('/fixtures/:fixtureId/canonical-fixture', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const canonicalFixture = await fetchCanonicalFixture(req.params.fixtureId);
  res.json({ canonicalFixture });
});

// Fixture has no name field on either side to search by — candidates are
// browsed between the two Clubs' own already-linked canonical Teams, not
// searched by text. Empty list (not an error) if either Club isn't
// canonically linked yet, or if the fixture has no Club resolved at all.
router.get('/fixtures/:fixtureId/canonical-fixture-candidates', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const fixture = await prisma.fixture.findUnique({ where: { id: req.params.fixtureId } });
  if (!fixture) return res.status(404).json({ error: 'Fixture not found' });
  const candidates = await listCanonicalFixtureCandidates(fixture.homeClubId, fixture.awayClubId);
  res.json({ candidates });
});

router.put('/fixtures/:fixtureId/canonical-fixture', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { canonicalFixtureId } = req.body;
  if (!canonicalFixtureId) return res.status(400).json({ error: 'canonicalFixtureId is required' });

  const fixture = await prisma.fixture.findUnique({ where: { id: req.params.fixtureId } });
  if (!fixture) return res.status(404).json({ error: 'Fixture not found' });

  const canonicalFixture = await verifyCanonicalFixture(canonicalFixtureId);
  if (!canonicalFixture) {
    return res.status(422).json({ error: 'No Data Platform Fixture with that id could be verified (check the id, or the Data Platform may be unreachable — try again).' });
  }

  await prisma.canonicalMapping.upsert({
    where: {
      localEntityType_localId_provider: { localEntityType: 'FIXTURE', localId: fixture.id, provider: 'underdawgs-data' },
    },
    update: { canonicalEntityType: 'Fixture', canonicalId: canonicalFixtureId },
    create: { localEntityType: 'FIXTURE', localId: fixture.id, canonicalEntityType: 'Fixture', canonicalId: canonicalFixtureId },
  });

  res.json({ canonicalFixture });
});

router.delete('/fixtures/:fixtureId/canonical-fixture', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.canonicalMapping.deleteMany({
    where: { localEntityType: 'FIXTURE', localId: req.params.fixtureId, provider: 'underdawgs-data' },
  });
  res.json({ ok: true });
});

module.exports = router;
