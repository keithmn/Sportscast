const express = require('express');
const prisma = require('../db');
const { slugify } = require('../utils/slugify');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Upserts an Episode row for a VIDEO_POST article, but only when its
// videoSeries names a show that's actually been upgraded to a real Show
// record (currently just "The Sportscast"). Every other videoSeries value
// (the 5 dormant niche shows) is left exactly as it was — legacy fields
// on Article only, no Episode row, nothing to migrate.
async function syncEpisodeForArticle(article, episodeFields) {
  if (article.contentType !== 'VIDEO_POST' || !article.videoSeries) return;
  const show = await prisma.show.findFirst({ where: { name: article.videoSeries } });
  if (!show) return;

  const epNumMatch = (article.episodeLabel || '').match(/(\d+)/);
  const durationMatch = (article.runtimeLabel || '').match(/(\d+)/);
  const data = {
    showId: show.id,
    episodeNumber: episodeFields.episodeNumber ?? (epNumMatch ? parseInt(epNumMatch[1], 10) : null),
    host: episodeFields.host ?? null,
    guest: episodeFields.guest ?? null,
    youtubeId: article.youtubeId || null,
    durationSeconds: durationMatch ? parseInt(durationMatch[1], 10) * 60 : null,
    recordingDate: episodeFields.recordingDate ? new Date(episodeFields.recordingDate) : null,
    transcript: episodeFields.transcript ?? null,
    chapters: episodeFields.chapters ?? null,
  };

  await prisma.episode.upsert({
    where: { articleId: article.id },
    update: data,
    create: { ...data, articleId: article.id },
  });
}

const articleInclude = {
  sport: true,
  author: true,
  tags: true,
  competitions: true,
  clubs: true,
  players: true,
  episode: true,
};

// ---- Public: list published articles ----
router.get('/', async (req, res) => {
  const { sport, competition, club, player, tag, featured, videoSeries, contentType, isBrief, limit } = req.query;

  const where = { status: 'PUBLISHED' };
  if (sport) where.sport = { slug: sport };
  // Scoped to a competition/team's own page (public/js/subnav.js) — a club
  // tag doesn't imply also matching by competition, it's a narrower,
  // independent scope (see the schema comment on Article.clubs). An
  // article can carry several competitions/clubs/players now, so this
  // matches if the requested slug is among ANY of its tags.
  if (competition) where.competitions = { some: { slug: competition } };
  if (club) where.clubs = { some: { slug: club } };
  // Scoped to a player's own profile page (public/js/player.js) — same
  // independent-scope reasoning as clubs/competitions.
  if (player) where.players = { some: { slug: player } };
  if (tag) where.tags = { some: { slug: tag } };
  if (featured) where.featured = featured === 'true';
  if (videoSeries) where.videoSeries = videoSeries;
  if (contentType) where.contentType = contentType;
  if (isBrief) where.isBrief = isBrief === 'true';

  const articles = await prisma.article.findMany({
    where,
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit ? parseInt(limit, 10) : undefined,
  });

  res.json({ articles });
});

// ---- Admin: list all articles (draft + published) ----
router.get('/admin/all', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const articles = await prisma.article.findMany({
    include: articleInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ articles });
});

// ---- Public: single article by slug ----
router.get('/:slug', async (req, res) => {
  const article = await prisma.article.findUnique({
    where: { slug: req.params.slug },
    include: articleInclude,
  });

  if (!article) return res.status(404).json({ error: 'Article not found' });

  if (article.status !== 'PUBLISHED') {
    const user = req.session.user;
    if (!user || !['ADMIN', 'EDITOR'].includes(user.role)) {
      return res.status(404).json({ error: 'Article not found' });
    }
  }

  res.json({ article });
});

