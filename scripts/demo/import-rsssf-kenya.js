// DEMO-ONLY importer: real Kenyan football results from RSSSF, loaded into
// a local demo database so the newsroom can see what fully-populated
// Kenyan competitions look like on the site. Never run against dev.db or
// production — see assertDemoDatabase() below.
//
// Source: https://rsssf.org/tablesk/kenya2026.html, compiled by Karel
// Stokkermans for the Rec.Sport.Soccer Statistics Foundation. The page's
// own notice: "You are free to copy this document in whole or part
// provided that proper acknowledgement is given to the author." RSSSF was
// chosen over live-score sites deliberately: Milestone Games (SportPesa)
// filed suit in June 2026 against Sofascore, FotMob, LiveScore,
// OneFootball, ESPN and others over unlicensed KPL data use. Publishing
// this data on the live site is a separate decision that needs legal
// advice first (see the Data Platform's docs/ARCHITECTURE.md §2) — this
// script exists only so the shape of real data can be seen locally.
//
// One network request at most: the page is cached under
// scripts/demo/.cache/ and every re-run parses the cached copy.
//
// Usage: DATABASE_URL="file:./demo.db" node scripts/demo/import-rsssf-kenya.js

const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://rsssf.org/tablesk/kenya2026.html';
const CACHE_PATH = path.join(__dirname, '.cache', 'rsssf-kenya2026.html');
const USER_AGENT = 'UnderdawgsDemoResearch/0.1 (+mailto:keithnyahach@gmail.com)';
const SEASON_LABEL = '2025/26';
const ATTRIBUTION = 'RSSSF / Karel Stokkermans (rsssf.org)';

// Results use short names; the table uses full names. Explicit, not
// fuzzy: an unknown name aborts the import rather than being guessed at.
const ALIASES = {
  KCB: 'Kenya Commercial Bank',
  'Muranga SEA': 'Muranga Sports Excellence Academy',
  'Kenya Police': 'Kenya Police FC',
  Shabana: 'Shabana FC',
  Tusker: 'Tusker FC',
  'APS Bomet': 'APS Bomet FC',
  'Mara Sugar': 'Mara Sugar FC',
  Bandari: 'Bandari FC',
};

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function assertDemoDatabase() {
  const url = process.env.DATABASE_URL || '';
  const file = path.basename(url.replace(/^file:/, ''));
  if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run: this is a demo-only importer and the environment looks like production.');
  }
  if (!/^demo[\w-]*\.db$/.test(file)) {
    throw new Error(`Refusing to run: DATABASE_URL must point at a demo*.db file (got "${url || 'unset'}").`);
  }
}

