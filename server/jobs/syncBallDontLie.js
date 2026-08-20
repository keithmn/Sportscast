// NBA fixtures via balldontlie.io — added alongside (not instead of) the
// existing TheSportsDB EuroLeague feed, so the Basketball hub carries both
// competitions plus the local KBF Premier League. Confirmed directly
// against the live API before building this: /teams and /games work on the
// free tier, but /standings returns 401 (paid-plan-only) — same honest
// empty-state as TheSportsDB's premium-gated lookuptable.php, so no
// StandingRow sync here either.
//
// /teams also returns ~89 rows (every franchise across NBA history —
// relocated/renamed teams included), not just the current 30, so it's not
// used at all: each game object already embeds full home_team/visitor_team
// data, exactly like TheSportsDB's 'team'-kind events.

const prisma = require('../db');

const BALLDONTLIE_KEY = process.env.BALLDONTLIE_API_KEY;
const BASE = 'https://api.balldontlie.io/v1';

// Confirmed via response headers: x-ratelimit-limit: 5 (per minute) on the
// free tier. 13s between calls keeps a full minute's margin under that.
const CALL_DELAY_MS = 13000;

// Trailing + forward window, re-fetched daily — not the whole season (which
// would need dozens of paginated calls at 5 req/min). Wide enough to catch
// newly-finished results and the upcoming schedule without re-walking
// history the job already has.
const PAST_DAYS = 10;
const FORWARD_DAYS = 45;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: BALLDONTLIE_KEY },
  });
  if (!res.ok) throw new Error(`balldontlie ${path} -> ${res.status}`);
  return res.json();
}

// status_state is the documented stable enum — status is a human-readable
// string ("7:00 pm ET", "3rd Qtr", "Final") not meant for lifecycle logic.
function mapStatus(game) {
  switch (game.status_state) {
    case 'final': return 'FINISHED';
    case 'in_progress':
    case 'delayed':
    case 'suspended': return 'LIVE';
    case 'postponed':
    case 'canceled':
    case 'abandoned': return 'POSTPONED';
    default: return 'SCHEDULED';
  }
}

function gameToFixtureFields(game) {
  return {
    homeTeam: game.home_team.full_name,
    awayTeam: game.visitor_team.full_name,
    kickoff: new Date(game.datetime),
    homeScore: game.home_team_score || null,
    awayScore: game.visitor_team_score || null,
    status: mapStatus(game),
  };
}

async function fetchAllGames(startDate, endDate) {
  const games = [];
  let cursor = null;
  for (;;) {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, per_page: '100' });
    if (cursor) params.set('cursor', cursor);
    const page = await fetchJson(`/games?${params}`);
    games.push(...page.data);
    cursor = page.meta?.next_cursor || null;
    if (!cursor) break;
    await sleep(CALL_DELAY_MS);
  }
  return games;
}

async function syncBallDontLie() {
  if (!BALLDONTLIE_KEY) {
    console.warn('[syncBallDontLie] BALLDONTLIE_API_KEY not set — skipping.');
    return;
  }

  const sport = await prisma.sport.findUnique({ where: { name: 'Basketball' } });
  if (!sport) {
    console.warn('[syncBallDontLie] Sport not found: Basketball — skipping.');
    return;
  }

  let league = await prisma.league.findFirst({
    where: { externalProvider: 'balldontlie.io', externalId: 'nba' },
  });
  if (!league) {
    league = await prisma.league.create({
      data: {
        name: 'NBA',
        slug: require('../utils/slugify').slugify('NBA'),
        sportId: sport.id,
        region: 'GLOBAL',
        source: 'API',
        externalProvider: 'balldontlie.io',
        externalId: 'nba',
      },
    });
    console.log('[syncBallDontLie] Created league: NBA');
  }

  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - PAST_DAYS);
    const end = new Date(now);
    end.setDate(end.getDate() + FORWARD_DAYS);

    const games = await fetchAllGames(isoDate(start), isoDate(end));

    let count = 0;
    for (const game of games) {
      const fields = gameToFixtureFields(game);
      await prisma.fixture.upsert({
        where: {
          leagueId_homeTeam_awayTeam_kickoff: {
            leagueId: league.id,
            homeTeam: fields.homeTeam,
            awayTeam: fields.awayTeam,
            kickoff: fields.kickoff,
          },
        },
        create: { leagueId: league.id, ...fields },
        update: { homeScore: fields.homeScore, awayScore: fields.awayScore, status: fields.status },
      });
      count += 1;
    }

    await prisma.league.update({
      where: { id: league.id },
      data: { lastSyncedAt: new Date(), syncStatus: 'OK' },
    });
    console.log(`[syncBallDontLie] OK: NBA (${count} fixtures)`);
  } catch (err) {
    await prisma.league.update({
      where: { id: league.id },
      data: { syncStatus: 'ERROR' },
    });
    console.error('[syncBallDontLie] FAILED: NBA —', err.message);
  }
  console.log('[syncBallDontLie] Done.');
}

module.exports = { syncBallDontLie };

if (require.main === module) {
  syncBallDontLie()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