// ---- Admin: create article ----
router.post('/', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const {
    title, dek, body, coverImageUrl, sportId, authorId, tagIds,
    status, featured, contentType, isBrief, youtubeId, videoSeries,
    episodeLabel, runtimeLabel, competitionIds, clubIds, playerIds,
    episodeNumber, host, guest, recordingDate, transcript, chapters,
  } = req.body;

  if (!title || !dek || !body || !sportId || !authorId) {
    return res.status(400).json({ error: 'title, dek, body, sportId, and authorId are required' });
  }

  let slug = slugify(title);
  const existing = await prisma.article.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  const publishedStatus = status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';

  const article = await prisma.article.create({
    data: {
      title,
      slug,
      dek,
      body,
      coverImageUrl: coverImageUrl || null,
      sportId,
      authorId,
      tags: tagIds && tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
      status: publishedStatus,
      featured: !!featured,
      contentType: contentType === 'VIDEO_POST' ? 'VIDEO_POST' : 'ARTICLE',
      isBrief: !!isBrief,
      youtubeId: youtubeId || null,
      videoSeries: videoSeries || null,
      episodeLabel: episodeLabel || null,
      runtimeLabel: runtimeLabel || null,
      competitions: competitionIds && competitionIds.length ? { connect: competitionIds.map((id) => ({ id })) } : undefined,
      clubs: clubIds && clubIds.length ? { connect: clubIds.map((id) => ({ id })) } : undefined,
      players: playerIds && playerIds.length ? { connect: playerIds.map((id) => ({ id })) } : undefined,
      publishedAt: publishedStatus === 'PUBLISHED' ? new Date() : null,
    },
    include: articleInclude,
  });

  if (article.featured) {
    await prisma.article.updateMany({
      where: { id: { not: article.id }, featured: true },
      data: { featured: false },
    });
  }

  await syncEpisodeForArticle(article, { episodeNumber, host, guest, recordingDate, transcript, chapters });
  const freshArticle = await prisma.article.findUnique({ where: { id: article.id }, include: articleInclude });

  res.status(201).json({ article: freshArticle });
});

// ---- Admin: update article ----
router.put('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const existing = await prisma.article.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Article not found' });

  const {
    title, dek, body, coverImageUrl, sportId, authorId, tagIds,
    status, featured, contentType, isBrief, youtubeId, videoSeries,
    episodeLabel, runtimeLabel, competitionIds, clubIds, playerIds,
    episodeNumber, host, guest, recordingDate, transcript, chapters,
  } = req.body;

  const existingEpisode = await prisma.episode.findUnique({ where: { articleId: existing.id } });

  const wasPublished = existing.status === 'PUBLISHED';
  const willBePublished = status === 'PUBLISHED';

  const article = await prisma.article.update({
    where: { id: req.params.id },
    data: {
      title: title ?? existing.title,
      dek: dek ?? existing.dek,
      body: body ?? existing.body,
      coverImageUrl: coverImageUrl ?? existing.coverImageUrl,
      sportId: sportId ?? existing.sportId,
      authorId: authorId ?? existing.authorId,
      tags: tagIds ? { set: tagIds.map((id) => ({ id })) } : undefined,
      status: status ?? existing.status,
      featured: featured !== undefined ? !!featured : existing.featured,
      contentType: contentType ?? existing.contentType,
      isBrief: isBrief !== undefined ? !!isBrief : existing.isBrief,
      youtubeId: youtubeId !== undefined ? youtubeId : existing.youtubeId,
      videoSeries: videoSeries !== undefined ? videoSeries : existing.videoSeries,
      episodeLabel: episodeLabel !== undefined ? episodeLabel : existing.episodeLabel,
      runtimeLabel: runtimeLabel !== undefined ? runtimeLabel : existing.runtimeLabel,
      competitions: competitionIds ? { set: competitionIds.map((id) => ({ id })) } : undefined,
      clubs: clubIds ? { set: clubIds.map((id) => ({ id })) } : undefined,
      players: playerIds ? { set: playerIds.map((id) => ({ id })) } : undefined,
      publishedAt: !wasPublished && willBePublished ? new Date() : existing.publishedAt,
    },
    include: articleInclude,
  });

  if (article.featured) {
    await prisma.article.updateMany({
      where: { id: { not: article.id }, featured: true },
      data: { featured: false },
    });
  }

  await syncEpisodeForArticle(article, {
    episodeNumber: episodeNumber !== undefined ? episodeNumber : existingEpisode?.episodeNumber,
    host: host !== undefined ? host : existingEpisode?.host,
    guest: guest !== undefined ? guest : existingEpisode?.guest,
    recordingDate: recordingDate !== undefined ? recordingDate : existingEpisode?.recordingDate,
    transcript: transcript !== undefined ? transcript : existingEpisode?.transcript,
    chapters: chapters !== undefined ? chapters : existingEpisode?.chapters,
  });
  const freshArticle = await prisma.article.findUnique({ where: { id: article.id }, include: articleInclude });

  res.json({ article: freshArticle });
});

// ---- Admin: delete article ----
router.delete('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.article.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
