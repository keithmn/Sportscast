// RETROFIT ONLY as of the Wave 0 baseline-audit fix: prisma/seed.js now
// creates the flagship Show + Episode rows itself on every fresh seed, so
// this script is no longer part of the normal setup path. It still exists
// for the one real remaining use case — a database (e.g. the live
// production DB) that was seeded before that fix landed and needs these
// rows backfilled without a full reseed. Safe to re-run — upserts the
// Show, skips any article that already has an Episode.
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
