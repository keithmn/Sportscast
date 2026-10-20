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
function notifyFixtureResult(fixture) {
  if (fixture.homeScore == null || fixture.awayScore == null) return; // never announce a score we don't have
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
      title: `Full-time: ${fixture.homeTeam} ${fixture.homeScore}-${fixture.awayScore} ${fixture.awayTeam}`,
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

// ---- Admin: show/hide a competition on the public site ----
router.put('/:id/active', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  if (typeof req.body.isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false' });
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
router.get('/changelog', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const entries = await prisma.changeLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ entries });
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

  const seasons = await prisma.competitionSeason.findMany({
    where: { competitionId: competition.id },
    orderBy: { createdAt: 'desc' },
  });
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
router.post('/:id/seasons', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { label } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'label is required' });
  const trimmedLabel = label.trim();

  const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
  if (!competition) return res.status(404).json({ error: 'Competition not found' });

  const existing = await prisma.competitionSeason.findUnique({
    where: { competitionId_label: { competitionId: req.params.id, label: trimmedLabel } },
  });
  if (existing) return res.status(409).json({ error: `A season labeled "${trimmedLabel}" already exists for this competition.` });

  const [, season] = await prisma.$transaction([
    prisma.competitionSeason.updateMany({ where: { competitionId: req.params.id, isCurrent: true }, data: { isCurrent: false } }),
    prisma.competitionSeason.create({ data: { competitionId: req.params.id, label: trimmedLabel, isCurrent: true } }),
  ]);
  await logChange('COMPETITION', competition.id, 'UPDATE', `Started new season "${season.label}" for "${competition.name}"`, req.session.user.name);
  res.status(201).json({ season });
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
router.post('/:id/games', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
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
      },
    });
    await logChange('FIXTURE', fixture.id, 'CREATE', finished
      ? `Added result: ${g.homeTeam} ${g.homeScore}-${g.awayScore} ${g.awayTeam}, ${fmtDate(g.kickoff)}`
      : `Added fixture: ${g.homeTeam} vs ${g.awayTeam}, ${fmtDate(g.kickoff)}`, req.session.user.name);
    if (finished) notifyFixtureResult(fixture);
    created.push(fixture);
  }
  res.status(201).json({ created: created.length, fixtures: created });
});

// ---- Admin: save a whole round's results at once ----
// Match day used to mean one Save click per fixture. This takes every
// score from the round panel in one request and applies them in a single
// transaction — all saved or none, so a typo can't leave a round half
// entered. Same semantics as the single-fixture PUT above for each row:
// marks it FINISHED, logs the result, and sends the same full-time push.
// A row may instead be { fixtureId, status: 'POSTPONED' } (no scores).
// An optional top-level sourceUrl — the official page or report the
// scores were confirmed from — is stored on every finished row, and the
// public match page links it.
router.put('/:id/fixtures/results', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { results } = req.body;
  if (!Array.isArray(results) || !results.length) {
    return res.status(400).json({ error: 'results must be a non-empty array' });
  }
  const sourceUrl = sourceUrlOrError(req.body.sourceUrl);
  if (sourceUrl instanceof Error) return res.status(400).json({ error: sourceUrl.message });
  const errors = [];
  results.forEach((r, i) => {
    const ok = (n) => Number.isInteger(n) && n >= 0 && n <= 999;
    if (!r.fixtureId) errors.push(`Row ${i + 1}: missing fixtureId`);
    else if (r.status !== undefined && !['FINISHED', 'POSTPONED'].includes(r.status)) errors.push(`Row ${i + 1}: status must be FINISHED or POSTPONED`);
    else if (r.status !== 'POSTPONED' && (!ok(r.homeScore) || !ok(r.awayScore))) errors.push(`Row ${i + 1}: scores must be whole numbers from 0 to 999`);
    else if (r.status === 'POSTPONED' && r.kickoff && Number.isNaN(parseKickoff(r.kickoff).getTime())) errors.push(`Row ${i + 1}: the new date isn't valid`);
  });
  // The same fixture twice in one save would update it twice, log it twice
  // and send followers two full-time notifications (possibly with
  // different scores) — refuse instead of guessing which row is meant.
  const seenIds = new Set();
  results.forEach((r, i) => {
    if (r.fixtureId && seenIds.has(r.fixtureId)) errors.push(`Row ${i + 1}: the same fixture appears more than once`);
    seenIds.add(r.fixtureId);
  });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const ids = results.map((r) => r.fixtureId);
  const existing = await prisma.fixture.findMany({ where: { id: { in: ids }, competitionId: req.params.id } });
  if (existing.length !== ids.length) {
    return res.status(400).json({ error: 'One or more fixtures were not found in this competition — reload the page and try again.' });
  }
  const byId = new Map(existing.map((f) => [f.id, f]));

  const updated = await prisma.$transaction(results.map((r) => prisma.fixture.update({
    where: { id: r.fixtureId },
    // Postponed with a new date: the game moves to it, and the date it was
    // first set for is kept so the site can say "was 25 Oct — now 1 Nov".
    data: r.status === 'POSTPONED'
      ? {
        status: 'POSTPONED', homeScore: null, awayScore: null,
        originalKickoff: byId.get(r.fixtureId).originalKickoff || byId.get(r.fixtureId).kickoff,
        ...(r.kickoff ? { kickoff: parseKickoff(r.kickoff) } : {}),
      }
      : { homeScore: r.homeScore, awayScore: r.awayScore, status: 'FINISHED', ...(sourceUrl ? { sourceUrl } : {}) },
  })));

  for (const fixture of updated) {
    const before = byId.get(fixture.id);
    if (fixture.status === 'POSTPONED') {
      const moved = fixture.kickoff.getTime() !== before.kickoff.getTime();
      if (before.status !== 'POSTPONED' || moved) await logChange('FIXTURE', fixture.id, 'UPDATE', `Postponed: ${fixture.homeTeam} vs ${fixture.awayTeam}${moved ? ` — now ${fmtDate(fixture.kickoff)}` : ' — new date not known yet'}`, req.session.user.name);
      continue;
    }
    const isNew = before.status !== 'FINISHED';
    const changed = before.homeScore !== fixture.homeScore || before.awayScore !== fixture.awayScore;
    if (!isNew && !changed) continue;
    await logChange('FIXTURE', fixture.id, 'UPDATE', `Result: ${fixture.homeTeam} ${fixture.homeScore}-${fixture.awayScore} ${fixture.awayTeam}`, req.session.user.name);
    if (isNew) notifyFixtureResult(fixture);
  }
  res.json({ saved: updated.length });
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
    where: { competitionId: competition.id, seasonId: season.id, status: 'FINISHED', homeScore: { not: null }, awayScore: { not: null } },
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
