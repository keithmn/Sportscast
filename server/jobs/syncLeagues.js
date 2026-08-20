// Populates global (region: GLOBAL, source: API) League rows from
// football-data.org's free tier. Kenyan leagues (KPL, NSL — source: MANUAL)
// are never touched here; they stay newsroom-entered via /admin/scores.html.
//
// Deliberately NOT a public route — a route would let anyone retrigger it
// and blow the free tier's 10-calls/minute limit. Runs on a schedule (see
// server/index.js's node-cron wiring) or manually via `npm run sync:leagues`.
//
// Standings: same delete-all-then-recreate approach the admin route already
// uses for manual entry — safe here since a competition's live table is
// meant to be a full authoritative replacement each sync.
//
// Fixtures: upserted by (leagueId, homeTeam, awayTeam, kickoff) instead of
// wholesale replace — unlike standings, blowing fixtures away every run
// would lose any POSTPONED/manual annotations a future admin edit adds.

const prisma = require('../db');

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

async function syncStandings(league, apiKey) {
  const data = await fetchFromFootballData(`/competitions/${league.externalId}/standings`, apiKey);
  // Competitions can return several standings groups (TOTAL/HOME/AWAY, or
  // per-group tables for cup-style competitions) — the overall table is
  // what this site displays.
  const table = (data.standings || []).find((s) => s.type === 'TOTAL')?.table || [];
  if (!table.length) return; // e.g. a competition with no single league table

  const rows = table.map((row) => ({
    leagueId: league.id,
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

  await prisma.$transaction([
    prisma.standingRow.deleteMany({ where: { leagueId: league.id } }),
    prisma.standingRow.createMany({ data: rows }),
  ]);
}

async function syncFixtures(league, apiKey) {
  const data = await fetchFromFootballData(`/competitions/${league.externalId}/matches`, apiKey);
  const matches = data.matches || [];

  for (const m of matches) {
    const kickoff = new Date(m.utcDate);
    await prisma.fixture.upsert({
      where: {
        leagueId_homeTeam_awayTeam_kickoff: {
          leagueId: league.id,
          homeTeam: m.homeTeam.name,
          awayTeam: m.awayTeam.name,
          kickoff,
        },
      },
      create: {
        leagueId: league.id,
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
        kickoff,
        homeScore: m.score?.fullTime?.home ?? null,
        awayScore: m.score?.fullTime?.away ?? null,
        status: mapStatus(m.status),
      },
      update: {
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
    console.warn('[syncLeagues] FOOTBALL_DATA_API_KEY not set — skipping global league sync.');
    return;
  }

  // externalProvider filter matters now that other API-sourced leagues exist
  // (TheSportsDB, see syncTheSportsDB.js) — this job only knows how to talk
  // to football-data.org's endpoint shape.
  const leagues = await prisma.league.findMany({ where: { source: 'API', externalProvider: 'football-data.org' } });
  if (!leagues.length) {
    console.log('[syncLeagues] No API-sourced leagues to sync.');
    return;
  }

  console.log(`[syncLeagues] Syncing ${leagues.length} league(s)...`);
  for (const league of leagues) {
    try {
      await syncStandings(league, apiKey);
      await sleep(CALL_DELAY_MS);
      await syncFixtures(league, apiKey);
      await sleep(CALL_DELAY_MS);
      await prisma.league.update({
        where: { id: league.id },
        data: { lastSyncedAt: new Date(), syncStatus: 'OK' },
      });
      console.log(`[syncLeagues] OK: ${league.name}`);
    } catch (err) {
      console.error(`[syncLeagues] FAILED: ${league.name} —`, err.message);
      // One bad competition shouldn't block the rest of the run.
      await prisma.league.update({
        where: { id: league.id },
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
