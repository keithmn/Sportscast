const express = require('express');
const prisma = require('../db');
const { slugify } = require('../utils/slugify');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const articleInclude = {
  sport: true,
  author: true,
  tags: true,
};

// ---- Public: list published articles ----
router.get('/', async (req, res) => {
  const { sport, tag, featured, videoSeries, contentType, isBrief, limit } = req.query;

  const where = { status: 'PUBLISHED' };
  if (sport) where.sport = { slug: sport };
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
    episodeLabel, runtimeLabel,
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

  res.status(201).json({ article });
});

// ---- Admin: update article ----
router.put('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const existing = await prisma.article.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Article not found' });

  const {
    title, dek, body, coverImageUrl, sportId, authorId, tagIds,
    status, featured, contentType, isBrief, youtubeId, videoSeries,
    episodeLabel, runtimeLabel,
  } = req.body;

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

  res.json({ article });
});

// ---- Admin: delete article ----
router.delete('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.article.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
