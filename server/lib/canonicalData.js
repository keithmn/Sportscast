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

// Competition -> Data Platform Competition link (Wave 2 — closing the
// admin-UI half of "Competition page can reference canonical
// Competition/Season"; the mapping type and fetchCanonicalStandings
// already existed and are untouched by this addition). This is a
// different concern from fetchCanonicalStandings below: that resolves
// the mapping to fetch *standings rows*; this fetches the Competition
// record itself, for an admin picker to show what a competition is
// currently linked to (or isn't).
async function fetchCanonicalCompetition(localCompetitionId) {
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

  const data = await fetchWithTimeout(`${DATA_PLATFORM_BASE}/competitions/${encodeURIComponent(mapping.canonicalId)}`);
  const competition = data?.competition;
  if (!competition) return null;

  return {
    id: competition.id,
    name: competition.name,
    sportName: competition.sport?.name ?? null,
    region: competition.region,
  };
}

// Live-verifies a Data Platform Competition id exists before
// routes/competitions.js is allowed to store a mapping pointing at it —
// same reasoning as verifyCanonicalEvent.
async function verifyCanonicalCompetition(canonicalCompetitionId) {
  const data = await fetchWithTimeout(`${DATA_PLATFORM_BASE}/competitions/${encodeURIComponent(canonicalCompetitionId)}`);
  const competition = data?.competition;
  if (!competition) return null;
  return {
    id: competition.id,
    name: competition.name,
    sportName: competition.sport?.name ?? null,
    region: competition.region,
  };
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
  // GET /seasons has no status filter, so this picks client-side from the
  // full list (already ordered startDate desc): prefer the season
  // actually IN_PROGRESS, else the most recently COMPLETED one (still
  // meaningful — final standings) — never UPCOMING, which by definition
  // has no standings yet. Bug found in the Wave 2 audit: this used to
  // take seasons[0] unconditionally, so a future UPCOMING season with a
  // later startDate than the real current one would silently win and
  // return empty standings, falling back to local data even though a
  // genuinely current canonical season existed.
  const seasons = seasonsData?.seasons;
  const currentSeason = Array.isArray(seasons)
    ? seasons.find((s) => s.status === 'IN_PROGRESS') || seasons.find((s) => s.status === 'COMPLETED')
    : null;
  if (!currentSeason) return null;

  const standingsData = await fetchWithTimeout(
    `${DATA_PLATFORM_BASE}/standings?competitionId=${encodeURIComponent(mapping.canonicalId)}&seasonId=${encodeURIComponent(currentSeason.id)}`
  );
  const rawRows = standingsData?.standings;
  if (!Array.isArray(rawRows) || !rawRows.length) return null;

  // A competition can have both a CALCULATED row (from recorded results)
  // and an OFFICIAL_PUBLISHED / MANUAL one (entered by hand) for the same
  // team+season — Standing's own schema comment says this is deliberate,
  // not a data bug. GET /standings returns all of them; without this,
  // Sportscast would render duplicate rows for the same team. Prefer the
  // most authoritative source per team: a human-entered OFFICIAL_PUBLISHED
  // row, then MANUAL, then the auto-CALCULATED one.
  const VALUE_TYPE_PRIORITY = { OFFICIAL_PUBLISHED: 0, MANUAL: 1, CALCULATED: 2 };
  const bestPerTeam = new Map();
  for (const r of rawRows) {
    if (!r.team) continue; // include: {team: true} should always populate this, but don't trust a row we can't name
    const existing = bestPerTeam.get(r.teamId);
    if (!existing || VALUE_TYPE_PRIORITY[r.valueType] < VALUE_TYPE_PRIORITY[existing.valueType]) {
      bestPerTeam.set(r.teamId, r);
    }
  }

  return [...bestPerTeam.values()]
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

// Article -> Data Platform Event link (gap #17 of the 2026-09 remediation
// audit: "no true data/media integration contract... any Article<->Fixture
// content-graph link... remains genuinely absent"). An Event there is a
// company-level occurrence (tournament, signing, athlete achievement —
// see that repo's Event model comment), not the same thing as a Fixture;
// this is deliberately the broader of the two to link against, since most
// of what Sportscast actually publishes (a signing story, a tournament
// preview) isn't fixture-shaped at all.
//
// Same fail-soft contract as fetchCanonicalStandings: no mapping, a
// network error, or a 404 (the Event was deleted on the other side) all
// return null, never throw. The mapping itself is only ever created after
// a live fetch already succeeded once (see routes/articles.js's link
// endpoint) — there is no path that stores a canonicalId nobody has ever
// confirmed exists.
async function fetchCanonicalEvent(localArticleId) {
  const mapping = await prisma.canonicalMapping.findUnique({
    where: {
      localEntityType_localId_provider: {
        localEntityType: 'ARTICLE',
        localId: localArticleId,
        provider: 'underdawgs-data',
      },
    },
  });
  if (!mapping) return null;

  const data = await fetchWithTimeout(`${DATA_PLATFORM_BASE}/events/${encodeURIComponent(mapping.canonicalId)}`);
  const event = data?.event;
  if (!event) return null;

  return {
    id: event.id,
    title: event.title,
    category: event.category,
    status: event.status,
    competitionName: event.competition?.name ?? null,
    teamName: event.team?.name ?? null,
    athleteName: event.athlete?.fullName ?? null,
  };
}

// Live-verifies a Data Platform Event id actually exists before
// routes/articles.js is allowed to store a CanonicalMapping pointing at
// it — the only way this repo can guarantee it never links to a
// fabricated or mistyped id. Returns the same shape as
// fetchCanonicalEvent (so the caller can show the editor what they're
// about to link to), or null if it doesn't resolve.
async function verifyCanonicalEvent(canonicalEventId) {
  const data = await fetchWithTimeout(`${DATA_PLATFORM_BASE}/events/${encodeURIComponent(canonicalEventId)}`);
  const event = data?.event;
  if (!event) return null;
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    status: event.status,
    competitionName: event.competition?.name ?? null,
    teamName: event.team?.name ?? null,
    athleteName: event.athlete?.fullName ?? null,
  };
}

