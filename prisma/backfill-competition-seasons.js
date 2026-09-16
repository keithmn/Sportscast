// One-off, safe to re-run: creates one current CompetitionSeason per
// competition that doesn't already have one, and assigns it to every
// existing Fixture/StandingRow row that's still unassigned (seasonId
// null). Needed because the CompetitionSeason model (see
// prisma/migrations/20260916061757_add_competition_season) added seasonId
// as nullable — the safe migration path on SQLite — rather than backfilling
// inline as part of the migration itself, so every pre-existing row starts
// out null until this runs.
//
// Deliberately generic labels ("Current Season"), never a guessed year —
// this repo never fabricates production data, and a wrong guessed season
// label would misrepresent a real competition's real season.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const competitions = await prisma.competition.findMany({ select: { id: true, name: true } });
  console.log(`Found ${competitions.length} competition(s)`);

  let seasonsCreated = 0;
  let fixturesAssigned = 0;
  let standingsAssigned = 0;

  for (const competition of competitions) {
    let season = await prisma.competitionSeason.findFirst({
      where: { competitionId: competition.id, isCurrent: true },
    });

    if (!season) {
      season = await prisma.competitionSeason.create({
        data: { competitionId: competition.id, label: 'Current Season', isCurrent: true },
      });
      seasonsCreated += 1;
      console.log(`  Created current season for "${competition.name}"`);
    }

    const fixtureResult = await prisma.fixture.updateMany({
      where: { competitionId: competition.id, seasonId: null },
      data: { seasonId: season.id },
    });
    fixturesAssigned += fixtureResult.count;

    const standingResult = await prisma.standingRow.updateMany({
      where: { competitionId: competition.id, seasonId: null },
      data: { seasonId: season.id },
    });
    standingsAssigned += standingResult.count;
  }

  console.log(`Done. Created ${seasonsCreated} season(s), assigned ${fixturesAssigned} fixture(s) and ${standingsAssigned} standing row(s).`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
