// Durable mirror of public/js/follows.js's localStorage-based Follow
// system — see the Follow model's schema comment. No auth: anonymousId is
// a random per-browser token, not a real account, so there's no session
// to require. Validation here (allow-listed entityType, length caps) is
// the whole line of defense against abuse, matching this codebase's
// existing posture (no rate limiting exists anywhere here yet).

const express = require('express');
const prisma = require('../db');

const router = express.Router();

const ENTITY_TYPES = ['club', 'player', 'competition', 'sport'];
const ANON_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function validId(anonymousId) {
  return typeof anonymousId === 'string' && ANON_ID_RE.test(anonymousId);
}

router.get('/', async (req, res) => {
  const { anonymousId } = req.query;
  if (!validId(anonymousId)) return res.status(400).json({ error: 'A valid anonymousId query param is required' });

  const follows = await prisma.follow.findMany({ where: { anonymousId }, orderBy: { createdAt: 'asc' } });
  res.json({ follows });
});

router.post('/', async (req, res) => {
  const { anonymousId, entityType, entitySlug, name, href } = req.body || {};
  if (!validId(anonymousId)) return res.status(400).json({ error: 'A valid anonymousId is required' });
  if (!ENTITY_TYPES.includes(entityType)) return res.status(400).json({ error: `entityType must be one of: ${ENTITY_TYPES.join(', ')}` });
  if (typeof entitySlug !== 'string' || !entitySlug || entitySlug.length > 200) return res.status(400).json({ error: 'entitySlug is required' });
  if (typeof name !== 'string' || !name || name.length > 200) return res.status(400).json({ error: 'name is required' });
  if (typeof href !== 'string' || !href || href.length > 500) return res.status(400).json({ error: 'href is required' });

  const follow = await prisma.follow.upsert({
    where: { anonymousId_entityType_entitySlug: { anonymousId, entityType, entitySlug } },
    update: { name, href },
    create: { anonymousId, entityType, entitySlug, name, href },
  });
  res.status(201).json({ follow });
});

router.delete('/', async (req, res) => {
  const { anonymousId, entityType, entitySlug } = req.body || {};
  if (!validId(anonymousId) || !ENTITY_TYPES.includes(entityType) || typeof entitySlug !== 'string' || !entitySlug) {
    return res.status(400).json({ error: 'anonymousId, entityType, and entitySlug are required' });
  }
  await prisma.follow.deleteMany({ where: { anonymousId, entityType, entitySlug } });
  res.json({ ok: true });
});

module.exports = router;
