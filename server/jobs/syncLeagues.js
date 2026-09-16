// Populates global (region: GLOBAL, source: API) Competition rows from
// football-data.org's free tier. Kenyan competitions (KPL, NSL — source:
// MANUAL) are never touched here; they stay newsroom-entered via
// /admin/competitions.html.
//
// Deliberately NOT a public route — a route would let anyone retrigger it
// and blow the free tier's 10-calls/minute limit. Runs on a schedule (see
// server/index.js's node-cron wiring) or manually via `npm run sync:leagues`.
//
// Standings: same delete-all-then-recreate approach the admin route already
// uses for manual entry — safe here since a competition's live table is
// meant to be a full authoritative replacement each sync.
//
// Fixtures: upserted by (competitionId, homeTeam, awayTeam, kickoff) instead
// of wholesale replace — unlike standings, blowing fixtures away every run
// would lose any POSTPONED/manual annotations a future admin edit adds.

const prisma = require('../db');
const { resolveClubIdForTeamName } = require('../lib/clubResolution');
const { getOrCreateCurrentSeason } = require('../lib/seasonResolution');

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
// ~9 calls/minute, under the free tier's 10/minute cap, with headroom for
// clock drift — a plain paced loop is enough at ~12 competitions, no queue
// library needed.
const CALL_DELAY_MS = 6500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// football-data.org: SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED |
// POSTPONED | SUSPENDED | CANCELLED  →  this schema's SCHEDULED | LIVE |
// FINISHED | POSTPONED.
function mapStatus(externalStatus) {
  switch (externalStatus) {
    case 'IN_PLAY':
    case 'PAUSED':
      return 'LIVE';
    case 'FINISHED':
      return 'FINISHED';
    case 'POSTPONED':
    case 'SUSPENDED':
    case 'CANCELLED':
      return 'POSTPONED';
    default:
      return 'SCHEDULED';
  }
}

async function fetchFromFootballData(path, apiKey) {
  const res = await fetch(`${FOOTBALL_DATA_BASE}${path}`, {
    headers: { 'X-Auth-Token': apiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data.org ${path} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function syncStandings(competition, apiKey) {
  const data = await fetchFromFootballData(`/competitions/${competition.externalId}/standings`, apiKey);
  // Competitions can return several standings groups (TOTAL/HOME/AWAY, or
  // per-group tables for cup-style competitions) — the overall table is
  // what this site displays.
  const table = (data.standings || []).find((s) => s.type === 'TOTAL')?.table || [];
  if (!table.length) return; // e.g. a competition with no single table

  const season = await getOrCreateCurrentSeason(prisma, competition.id);
  const rows = table.map((row) => ({
    competitionId: competition.id,
    seasonId: season.id,
    position: row.position,
    teamName: row.team.name,
    played: row.playedGames,
    won: row.won,
    drawn: row.draw,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    points: row.points,
  }));

  // Scoped to the current season only, so a past (archived) season's
  // standings survive this competition's next sync run untouched.
  await prisma.$transaction([
    prisma.standingRow.deleteMany({ where: { competitionId: competition.id, seasonId: season.id } }),
    prisma.standingRow.createMany({ data: rows }),
  ]);
}

async function syncFixtures(competition, apiKey) {
  const data = await fetchFromFootballData(`/competitions/${competition.externalId}/matches`, apiKey);
  const matches = data.matches || [];

  // Fetched once per competition, not per fixture — clubs never span
  // competitions, so this scopes correctly and avoids N+1 queries.
  const [clubs, season] = await Promise.all([
    prisma.club.findMany({ where: { competitionId: competition.id }, select: { id: true, name: true } }),
    getOrCreateCurrentSeason(prisma, competition.id),
  ]);

  for (const m of matches) {
    const kickoff = new Date(m.utcDate);
    const homeClubId = resolveClubIdForTeamName(m.homeTeam.name, clubs);
    const awayClubId = resolveClubIdForTeamName(m.awayTeam.name, clubs);
    await prisma.fixture.upsert({
      where: {
        competitionId_homeTeam_awayTeam_kickoff: {
          competitionId: competition.id,
          homeTeam: m.homeTeam.name,
          awayTeam: m.awayTeam.name,
          kickoff,
        },
      },
      create: {
        competitionId: competition.id,
        seasonId: season.id,
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
        homeClubId,
        awayClubId,
        kickoff,
        homeScore: m.score?.fullTime?.home ?? null,
        awayScore: m.score?.fullTime?.away ?? null,
        status: mapStatus(m.status),
      },
      update: {
        homeClubId,
        awayClubId,
        homeScore: m.score?.fullTime?.home ?? null,
        awayScore: m.score?.fullTime?.away ?? null,
        status: mapStatus(m.status),
      },
    });
  }
}

async function syncLeagues() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    console.warn('[syncLeagues] FOOTBALL_DATA_API_KEY not set — skipping global competition sync.');
    return;
  }

  // externalProvider filter matters now that other API-sourced competitions
  // exist (TheSportsDB, see syncTheSportsDB.js) — this job only knows how to
  // talk to football-data.org's endpoint shape.
  const competitions = await prisma.competition.findMany({ where: { source: 'API', externalProvider: 'football-data.org' } });
  if (!competitions.length) {
    console.log('[syncLeagues] No API-sourced competitions to sync.');
    return;
  }

  console.log(`[syncLeagues] Syncing ${competitions.length} competition(s)...`);
  for (const competition of competitions) {
    try {
      await syncStandings(competition, apiKey);
      await sleep(CALL_DELAY_MS);
      await syncFixtures(competition, apiKey);
      await sleep(CALL_DELAY_MS);
      await prisma.competition.update({
        where: { id: competition.id },
        data: { lastSyncedAt: new Date(), syncStatus: 'OK' },
      });
      console.log(`[syncLeagues] OK: ${competition.name}`);
    } catch (err) {
      console.error(`[syncLeagues] FAILED: ${competition.name} —`, err.message);
      // One bad competition shouldn't block the rest of the run.
      await prisma.competition.update({
        where: { id: competition.id },
        data: { syncStatus: 'ERROR' },
      }).catch(() => {});
    }
  }
  console.log('[syncLeagues] Done.');
}

module.exports = { syncLeagues };

if (require.main === module) {
  syncLeagues()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
