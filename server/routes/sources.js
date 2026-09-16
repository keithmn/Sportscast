const express = require('express');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');
const { assertPublicUrl } = require('../lib/assertPublicUrl');

const router = express.Router();

const VALID_CATEGORIES = ['NEWS', 'GOVERNMENT', 'CLUB', 'STADIUM_PROJECT', 'CAF', 'SOCIAL'];
const VALID_FETCH_METHODS = ['RSS', 'HTML_LIST', 'YOUTUBE_CHANNEL', 'MANUAL'];

// ---- Admin: list the Source registry ----
router.get('/', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const sources = await prisma.source.findMany({ orderBy: { name: 'asc' } });
  res.json({ sources });
});

// ---- Admin: create a source ----
router.post('/', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, category, fetchMethod, url, listItemSelector, titleSelector, linkSelector, dateSelector, fetchIntervalCron } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
  if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
  if (!VALID_FETCH_METHODS.includes(fetchMethod)) return res.status(400).json({ error: `fetchMethod must be one of: ${VALID_FETCH_METHODS.join(', ')}` });
  if (fetchMethod === 'HTML_LIST' && (!listItemSelector || !titleSelector || !linkSelector)) {
    return res.status(400).json({ error: 'HTML_LIST sources need listItemSelector, titleSelector, and linkSelector' });
  }
  // Wave 1 security audit: catch a Source pointed at a private/internal
  // address at creation time, not just on the next cron run (see
  // server/lib/assertPublicUrl.js and runMonitoringFetch.js — this is
  // belt-and-braces immediate feedback, the fetch-time check is the real
  // enforcement point). Only RSS/HTML_LIST actually fetch `url` as a URL —
  // YOUTUBE_CHANNEL stores a channel ID there, MANUAL never fetches it.
  if (fetchMethod === 'RSS' || fetchMethod === 'HTML_LIST') {
    try {
      await assertPublicUrl(url);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  const source = await prisma.source.create({
    data: {
      name,
      category,
      fetchMethod,
      url,
      listItemSelector: listItemSelector || null,
      titleSelector: titleSelector || null,
      linkSelector: linkSelector || null,
      dateSelector: dateSelector || null,
      fetchIntervalCron: fetchIntervalCron || null,
    },
  });
  res.status(201).json({ source });
});

// ---- Admin: update a source ----
router.put('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const existing = await prisma.source.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Source not found' });

  const { name, category, fetchMethod, url, listItemSelector, titleSelector, linkSelector, dateSelector, fetchIntervalCron, isActive } = req.body;
  if (category !== undefined && !VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
  if (fetchMethod !== undefined && !VALID_FETCH_METHODS.includes(fetchMethod)) return res.status(400).json({ error: `fetchMethod must be one of: ${VALID_FETCH_METHODS.join(', ')}` });

  // Re-validate whenever the request touches either field — not just
  // when `url` itself changes, since flipping fetchMethod to RSS/
  // HTML_LIST against an existing (previously unvalidated, e.g. a
  // YOUTUBE_CHANNEL id) url needs the same check.
  const effectiveFetchMethod = fetchMethod ?? existing.fetchMethod;
  const effectiveUrl = url ?? existing.url;
  if (
    (effectiveFetchMethod === 'RSS' || effectiveFetchMethod === 'HTML_LIST') &&
    (url !== undefined || fetchMethod !== undefined)
  ) {
    try {
      await assertPublicUrl(effectiveUrl);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  const source = await prisma.source.update({
    where: { id: req.params.id },
    data: {
      name: name ?? existing.name,
      category: category ?? existing.category,
      fetchMethod: fetchMethod ?? existing.fetchMethod,
      url: url ?? existing.url,
      listItemSelector: listItemSelector !== undefined ? (listItemSelector || null) : existing.listItemSelector,
      titleSelector: titleSelector !== undefined ? (titleSelector || null) : existing.titleSelector,
      linkSelector: linkSelector !== undefined ? (linkSelector || null) : existing.linkSelector,
      dateSelector: dateSelector !== undefined ? (dateSelector || null) : existing.dateSelector,
      fetchIntervalCron: fetchIntervalCron !== undefined ? (fetchIntervalCron || null) : existing.fetchIntervalCron,
      isActive: isActive !== undefined ? !!isActive : existing.isActive,
    },
  });
  res.json({ source });
});

// ---- Admin: delete a source (and its staged items) ----
router.delete('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.monitoredItem.deleteMany({ where: { sourceId: req.params.id } });
  await prisma.source.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ---- Admin: add an item directly to a MANUAL source (an editor pastes a
// link — a social post, whatever — rather than this being auto-fetched) ----
router.post('/:id/items', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { externalUrl, title, snippet } = req.body;
  if (!externalUrl || !title) return res.status(400).json({ error: 'externalUrl and title are required' });

  const source = await prisma.source.findUnique({ where: { id: req.params.id } });
  if (!source) return res.status(404).json({ error: 'Source not found' });
  if (source.fetchMethod !== 'MANUAL') return res.status(400).json({ error: 'Items can only be added directly to a MANUAL source.' });

  const item = await prisma.monitoredItem.upsert({
    where: { sourceId_externalUrl: { sourceId: source.id, externalUrl } },
    create: { sourceId: source.id, externalUrl, title, snippet: snippet || null },
    update: {},
  });
  res.status(201).json({ item });
});

module.exports = router;