async function loadPage() {
  if (fs.existsSync(CACHE_PATH)) return fs.readFileSync(CACHE_PATH, 'utf8');
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${SOURCE_URL} -> ${res.status}`);
  const html = await res.text();
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, html);
  return html;
}

function htmlToLines(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''));
}

// Slice from a section heading to the first of the given end headings
// after it. RSSSF repeats some headings verbatim in its table of contents
// at the top ("Mozzart Bet Cup 2026"), so the LAST matching line is the
// real section heading, never the first.
function section(lines, startHeading, endHeadings) {
  let start = -1;
  lines.forEach((l, i) => { if (l.trim() === startHeading) start = i; });
  if (start === -1) throw new Error(`Section "${startHeading}" not found — page structure may have changed.`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (endHeadings.includes(lines[i].trim())) { end = i; break; }
  }
  return lines.slice(start + 1, end);
}

const TABLE_ROW = /^\s*(\d+)\.(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)-(\d+)\s+(\d+)(.*)$/;

function parseTable(lines) {
  const rows = [];
  for (const line of lines) {
    const m = line.match(TABLE_ROW);
    if (!m) continue;
    rows.push({
      position: Number(m[1]),
      teamName: m[2].replace(/\s*\([^)]*\)\s*$/, '').trim(),
      played: Number(m[3]), won: Number(m[4]), drawn: Number(m[5]), lost: Number(m[6]),
      goalsFor: Number(m[7]), goalsAgainst: Number(m[8]), points: Number(m[9]),
      note: m[10].trim() || null,
    });
  }
  return rows;
}

// A season running Sep 2025 – Jun 2026: Aug–Dec dates are 2025, Jan–Jul
// are 2026. Only applied to competitions inside that window.
function seasonDate(mon, day) {
  const month = MONTHS[mon];
  if (month === undefined) throw new Error(`Unknown month "${mon}"`);
  const year = month >= 7 ? 2025 : 2026;
  // RSSSF gives dates only, no kickoff time. Midday UTC (15:00 EAT) is a
  // display placeholder, not a claimed kickoff time.
  return new Date(Date.UTC(year, month, Number(day), 12, 0, 0));
}

const DATE_IN_LINE = /\[([A-Z][a-z]{2}) (\d{1,2})(?:,\s*([^\]]+))?\]/;
const RESULT_LINE = /^(.{24})(\d+-\d+|awd|abd) (.+)$/;

function parseResults(lines) {
  const results = [];
  let date = null;
  let round = null;
  for (const raw of lines) {
    const line = raw.replace(/\t/g, ' ');
    const roundMatch = line.match(/^(Round \d+|Quarterfinals|Semifinals|Third Place Match|Final)\b/);
    if (roundMatch) round = roundMatch[1];
    const dm = line.match(DATE_IN_LINE);
    if (dm && !RESULT_LINE.test(line)) { date = seasonDate(dm[1], dm[2]); continue; }

    const rm = line.match(RESULT_LINE);
    if (!rm) continue;
    const home = rm[1].trim();
    let rest = rm[3];
    let note = null;
    const bracket = rest.indexOf('[');
    if (bracket !== -1) { note = rest.slice(bracket).trim(); rest = rest.slice(0, bracket); }
    const away = rest.trim();
    if (!date) throw new Error(`Result before any date: "${line.trim()}"`);

    let homeScore = null;
    let awayScore = null;
    let outcome = 'PLAYED';
    if (rm[2] === 'abd') {
      outcome = 'ABANDONED';
    } else if (rm[2] === 'awd') {
      const aw = (note || '').match(/awarded (\d+)-(\d+)/);
      if (!aw) throw new Error(`Awarded match without an awarded score: "${line.trim()}"`);
      homeScore = Number(aw[1]); awayScore = Number(aw[2]);
      outcome = 'AWARDED';
    } else {
      [homeScore, awayScore] = rm[2].split('-').map(Number);
    }
    results.push({ round, date, home, away, homeScore, awayScore, outcome, note });
  }
  return results;
}

function canonicalName(shortName, tableNames) {
  if (tableNames.has(shortName)) return shortName;
  const aliased = ALIASES[shortName];
  if (aliased && tableNames.has(aliased)) return aliased;
  return null;
}

// Recompute the league table from results (3/1/0) and compare with the
// published one — a parser bug that drops or misreads matches shows up as
// a mismatch here instead of silently becoming wrong demo data.
function crossCheck(table, results) {
  // The site's own table calculation (server/lib/pointsRules.js), so this
  // check can't drift from what the admin "Recalculate" button does.
  const { pointsRuleFor, computeTable } = require('../../server/lib/pointsRules');
  const ours = new Map(computeTable(results, pointsRuleFor('football')).map((r) => [r.teamName, r]));
  const empty = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
  const diffs = [];
  for (const t of table) {
    const c = ours.get(t.teamName) || empty;
    for (const k of ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'points']) {
      if (c[k] !== t[k]) diffs.push(`${t.teamName} ${k}: published ${t[k]}, recomputed ${c[k]}`);
    }
  }
  return diffs;
}

async function replaceSeason(prisma, competitionSlug, externalId, { standings = [], fixtures = [] }) {
  const { resolveClubsForFixture } = require('../../server/lib/clubResolution');
  const competition = await prisma.competition.findUnique({ where: { slug: competitionSlug } });
  if (!competition) throw new Error(`Competition "${competitionSlug}" not found in this database.`);

  // 2025/26 is history once a newer season exists (KPL 2026/27 is entered
  // through admin): only make it the current season if the competition
  // has none, never demote a newer one on a re-run.
  const hasCurrent = await prisma.competitionSeason.findFirst({ where: { competitionId: competition.id, isCurrent: true, label: { not: SEASON_LABEL } } });
  const season = await prisma.competitionSeason.upsert({
    where: { competitionId_label: { competitionId: competition.id, label: SEASON_LABEL } },
    create: { competitionId: competition.id, label: SEASON_LABEL, isCurrent: !hasCurrent },
    update: hasCurrent ? {} : { isCurrent: true },
  });
  if (!hasCurrent) {
    await prisma.competitionSeason.updateMany({ where: { competitionId: competition.id, id: { not: season.id } }, data: { isCurrent: false } });
  }
  await prisma.$transaction([
    prisma.fixture.deleteMany({ where: { seasonId: season.id } }),
    prisma.standingRow.deleteMany({ where: { seasonId: season.id } }),
  ]);
  if (standings.length) {
    await prisma.standingRow.createMany({
      data: standings.map((s) => ({
        competitionId: competition.id, seasonId: season.id, position: s.position, teamName: s.teamName,
        played: s.played, won: s.won, drawn: s.drawn, lost: s.lost,
        goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst, points: s.points,
      })),
    });
  }
  for (const f of fixtures) {
    const { homeClubId, awayClubId } = await resolveClubsForFixture(prisma, competition.id, f.home, f.away);
    await prisma.fixture.create({
      data: {
        competitionId: competition.id, seasonId: season.id, homeTeam: f.home, awayTeam: f.away,
        homeClubId, awayClubId, kickoff: f.date, homeScore: f.homeScore, awayScore: f.awayScore, status: 'FINISHED',
      },
    });
  }
  await prisma.competition.update({
    where: { id: competition.id },
    data: { source: 'SCRAPED', externalProvider: 'rsssf.org', externalId, lastSyncedAt: new Date(), syncStatus: 'OK' },
  });
  return competition;
}

async function main() {
  assertDemoDatabase();
  const prisma = require('../../server/db');
  try {
    const lines = htmlToLines(await loadPage());

    // --- Kenyan Premier League ---
    const kplLines = section(lines, 'Kenya Premier League 2025/26', ['Promotion/Relegation Playoff', 'Mozzart Bet Cup 2026']);
    const finalTableAt = kplLines.findIndex((l, i) => i > 0 && l.trim() === 'Final Table:' && kplLines.slice(0, i).some((x) => /^Round \d+/.test(x)));
    const kplTable = parseTable(kplLines.slice(0, kplLines.findIndex((l) => /^Round 1\b/.test(l))));
    if (kplTable.length !== 18) throw new Error(`Expected 18 KPL table rows, parsed ${kplTable.length}.`);
    const tableNames = new Set(kplTable.map((t) => t.teamName));

    const kplRaw = parseResults(kplLines.slice(0, finalTableAt === -1 ? kplLines.length : finalTableAt));
    const unknown = new Set();
    for (const r of kplRaw) {
      const h = canonicalName(r.home, tableNames); const a = canonicalName(r.away, tableNames);
      if (!h) unknown.add(r.home); if (!a) unknown.add(r.away);
      r.home = h || r.home; r.away = a || r.away;
    }
    if (unknown.size) throw new Error(`Unmapped KPL team names (add to ALIASES only if certain): ${[...unknown].join(', ')}`);

    const abandoned = kplRaw.filter((r) => r.outcome === 'ABANDONED');
    const counted = kplRaw.filter((r) => r.outcome !== 'ABANDONED');
    const pairs = new Map();
    for (const r of counted) {
      const key = `${r.home} v ${r.away}`;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
    const dupes = [...pairs].filter(([, n]) => n > 1).map(([k]) => k);
    if (dupes.length) throw new Error(`Fixture pairs appearing more than once: ${dupes.join('; ')}`);
    const expected = 18 * 17;
    const missing = [];
    for (const h of tableNames) for (const a of tableNames) if (h !== a && !pairs.has(`${h} v ${a}`)) missing.push(`${h} v ${a}`);

    const diffs = crossCheck(kplTable, counted);

    // --- National Super League (table only on this page) ---
    const nslLines = section(lines, 'Kenyan National Super League 2025/26', ['2024/25', 'About this document']);
    const nslTable = parseTable(nslLines);
    if (nslTable.length !== 20) throw new Error(`Expected 20 NSL table rows, parsed ${nslTable.length}.`);

    // --- Mozzart Bet Cup (the FKF Cup's sponsored name) ---
    const cupLines = section(lines, 'Mozzart Bet Cup 2026', ['Super Cup 2026']);
    const cupResults = parseResults(cupLines).filter((r) => r.outcome === 'PLAYED');
    // Same canonical names as the league where the club is a KPL side;
    // lower-tier cup entrants (e.g. Mfalme) keep RSSSF's own name.
    for (const r of cupResults) {
      r.home = canonicalName(r.home, tableNames) || r.home;
      r.away = canonicalName(r.away, tableNames) || r.away;
    }

    console.log('Parsed from', SOURCE_URL, '(cached copy)');
    console.log(`  KPL: ${kplTable.length} table rows, ${counted.length} counted results (expected ${expected}), ${abandoned.length} abandoned, ${kplRaw.filter((r) => r.outcome === 'AWARDED').length} awarded`);
    for (const a of abandoned) console.log(`    abandoned (not counted): ${a.home} v ${a.away} — ${a.note}`);
    if (missing.length) console.log(`    MISSING pairs (${missing.length}): ${missing.join('; ')}`);
    console.log(diffs.length ? `  Cross-check: ${diffs.length} differences vs published table:\n    ${diffs.join('\n    ')}` : '  Cross-check: recomputed table matches the published table exactly.');
    console.log(`  NSL: ${nslTable.length} table rows`);
    console.log(`  Cup: ${cupResults.length} results (penalty shoot-out winners are noted, not stored — Fixture has no penalties field)`);

    if (missing.length || diffs.length) {
      throw new Error('Not importing: the parse does not fully reconcile with the published table (see above).');
    }

    // Clubs for every KPL side, so each team gets a club page in the demo.
    const kpl = await prisma.competition.findUnique({ where: { slug: 'kenyan-premier-league' } });
    const { resolveClubIdForTeamName } = require('../../server/lib/clubResolution');
    const clubs = await prisma.club.findMany({ where: { competitionId: kpl.id }, select: { id: true, name: true } });
    let created = 0;
    for (const t of kplTable) {
      if (resolveClubIdForTeamName(t.teamName, clubs)) continue;
      let slug = require('../../server/utils/slugify').slugify(t.teamName);
      if (await prisma.club.findUnique({ where: { slug } })) slug = `${slug}-kpl`;
      const club = await prisma.club.create({ data: { name: t.teamName, slug, competitionId: kpl.id, source: 'SCRAPED' } });
      clubs.push({ id: club.id, name: club.name });
      created++;
    }

    await replaceSeason(prisma, 'kenyan-premier-league', 'kenya2026-kpl', { standings: kplTable, fixtures: counted });
    await replaceSeason(prisma, 'national-super-league', 'kenya2026-nsl', { standings: nslTable });
    await replaceSeason(prisma, 'fkf-cup', 'kenya2026-cup', { fixtures: cupResults });

    console.log(`Imported into ${process.env.DATABASE_URL}: KPL ${kplTable.length} standings + ${counted.length} fixtures (${created} clubs created), NSL ${nslTable.length} standings, Cup ${cupResults.length} fixtures.`);
    console.log(`Attribution required if ever shown publicly: ${ATTRIBUTION}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[import-rsssf-kenya] FAILED —', err.message);
  process.exitCode = 1;
});
