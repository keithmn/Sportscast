// Server-to-server bridge to the separate Underdawgs Sports Data platform
// (a different repo/database — see BLUEPRINT.md §25/26 and the "Current
// State & Target Architecture" audit artifact). Deliberately NOT called
// from the browser: keeps this API key-free/CORS-free, and puts the
// "prefer canonical, fall back to local" decision on the server, where a
// failure can be swallowed cleanly instead of surfacing as a broken fetch
// on a visitor's page.
//
// Every function here fails soft: any problem (network error, timeout,
// unexpected shape, no mapping row) returns null, never throws — callers
// always have their own local data to fall back to, and a canonical-source
// outage should never be able to break a page that worked yesterday.

const prisma = require('../db');

const DATA_PLATFORM_BASE = process.env.DATA_PLATFORM_API_URL || 'https://api-production-cb69.up.railway.app/v1';
const FETCH_TIMEOUT_MS = 3000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[canonicalData] fetch failed for ${url}:`, err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Returns this competition's standings in Sportscast's own StandingRow
// shape (position/teamName/played/won/drawn/lost/goalsFor/goalsAgainst/
// points) if — and only if — a CanonicalMapping exists for it AND the
// Data Platform responds successfully. Returns null otherwise, meaning
// "use local data" to every caller.
async function fetchCanonicalStandings(localCompetitionId) {
  const mapping = await prisma.canonicalMapping.findUnique({
    where: {
      localEntityType_localId_provider: {
        localEntityType: 'COMPETITION',
        localId: localCompetitionId,
        provider: 'underdawgs-data',
      },
    },
  });
  if (!mapping) return null;

  const seasonsData = await fetchWithTimeout(`${DATA_PLATFORM_BASE}/seasons?competitionId=${encodeURIComponent(mapping.canonicalId)}`);
  const currentSeason = seasonsData?.seasons?.[0];
  if (!currentSeason) return null;

  const standingsData = await fetchWithTimeout(
    `${DATA_PLATFORM_BASE}/standings?competitionId=${encodeURIComponent(mapping.canonicalId)}&seasonId=${encodeURIComponent(currentSeason.id)}`
  );
  const rows = standingsData?.standings;
  if (!Array.isArray(rows) || !rows.length) return null;

  return rows
    .filter((r) => r.team) // include: {team: true} should always populate this, but don't trust a row we can't name
    .sort((a, b) => a.position - b.position)
    .map((r) => ({
      position: r.position,
      teamName: r.team.name,
      played: r.played,
      won: r.wins,
      drawn: r.draws,
      lost: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      points: r.points,
    }));
}

module.exports = { fetchCanonicalStandings };
