// Wave 7 — generalizes the one hardcoded push pathway (fixture result →
// followers, competitions.js) into a reusable "an entity was published →
// notify interested followers" mechanism, matching the directive's §36
// notification-event model (STORY_PUBLISHED/EPISODE_PUBLISHED are named
// there) without inventing a new stored event log of our own — Follow's
// existing entityType set (sport/club/competition/player) already defines
// what's actually followable, and sendPushToFollowers (./push.js) is
// already a generic sink that takes arbitrary {entityType, entitySlug}
// targets. This module is the missing middle layer: derive those targets
// from a domain entity's own relations, one function per publishable
// entity, so call sites stay a single line.
//
// Fire-and-forget, same discipline as push.js itself and logChange
// elsewhere in this codebase — a notification failure must never affect
// the write it's describing. Every function here swallows its own errors.

const prisma = require('../db');
const { sendPushToFollowers } = require('./push');

// Episode has no status of its own — per prisma/schema.prisma, an
// Episode is always 1:1 with the Article that carries it (articleId,
// syncEpisodeForArticle), and goes live exactly when that Article does.
// So "an episode was published" and "an article was published" are the
// same real moment; this just picks a more specific notification title
// when the published Article happens to carry an Episode.
async function notifyArticlePublished(articleId) {
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { sport: true, competitions: true, clubs: true, players: true, episode: { select: { id: true } } },
    });
    if (!article) return;

    const targets = [
      ...(article.sport ? [{ entityType: 'sport', entitySlug: article.sport.slug }] : []),
      ...article.competitions.map((c) => ({ entityType: 'competition', entitySlug: c.slug })),
      ...article.clubs.map((c) => ({ entityType: 'club', entitySlug: c.slug })),
      ...article.players.map((p) => ({ entityType: 'player', entitySlug: p.slug })),
    ];
    if (!targets.length) return;

    const isEpisode = Boolean(article.episode);
    await sendPushToFollowers(targets, {
      title: isEpisode ? `New episode: ${article.title}` : `New story: ${article.title}`,
      body: article.dek,
      url: `/article.html?slug=${article.slug}`,
    });
  } catch (err) {
    console.error('[events] notifyArticlePublished failed:', err.message);
  }
}

module.exports = { notifyArticlePublished };
