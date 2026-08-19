// Populates Club/Player rows for leagues flagged League.syncSquads = true,
// sourced from Wikidata (SPARQL) — free, no API key, no rate-limit gate,
// and explicitly public-domain (CC0) data, unlike the commercial providers
// checked first (API-Football's free tier only covers 2022-2024 seasons;
// its terms also explicitly disclaim mass-media/commercial rights).
//
// Doesn't ask Wikidata "which teams are in this league" (its P118 league
// property is historical/all-time, not season-scoped, and messier to
// filter reliably) — the site already has an authoritative current team
// list for API-sourced leagues from the football-data.org standings sync.
// This job only asks Wikidata for each of those teams' current squad.
//
// "Current squad" itself needed real verification, not a guess: a simple
// "no end-date on the team-membership statement" filter pulls in players
// from over a century ago whose entries were just never annotated with an
// end date (confirmed empirically — see NOTES/BLUEPRINT). The reliable
// signal turned out to be the team-membership statement's own "point in
// time" stats qualifier (P585) being recent — that's when someone last
// updated that player's appearance/goal count for this club, which in
// practice only happens for players who are actually still there. This
// trades completeness for correctness: bench/fringe players without a
// recently-updated stats qualifier won't show up, but everyone who does
// show up is genuinely verified current, not a decades-old data artifact.

const prisma = require('../db');
const { slugify } = require('../utils/slugify');

const WIKIDATA_SEARCH = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'SportscastSquadSync/1.0 (theunderdawgs sports media house; contact via site)';
const CALL_DELAY_MS = 2000; // polite pacing — Wikidata has no published quota, but does soft-throttle bursts (confirmed: hit real 429s at 1.5s spacing)
const RECENT_CUTOFF = '2025-06-01T00:00:00Z'; // a stats qualifier older than this doesn't count as "current"

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Wikidata's public endpoints soft-throttle bursts of requests (confirmed:
// a real run hit 429s on 6/20 clubs at 1.5s spacing) rather than publishing
// a hard quota — retrying with backoff handles this far more reliably than
// just spacing calls out further and hoping.
async function fetchWithRetry(url, options, retries = 3, backoffMs = 5000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    if (attempt === retries) return res;
    await sleep(backoffMs * (attempt + 1));
  }
}

async function findClubEntity(teamName) {
  const url = new URL(WIKIDATA_SEARCH);
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('search', teamName);
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikidata search failed (${res.status})`);
  const data = await res.json();
  const hit = (data.search || []).find((s) =>
    (s.description || '').toLowerCase().includes('football club') ||
    (s.description || '').toLowerCase().includes('association football')
  ) || data.search?.[0];
  return hit ? hit.id : null;
}

async function fetchCurrentSquad(clubQid) {
  const query = `
    SELECT ?player ?playerLabel ?positionLabel ?nationalityLabel ?photo ?pointInTime WHERE {
      ?player p:P54 ?statement.
      ?statement ps:P54 wd:${clubQid}.
      ?statement pq:P585 ?pointInTime.
      FILTER(?pointInTime > "${RECENT_CUTOFF}"^^xsd:dateTime)
      OPTIONAL { ?player wdt:P413 ?position. }
      OPTIONAL { ?player wdt:P27 ?nationality. }
      OPTIONAL { ?player wdt:P18 ?photo. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } ORDER BY DESC(?pointInTime)`;

  const url = new URL(WIKIDATA_SPARQL);
  url.searchParams.set('query', query);
  const res = await fetchWithRetry(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikidata SPARQL failed (${res.status})`);
  const data = await res.json();

  const byPlayer = new Map();
  for (const row of data.results.bindings) {
    const playerUri = row.player.value;
    const externalId = playerUri.split('/').pop(); // e.g. "Q7550600"
    if (byPlayer.has(externalId)) continue; // keep only the most-recent row per player (query is ORDER BY DESC)
    byPlayer.set(externalId, {
      externalId,
      name: row.playerLabel?.value || null,
      position: row.positionLabel?.value || null,
      nationality: row.nationalityLabel?.value || null,
      photoUrl: row.photo?.value || null,
    });
  }
  return Array.from(byPlayer.values());
}

async function syncClub(league, teamName) {
  const slug = slugify(`${teamName}-${league.slug}`); // scoped by league so a common name can't collide across leagues
  const existing = await prisma.club.findFirst({ where: { leagueId: league.id, name: teamName } });

  const club = existing
    ? existing
    : await prisma.club.create({ data: { name: teamName, slug, leagueId: league.id, source: 'API' } });

  const qid = await findClubEntity(teamName);
  if (!qid) {
    console.warn(`[syncSquads] No Wikidata entity found for "${teamName}"`);
    return { club, playerCount: 0 };
  }

  await sleep(CALL_DELAY_MS);
  const players = await fetchCurrentSquad(qid);

  await prisma.player.deleteMany({ where: { clubId: club.id } });
  if (players.length) {
    await prisma.player.createMany({
      data: players.filter((p) => p.name).map((p) => ({
        clubId: club.id,
        name: p.name,
        position: p.position,
        nationality: p.nationality,
        photoUrl: p.photoUrl,
        externalId: p.externalId,
      })),
    });
  }

  await prisma.club.update({
    where: { id: club.id },
    data: { externalId: qid, lastSyncedAt: new Date() },
  });

  return { club, playerCount: players.length };
}

async function syncSquads() {
  const leagues = await prisma.league.findMany({ where: { syncSquads: true } });
  if (!leagues.length) {
    console.log('[syncSquads] No leagues flagged for squad sync.');
    return;
  }

  for (const league of leagues) {
    console.log(`[syncSquads] Syncing clubs for ${league.name}...`);
    const standings = await prisma.standingRow.findMany({ where: { leagueId: league.id } });
    const teamNames = Array.from(new Set(standings.map((s) => s.teamName)));
    if (!teamNames.length) {
      console.warn(`[syncSquads] ${league.name} has no standings yet — nothing to derive a team list from.`);
      continue;
    }

    let totalPlayers = 0;
    for (const teamName of teamNames) {
      try {
        const { playerCount } = await syncClub(league, teamName);
        totalPlayers += playerCount;
        console.log(`[syncSquads]   ${teamName}: ${playerCount} current player(s)`);
      } catch (err) {
        console.error(`[syncSquads]   FAILED for ${teamName}:`, err.message);
      }
      await sleep(CALL_DELAY_MS);
    }
    console.log(`[syncSquads] ${league.name}: ${teamNames.length} club(s), ${totalPlayers} player(s) total.`);
  }
  console.log('[syncSquads] Done.');
}

module.exports = { syncSquads };

if (require.main === module) {
  syncSquads()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
