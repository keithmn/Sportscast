// Wave 4 — flips a SCHEDULED article to PUBLISHED once its scheduledAt
// moment has passed. publishedAt is set to the scheduled moment itself,
// not "now" — a story scheduled for 09:00 that this job picks up at 09:03
// (cron interval, see server/index.js) should still say it went live at
// 09:00, not 09:03.
const prisma = require('../db');

async function publishScheduled() {
  const due = await prisma.article.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
  });
  if (!due.length) return;

  for (const article of due) {
    await prisma.article.update({
      where: { id: article.id },
      data: { status: 'PUBLISHED', publishedAt: article.scheduledAt },
    });
    console.log(`[publishScheduled] Published: ${article.title}`);
  }
}

module.exports = { publishScheduled };

if (require.main === module) {
  publishScheduled()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
