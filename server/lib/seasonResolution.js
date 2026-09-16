// Shared by every Fixture/StandingRow write path (the admin routes in
// server/routes/competitions.js and all 4 sync jobs) so "which season does
// this write belong to" is resolved the same way everywhere: the
// competition's current CompetitionSeason, created on first use if one
// doesn't exist yet. See prisma/backfill-competition-seasons.js for why a
// competition that predates this model might not have one yet, and the
// schema comment on CompetitionSeason for why a generic label here (never a
// guessed real year) is the right fallback.
async function getOrCreateCurrentSeason(prisma, competitionId) {
  const existing = await prisma.competitionSeason.findFirst({
    where: { competitionId, isCurrent: true },
  });
  if (existing) return existing;

  return prisma.competitionSeason.create({
    data: { competitionId, label: 'Current Season', isCurrent: true },
  });
}

module.exports = { getOrCreateCurrentSeason };
