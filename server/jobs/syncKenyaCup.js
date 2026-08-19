// Scrapes Kenya Cup's own public standings page — the one Kenyan league
// this session's research found genuinely feasible: server-rendered HTML
// (not JS-required), no robots.txt block, no Terms of Use found on either
// kenyacup.co.ke or kru.co.ke despite real searching. Treat that as "no
// known prohibition," not "confirmed permission" — poll infrequently
// (daily, see server/index.js's cron) and identify with a real UA.
//
// Deliberately standings-only. The site's Fixtures/Results content is
// free-text (bonus-point asterisks embedded in scores, inconsistent team
// name spellings, even a stray international friendly mixed into a
// domestic-season page) — too unreliable to parse into real Fixture rows
// without a real risk of silently writing wrong scores. Fixtures/results
// for Kenya Cup stay newsroom-entered via /admin/scores.html; only the
// standings table gets this automated path.
//
// Distinct from syncLeagues.js's `source: 'API'` (football-data.org) —
// this uses `source: 'SCRAPED'` / `externalProvider: 'kenyacup.co.ke'` so
// it's clearly a different (more fragile) kind of automation, and so it's
// never picked up by syncLeagues.js's own `where: { source: 'API' }` loop.

const cheerio = require('cheerio');
const prisma = require('../db');

const STANDINGS_URL = 'https://www.kenyacup.co.ke/standings/';
const USER_AGENT = 'Mozilla/5.0 (compatible; TheSportscastBot/1.0; +https://sportscast-production-c267.up.railway.app)';

async function fetchStandingsHtml() {
  const res = await fetch(STANDINGS_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`kenyacup.co.ke standings -> ${res.status}`);
  return res.text();
}

// The page lists the current season's table first, followed by older
// (stale) seasons further down — the first <table> in the document is
// the current one. A row shape: [name, blank, played, won, drawn, lost,
// pointsFor, pointsAgainst, diff, bonusPoints, totalPoints, blank].
function parseStandings(html) {
  const $ = cheerio.load(html);
  const firstTable = $('table').first();
  const rows = [];

  firstTable.find('tr').each((_, tr) => {
    const cells = $(tr).find('td').map((__, td) => $(td).text().trim()).get();
    if (cells.length < 11) return; // malformed/spacer row — skip rather than guess

    const teamName = cells[0];
    const played = parseInt(cells[2], 10);
    const won = parseInt(cells[3], 10);
    const drawn = parseInt(cells[4], 10);
    const lost = parseInt(cells[5], 10);
    const pointsFor = parseInt(cells[6], 10);
    const pointsAgainst = parseInt(cells[7], 10);
    const totalPoints = parseInt(cells[10], 10);

    if (!teamName || [played, won, drawn, lost, pointsFor, pointsAgainst, totalPoints].some(Number.isNaN)) return;

    rows.push({ teamName, played, won, drawn, lost, pointsFor, pointsAgainst, totalPoints });
  });

  return rows;
}

async function syncKenyaCup() {
  const league = await prisma.league.findFirst({
    where: { name: 'Kenya Cup', sport: { name: 'Rugby' } },
  });
  if (!league) {
    console.warn('[syncKenyaCup] Kenya Cup league not found — skipping.');
    return;
  }

  try {
    const html = await fetchStandingsHtml();
    const rows = parseStandings(html);

    // Sanity check before trusting the parse: the site's own HTML structure
    // could change at any time (it's not a real API with a contract), so
    // cross-check parsed team names against clubs we already know are real
    // Kenya Cup sides rather than blindly writing whatever came out.
    const knownClubs = await prisma.club.findMany({ where: { leagueId: league.id }, select: { name: true } });
    const knownNames = new Set(knownClubs.map((c) => c.name.toLowerCase()));
    const matched = rows.filter((r) => knownNames.has(r.teamName.toLowerCase())).length;

    if (rows.length < 8 || matched < 8) {
      throw new Error(`Parse looks unreliable — ${rows.length} rows parsed, ${matched} matched known clubs (expected >= 8 of each). Site structure may have changed.`);
    }

    const standingRows = rows.map((r, i) => ({
      leagueId: league.id,
      position: i + 1,
      teamName: r.teamName,
      played: r.played,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      goalsFor: r.pointsFor, // rugby "points for/against" mapped onto the schema's generic goalsFor/goalsAgainst
      goalsAgainst: r.pointsAgainst,
      points: r.totalPoints,
    }));

    await prisma.$transaction([
      prisma.standingRow.deleteMany({ where: { leagueId: league.id } }),
      prisma.standingRow.createMany({ data: standingRows }),
    ]);

    await prisma.league.update({
      where: { id: league.id },
      data: { source: 'SCRAPED', externalProvider: 'kenyacup.co.ke', lastSyncedAt: new Date(), syncStatus: 'OK' },
    });
    console.log(`[syncKenyaCup] OK: ${standingRows.length} teams.`);
  } catch (err) {
    console.error('[syncKenyaCup] FAILED —', err.message);
    await prisma.league.update({ where: { id: league.id }, data: { syncStatus: 'ERROR' } }).catch(() => {});
  }
}

module.exports = { syncKenyaCup };

if (require.main === module) {
  syncKenyaCup()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
