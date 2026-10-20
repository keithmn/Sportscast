// Season handover (2026-10-19). A season planned with a start date (Admin
// → Competitions → Season) becomes the competition's current season on
// that date — so the Kenya Cup's new season, say, starts on time without
// anyone remembering to press a button, and the public page keeps showing
// the season being played until then. Runs nightly; also by hand:
// node server/jobs/rolloverSeasons.js

const prisma = require('../db');

async function rolloverSeasons(now = new Date()) {
  const due = await prisma.competitionSeason.findMany({
    where: { isCurrent: false, startsOn: { lte: now } },
    include: { competition: { select: { id: true, name: true } } },
    orderBy: { startsOn: 'asc' },
  });
  const switched = [];
  for (const season of due) {
    // Only move forward: skip a planned season older than the current one.
    const current = await prisma.competitionSeason.findFirst({ where: { competitionId: season.competitionId, isCurrent: true } });
    if (current && current.startsOn && current.startsOn >= season.startsOn) continue;
    await prisma.$transaction([
      prisma.competitionSeason.updateMany({ where: { competitionId: season.competitionId, isCurrent: true }, data: { isCurrent: false } }),
      prisma.competitionSeason.update({ where: { id: season.id }, data: { isCurrent: true } }),
      prisma.changeLog.create({ data: { entityType: 'COMPETITION', entityId: season.competitionId, action: 'UPDATE', summary: `Season "${season.label}" started (planned start date)`, userName: 'Season handover' } }),
    ]);
    switched.push(`${season.competition.name} → ${season.label}`);
  }
  return switched.length ? `started: ${switched.join(', ')}` : 'no seasons due';
}

module.exports = { rolloverSeasons };

if (require.main === module) {
  rolloverSeasons().then((d) => { console.log(`[rolloverSeasons] ${d}`); return prisma.$disconnect(); });
}
