// Global (region: GLOBAL, source: API, externalProvider: 'thesportsdb.com')
// fixtures for the 4 international competitions confirmed to actually exist
// on TheSportsDB's free tier: Rugby's Six Nations, Basketball's EuroLeague,
// world-title Boxing, and PDC Darts. Two others originally hoped for —
// international field hockey (FIH Pro League) and volleyball (FIVB Nations
// League) — turned out not to be in TheSportsDB's data at all despite an
// earlier (wrong) research claim; verified directly against the live API
// before writing this, not assumed.
//
// Free-tier limitation, confirmed directly: lookuptable.php (standings)
// returns empty — that's a premium-only endpoint. Only fixtures/results
// sync here; StandingRow stays empty for these competitions until/unless a
// paid key changes that, same honest-empty-state as everywhere else.
//
// Deliberately NOT the same job as syncLeagues.js (football-data.org) —
// different vendor, different endpoint shape, different event structure
// per competition (see COMPETITIONS config below).

const prisma = require('../db');
const { resolveClubIdForTeamName } = require('../lib/clubResolution');
const { getOrCreateCurrentSeason } = require('../lib/seasonResolution');

const THESPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '123';
const BASE = `https://www.thesportsdb.com/api/v1/json/${THESPORTSDB_KEY}`;
const CALL_DELAY_MS = 2000; // polite pacing, no published rate limit to target precisely

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// kind: 'team' — real strHomeTeam/strAwayTeam (Rugby, Basketball).
// kind: 'vs'   — strHomeTeam/strAwayTeam are null, but strEvent is
//                "Name A vs Name B" (Boxing) — parsed out here.
// kind: 'event' — no home/away concept at all, strEvent is a tournament/day
//                 name (Darts) — stored as homeTeam with awayTeam left ''
//                 (see fixtureRowHtml's blank-awayTeam handling in scores.js).
const COMPETITIONS = [
  { sportName: 'Rugby', competitionName: 'Six Nations Championship', externalId: '4714', kind: 'team' },
  { sportName: 'Basketball', competitionName: 'EuroLeague Basketball', externalId: '4546', kind: 'team' },
  { sportName: 'Boxing', competitionName: 'World Championship Boxing', externalId: '4445', kind: 'vs' },
  { sportName: 'Darts', competitionName: 'PDC Darts', externalId: '4554', kind: 'event' },
];

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`TheSportsDB ${path} -> ${res.status}`);
  const text = await res.text();
  if (!text) return null; // premium-only endpoints return an empty 200 body on the free tier
  return JSON.parse(text);
}

// FT/AOT/AET-style finished codes vary by sport on TheSportsDB; fall back to
// "has a score" when strStatus is blank, which Boxing/Darts events don't
// reliably populate.
function mapStatus(event) {
  const s = (event.strStatus || '').toUpperCase();
  if (s === 'FT' || s === 'AOT' || s === 'AET') return 'FINISHED';
  if (['1H', '2H', 'HT', 'LIVE', 'Q1', 'Q2', 'Q3', 'Q4'].includes(s)) return 'LIVE';
  if (s === 'PST' || s === 'POSTPONED' || s === 'CANC') return 'POSTPONED';
  if (s === 'NS' || s === '') {
    if (event.intHomeScore != null || event.intAwayScore != null) return 'FINISHED';
    return 'SCHEDULED';
  }
  return 'SCHEDULED';
}

function eventToFixtureFields(event, kind) {
  let homeTeam;
  let awayTeam;

  if (kind === 'team') {
    homeTeam = event.strHomeTeam;
    awayTeam = event.strAwayTeam;
  } else if (kind === 'vs') {
    const parts = (event.strEvent || '').split(' vs ');
    homeTeam = (parts[0] || event.strEvent || 'TBD').trim();
    awayTeam = (parts[1] || '').trim();
  } else {
    homeTeam = event.strEvent || 'TBD';
    awayTeam = '';
  }

  if (!homeTeam) return null; // can't form a usable row

  return {
    homeTeam,
    awayTeam,
    kickoff: new Date(`${event.dateEvent}T${event.strTime && event.strTime !== '00:00:00' ? event.strTime : '00:00:00'}`),
    homeScore: event.intHomeScore != null ? parseInt(event.intHomeScore, 10) : null,
    awayScore: event.intAwayScore != null ? parseInt(event.intAwayScore, 10) : null,
    status: mapStatus(event),
  };
}

async function syncFixturesForCompetition(competition, kind) {
  const [pastData, nextData] = await Promise.all([
    fetchJson(`/eventspastleague.php?id=${competition.externalId}`),
    fetchJson(`/eventsnextleague.php?id=${competition.externalId}`),
  ]);
  const events = [...(pastData?.events || []), ...(nextData?.events || [])];
  const [clubs, season] = await Promise.all([
    prisma.club.findMany({ where: { competitionId: competition.id }, select: { id: true, name: true } }),
    getOrCreateCurrentSeason(prisma, competition.id),
  ]);

  let count = 0;
  for (const event of events) {
    const fields = eventToFixtureFields(event, kind);
    if (!fields) continue;
    const homeClubId = resolveClubIdForTeamName(fields.homeTeam, clubs);
    const awayClubId = resolveClubIdForTeamName(fields.awayTeam, clubs);
    await prisma.fixture.upsert({
      where: {
        competitionId_homeTeam_awayTeam_kickoff: {
          competitionId: competition.id,
          homeTeam: fields.homeTeam,
          awayTeam: fields.awayTeam,
          kickoff: fields.kickoff,
        },
      },
      create: { competitionId: competition.id, seasonId: season.id, ...fields, homeClubId, awayClubId },
      update: { homeScore: fields.homeScore, awayScore: fields.awayScore, status: fields.status, homeClubId, awayClubId },
    });
    count += 1;
  }
  return count;
}

async function syncTheSportsDB() {
  for (const { sportName, competitionName, externalId, kind } of COMPETITIONS) {
    try {
      const sport = await prisma.sport.findUnique({ where: { name: sportName } });
      if (!sport) {
        console.warn(`[syncTheSportsDB] Sport not found: ${sportName} — skipping ${competitionName}`);
        continue;
      }

      let competition = await prisma.competition.findFirst({
        where: { externalProvider: 'thesportsdb.com', externalId },
      });
      if (!competition) {
        competition = await prisma.competition.create({
          data: {
            name: competitionName,
            slug: require('../utils/slugify').slugify(competitionName),
            sportId: sport.id,
            region: 'GLOBAL',
            source: 'API',
            externalProvider: 'thesportsdb.com',
            externalId,
          },
        });
        console.log(`[syncTheSportsDB] Created competition: ${competitionName}`);
      }

      const count = await syncFixturesForCompetition(competition, kind);
      await prisma.competition.update({
        where: { id: competition.id },
        data: { lastSyncedAt: new Date(), syncStatus: 'OK' },
      });
      console.log(`[syncTheSportsDB] OK: ${competitionName} (${count} fixtures)`);
    } catch (err) {
      console.error(`[syncTheSportsDB] FAILED: ${competitionName} —`, err.message);
    }
    await sleep(CALL_DELAY_MS);
  }
  console.log('[syncTheSportsDB] Done.');
}

module.exports = { syncTheSportsDB };

if (require.main === module) {
  syncTheSportsDB()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
