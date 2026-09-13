// One-off backfill: creates the single flagship Show row and links each
// existing "The Sportscast" VIDEO_POST article to a new Episode row. Safe
// to re-run — upserts the Show, skips any article that already has an
// Episode. Run against local dev.db (`node prisma/backfill-show-episodes.js`)
// and, separately, against production after that deploy goes out — the two
// are different databases, per this project's established practice (see
// BLUEPRINT.md's deploy-mechanics note).
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const show = await prisma.show.upsert({
    where: { slug: 'the-sportscast' },
    update: {},
    create: {
      slug: 'the-sportscast',
      name: 'The Sportscast',
      tagline: 'The flagship conversation.',
      description:
        '45–60 minute sit-downs with the people shaping Kenyan sport — athletes, administrators, and the figures driving change across the continent. Rare, deep, and the reason the rest of this house is credible.',
      color: '#fbbc1e',
      coverImageUrl: '/images/shows/the-sportscast.jpg',
      sportLabel: 'All Sports',
    },
  });
  console.log('Show ready:', show.slug, show.id);

  const episodeArticles = await prisma.article.findMany({
    where: { contentType: 'VIDEO_POST', videoSeries: 'The Sportscast' },
  });
  console.log(`Found ${episodeArticles.length} flagship VIDEO_POST articles`);

  let created = 0;
  for (const a of episodeArticles) {
    const already = await prisma.episode.findUnique({ where: { articleId: a.id } });
    if (already) continue;

    const epNumMatch = (a.episodeLabel || '').match(/(\d+)/);
    const durationMatch = (a.runtimeLabel || '').match(/(\d+)/);

    await prisma.episode.create({
      data: {
        showId: show.id,
        articleId: a.id,
        episodeNumber: epNumMatch ? parseInt(epNumMatch[1], 10) : null,
        youtubeId: a.youtubeId || null,
        durationSeconds: durationMatch ? parseInt(durationMatch[1], 10) * 60 : null,
        recordingDate: a.publishedAt || null,
      },
    });
    created += 1;
  }
  console.log(`Created ${created} new Episode rows (${episodeArticles.length - created} already existed)`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
