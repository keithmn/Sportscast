// Fixture.homeTeam/awayTeam -> Club resolver.
//
// One club, one identity (2026-10-19): a team name matches a club by the
// club's own name OR any of its aliases (ClubAlias — "KCB" for Kenya
// Commercial Bank, "3K FC" for 3K). Within the fixture's competition
// first; for a Kenyan competition with no match there (a cup or
// continental game), the same sport's other Kenyan competitions, so a
// Tusker FKF Cup game links to the Tusker club page. Fails closed: a name
// that matches two clubs links to neither (BLUEPRINT.md §36).

function normalizeTeamName(name) {
  return (name || '').toLowerCase().replace(/\b(fc|afc)\b/g, '').replace(/\s+/g, ' ').trim();
}

// Matching key for aliases: case, punctuation, spaces and "FC"-style
// suffixes don't count ("Murang'a Seal" = "muranga seal" = "MURANGA SEAL FC").
function aliasKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[’'`.]/g, '')
    .replace(/\b(fc|afc|sc|rfc|bc|hc|f c)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

// clubs: [{ id, name, aliasKeys?: string[] }], already scoped by the caller.
function resolveClubIdForTeamName(teamName, clubs) {
  const norm = normalizeTeamName(teamName);
  const key = aliasKey(teamName);
  if (!norm || !clubs.length) return null;

  const byAlias = clubs.filter((c) => aliasKey(c.name) === key || (c.aliasKeys || []).includes(key));
  if (byAlias.length === 1) return byAlias[0].id;
  if (byAlias.length > 1) return null;

  const exact = clubs.filter((c) => normalizeTeamName(c.name) === norm);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null; // duplicate club names — ambiguous, don't guess

  const contained = clubs.filter((c) => {
    const cn = normalizeTeamName(c.name);
    return !!cn && (norm.includes(cn) || cn.includes(norm));
  });
  return contained.length === 1 ? contained[0].id : null;
}

const CLUB_SELECT = { id: true, name: true, aliases: { select: { key: true } } };
const withKeys = (clubs) => clubs.map((c) => ({ id: c.id, name: c.name, aliasKeys: c.aliases.map((a) => a.key) }));

// The clubs a competition's fixtures can link to: its own, then (Kenyan
// competitions only) the rest of that sport's Kenyan clubs.
async function clubPools(prisma, competitionId) {
  const competition = await prisma.competition.findUnique({ where: { id: competitionId }, select: { region: true, sportId: true } });
  const own = withKeys(await prisma.club.findMany({ where: { competitionId }, select: CLUB_SELECT }));
  if (!competition || competition.region !== 'KENYA') return { own, wider: [] };
  const wider = withKeys(await prisma.club.findMany({
    where: { competitionId: { not: competitionId }, competition: { region: 'KENYA', sportId: competition.sportId } },
    select: CLUB_SELECT,
  }));
  return { own, wider };
}

function resolveInPools(teamName, { own, wider }) {
  return resolveClubIdForTeamName(teamName, own) || (wider.length ? resolveClubIdForTeamName(teamName, wider) : null);
}

async function resolveClubsForFixture(prisma, competitionId, homeTeam, awayTeam) {
  const pools = await clubPools(prisma, competitionId);
  return {
    homeClubId: resolveInPools(homeTeam, pools),
    awayClubId: resolveInPools(awayTeam, pools),
  };
}

// Re-links every Kenyan fixture side that has no club yet — run after an
// alias is added, a club renamed, merged or created. Returns how many
// sides were linked.
async function relinkUnlinkedFixtures(prisma) {
  const fixtures = await prisma.fixture.findMany({
    where: { competition: { region: 'KENYA' }, OR: [{ homeClubId: null }, { awayClubId: null }] },
    select: { id: true, competitionId: true, homeTeam: true, awayTeam: true, homeClubId: true, awayClubId: true },
  });
  const poolCache = new Map();
  let linked = 0;
  for (const f of fixtures) {
    if (!poolCache.has(f.competitionId)) poolCache.set(f.competitionId, await clubPools(prisma, f.competitionId));
    const pools = poolCache.get(f.competitionId);
    const data = {};
    if (!f.homeClubId) { const id = resolveInPools(f.homeTeam, pools); if (id) data.homeClubId = id; }
    if (!f.awayClubId && f.awayTeam) { const id = resolveInPools(f.awayTeam, pools); if (id) data.awayClubId = id; }
    if (Object.keys(data).length) {
      await prisma.fixture.update({ where: { id: f.id }, data });
      linked += Object.keys(data).length;
    }
  }
  return linked;
}

module.exports = { normalizeTeamName, aliasKey, resolveClubIdForTeamName, resolveClubsForFixture, relinkUnlinkedFixtures };
