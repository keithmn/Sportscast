const express = require('express');
const prisma = require('../db');
const { slugify } = require('../utils/slugify');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = ['NEW', 'REVIEWED', 'PROMOTED', 'DISMISSED'];

// ---- Admin: list monitored items, newest first, optionally filtered ----
router.get('/', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { status, category } = req.query;
  const where = {};
  if (status) where.status = status;
  if (category) where.source = { category };

  const items = await prisma.monitoredItem.findMany({
    where,
    include: { source: true, promotedArticle: { select: { id: true, slug: true, title: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items });
});

// ---- Admin: change an item's status (REVIEWED / DISMISSED) ----
router.put('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });

  const existing = await prisma.monitoredItem.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  // PROMOTED is only ever set by the /promote action below, which also
  // sets promotedArticleId — never accept it as a bare status write here.
  if (status === 'PROMOTED') return res.status(400).json({ error: 'Use POST /:id/promote to promote an item.' });

  const item = await prisma.monitoredItem.update({
    where: { id: req.params.id },
    data: { status, reviewedByUserId: req.session.user.id },
  });
  res.json({ item });
});

// ---- Admin: promote an item into a real (DRAFT) Article ----
// Same create shape as server/routes/articles.js's POST / — this is the
// one place a MonitoredItem is allowed to turn into public-facing content,
// and only as a DRAFT the editor still has to review/rewrite and publish
// themselves. Nothing here auto-publishes.
router.post('/:id/promote', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { sportId, authorId } = req.body;
  if (!sportId || !authorId) return res.status(400).json({ error: 'sportId and authorId are required to promote an item.' });

  const item = await prisma.monitoredItem.findUnique({ where: { id: req.params.id }, include: { source: true } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (item.status === 'PROMOTED') return res.status(400).json({ error: 'This item has already been promoted.' });

  let slug = slugify(item.title);
  if (await prisma.article.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;

  const dek = (item.aiSummary || item.snippet || item.title).slice(0, 200);
  const body =
    (item.aiSummary || item.snippet || '') +
    `\n\n[Draft only — rewrite before publishing. Source: ${item.source.name}, ${item.externalUrl}]`;

  const article = await prisma.article.create({
    data: {
      title: item.title,
      slug,
      dek,
      body,
      sportId,
      authorId,
      status: 'DRAFT',
      isBrief: true, // these start as fast factual leads — an editor can unset this if it grows into a full feature
      contentType: 'ARTICLE',
      publishedAt: null,
    },
  });

  await prisma.monitoredItem.update({
    where: { id: item.id },
    data: { status: 'PROMOTED', promotedArticleId: article.id, reviewedByUserId: req.session.user.id },
  });

  res.status(201).json({ article });
});

module.exports = router;
