// Best-effort Fixture.homeTeam/awayTeam -> Club FK resolver, scoped to one
// competition (Club rows never span competitions, same as Fixture). Ports
// public/js/subnav.js's fuzzyTeamMatch/normalizeTeamName, but hardened for
// server-side write use: a containment match ("Arsenal" inside "Arsenal
// FC") is only trusted when it names exactly one Club in the competition.
// Two clubs both containing/contained-by the name (e.g. "Arsenal" and
// "Arsenal B") resolves to null rather than guessing wrong — see
// BLUEPRINT.md §36 for why this has to fail closed, not open.

function normalizeTeamName(name) {
  return (name || '').toLowerCase().replace(/\b(fc|afc)\b/g, '').replace(/\s+/g, ' ').trim();
}

// clubs: array of { id, name } already scoped to the fixture's competition
// (callers fetch this once per competition/sync run, not once per fixture).
function resolveClubIdForTeamName(teamName, clubs) {
  const norm = normalizeTeamName(teamName);
  if (!norm || !clubs.length) return null;

  const exact = clubs.filter((c) => normalizeTeamName(c.name) === norm);
  if (exact.length === 1) return exact[0].id;
  if (exact.length > 1) return null; // duplicate club names in one competition — ambiguous, don't guess

  const contained = clubs.filter((c) => {
    const cn = normalizeTeamName(c.name);
    return !!cn && (norm.includes(cn) || cn.includes(norm));
  });
  return contained.length === 1 ? contained[0].id : null;
}

// Convenience for the admin routes (one fixture at a time): fetches the
// competition's clubs fresh each call. Sync jobs should call
// resolveClubIdForTeamName directly with a preloaded clubs list instead —
// they process hundreds of fixtures per competition per run and a fresh
// query per fixture would be wasteful.
async function resolveClubsForFixture(prisma, competitionId, homeTeam, awayTeam) {
  const clubs = await prisma.club.findMany({
    where: { competitionId },
    select: { id: true, name: true },
  });
  return {
    homeClubId: resolveClubIdForTeamName(homeTeam, clubs),
    awayClubId: resolveClubIdForTeamName(awayTeam, clubs),
  };
}

module.exports = { normalizeTeamName, resolveClubIdForTeamName, resolveClubsForFixture };
