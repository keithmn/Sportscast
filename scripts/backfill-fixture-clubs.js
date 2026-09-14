// One-time backfill: resolve homeClubId/awayClubId for every existing
// Fixture row using server/lib/clubResolution.js, the same logic the sync
// jobs and admin routes now apply on every write going forward. This just
// catches rows written before 2026-09-14 (BLUEPRINT.md §36).
//
// Dry-run by default — prints a per-competition report (resolved vs. left
// null) without writing anything. Pass --apply to actually write.
//
// Only ever sets a Club FK on an unambiguous match; nothing here can
// misattribute a real fixture, since resolveClubIdForTeamName() already
// returns null on any ambiguity (server/lib/clubResolution.js).

const prisma = require('../server/db');
const { resolveClubIdForTeamName } = require('../server/lib/clubResolution');

const APPLY = process.argv.includes('--apply');

async function main() {
  const competitions = await prisma.competition.findMany({ select: { id: true, name: true } });

  let totalFixtures = 0;
  let totalResolvedHome = 0;
  let totalResolvedAway = 0;
  let totalWrites = 0;

  for (const competition of competitions) {
    const clubs = await prisma.club.findMany({ where: { competitionId: competition.id }, select: { id: true, name: true } });
    if (!clubs.length) continue; // nothing to resolve against — skip without printing noise

    const fixtures = await prisma.fixture.findMany({
      where: { competitionId: competition.id },
      select: { id: true, homeTeam: true, awayTeam: true, homeClubId: true, awayClubId: true },
    });
    if (!fixtures.length) continue;

    let resolvedHome = 0;
    let resolvedAway = 0;
    let writes = 0;

    for (const f of fixtures) {
      const homeClubId = resolveClubIdForTeamName(f.homeTeam, clubs);
      const awayClubId = resolveClubIdForTeamName(f.awayTeam, clubs);
      if (homeClubId) resolvedHome += 1;
      if (awayClubId) resolvedAway += 1;

      const changed = homeClubId !== f.homeClubId || awayClubId !== f.awayClubId;
      if (changed) {
        writes += 1;
        if (APPLY) {
          await prisma.fixture.update({ where: { id: f.id }, data: { homeClubId, awayClubId } });
        }
      }
    }

    console.log(
      `[${competition.name}] ${fixtures.length} fixtures, ${clubs.length} clubs — ` +
        `home resolved ${resolvedHome}/${fixtures.length}, away resolved ${resolvedAway}/${fixtures.length}, ` +
        `${writes} row(s) ${APPLY ? 'updated' : 'would update'}`
    );

    totalFixtures += fixtures.length;
    totalResolvedHome += resolvedHome;
    totalResolvedAway += resolvedAway;
    totalWrites += writes;
  }

  console.log('---');
  console.log(
    `TOTAL: ${totalFixtures} fixtures scanned across competitions with a Club roster, ` +
      `${totalResolvedHome} home / ${totalResolvedAway} away resolved, ${totalWrites} row(s) ${APPLY ? 'updated' : 'would update'}.`
  );
  if (!APPLY) console.log('Dry run — re-run with --apply to write these.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