// Club -> Data Platform Team link (Wave 2, closing "Team/club page can
// reference canonical Team"). The mapping type these rows use
// (localEntityType: 'CLUB', canonicalEntityType: 'Team') already existed —
// server/routes/clubs.js's own populate-kenya-cup script wrote 12 of them —
// but nothing ever read them until now. Same fail-soft contract as
// fetchCanonicalEvent throughout.
async function fetchCanonicalTeam(localClubId) {
  const mapping = await prisma.canonicalMapping.findUnique({
    where: {
      localEntityType_localId_provider: {
        localEntityType: 'CLUB',
        localId: localClubId,
        provider: 'underdawgs-data',
      },
    },
  });
  if (!mapping) return null;

  const data = await fetchWithTimeout(`${DATA_PLATFORM_BASE}/teams/${encodeURIComponent(mapping.canonicalId)}`);
  const team = data?.team;
  if (!team) return null;

  return {
    id: team.id,
    name: team.name,
    clubName: team.club?.name ?? null,
    venueName: team.venue?.name ?? null,
  };
}

// Live-verifies a Data Platform Team id exists before routes/clubs.js is
// allowed to store a mapping pointing at it — same reasoning as
// verifyCanonicalEvent.
async function verifyCanonicalTeam(canonicalTeamId) {
  const data = await fetchWithTimeout(`${DATA_PLATFORM_BASE}/teams/${encodeURIComponent(canonicalTeamId)}`);
  const team = data?.team;
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    clubName: team.club?.name ?? null,
    venueName: team.venue?.name ?? null,
  };
}

// Player -> Data Platform Athlete link (Wave 2, closing "Player page can
// reference canonical Athlete") — a new mapping type, nothing wrote or
// read this before today. Same fail-soft contract throughout.
async function fetchCanonicalAthlete(localPlayerId) {
  const mapping = await prisma.canonicalMapping.findUnique({
    where: {
      localEntityType_localId_provider: {
        localEntityType: 'PLAYER',
        localId: localPlayerId,
        provider: 'underdawgs-data',
      },
    },
  });
  if (!mapping) return null;

  const data = await fetchWithTimeout(`${DATA_PLATFORM_BASE}/athletes/${encodeURIComponent(mapping.canonicalId)}`);
  const athlete = data?.athlete;
  if (!athlete) return null;

  return {
    id: athlete.id,
    fullName: athlete.fullName,
    nationality: athlete.nationality,
    currentTeamName: athlete.currentTeam?.name ?? null,
  };
}

// Live-verifies a Data Platform Athlete id exists before routes/clubs.js
// is allowed to store a mapping pointing at it — same reasoning as
// verifyCanonicalEvent.
async function verifyCanonicalAthlete(canonicalAthleteId) {
  const data = await fetchWithTimeout(`${DATA_PLATFORM_BASE}/athletes/${encodeURIComponent(canonicalAthleteId)}`);
  const athlete = data?.athlete;
  if (!athlete) return null;
  return {
    id: athlete.id,
    fullName: athlete.fullName,
    nationality: athlete.nationality,
    currentTeamName: athlete.currentTeam?.name ?? null,
  };
}

// Wave 2 — powers a real admin picker (server/routes/canonicalSearch.js)
// instead of pasting a raw Data Platform UUID by hand. Same fail-soft
// contract: a network problem or unexpected shape returns an empty list,
// never throws — a picker with no results is a fine degraded state, an
// admin page that crashes because the Data Platform is briefly down
// isn't. `type` is passed straight through to the Data Platform's own
// /v1/search?type= allowlist (athlete/team/competition/venue/event) —
// this file doesn't duplicate that validation, the route calling this
// does, same division of responsibility as everywhere else here.
async function searchCanonical(type, q) {
  const data = await fetchWithTimeout(`${DATA_PLATFORM_BASE}/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`);
  const results = data?.results?.[`${type}s`];
  return Array.isArray(results) ? results : [];
}

module.exports = {
  fetchCanonicalStandings,
  fetchCanonicalEvent,
  verifyCanonicalEvent,
  fetchCanonicalTeam,
  verifyCanonicalTeam,
  fetchCanonicalAthlete,
  verifyCanonicalAthlete,
  fetchCanonicalCompetition,
  verifyCanonicalCompetition,
  searchCanonical,
};
