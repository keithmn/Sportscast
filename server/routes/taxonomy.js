const express = require('express');
const prisma = require('../db');
const { slugify } = require('../utils/slugify');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// ---- Sports ----
router.get('/sports', async (req, res) => {
  const sports = await prisma.sport.findMany({ orderBy: { name: 'asc' } });
  res.json({ sports });
});

router.post('/sports', requireRole('ADMIN', 'EDITOR', 'STEWARD'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const sport = await prisma.sport.create({ data: { name, slug: slugify(name) } });
  res.status(201).json({ sport });
});

// Gates /sports.html and the per-sport hub — flipped on one sport at a
// time as real local data lands for it, not tied to article counts.
router.put('/sports/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { isActive } = req.body;
  const sport = await prisma.sport.update({
    where: { id: req.params.id },
    data: { isActive: !!isActive },
  });
  res.json({ sport });
});

// ---- Tags ----
router.get('/tags', async (req, res) => {
  const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
  res.json({ tags });
});

router.post('/tags', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const tag = await prisma.tag.create({ data: { name, slug: slugify(name) } });
  res.status(201).json({ tag });
});

// ---- Authors ----
router.get('/authors', async (req, res) => {
  const authors = await prisma.author.findMany({ orderBy: { name: 'asc' } });
  res.json({ authors });
});

router.get('/authors/:slug', async (req, res) => {
  const author = await prisma.author.findUnique({
    where: { slug: req.params.slug },
    include: {
      articles: {
        where: { status: 'PUBLISHED' },
        include: { sport: true, tags: true },
        orderBy: { publishedAt: 'desc' },
      },
    },
  });
  if (!author) return res.status(404).json({ error: 'Author not found' });
  res.json({ author });
});

router.post('/authors', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { name, bio, photoUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const author = await prisma.author.create({
    data: { name, slug: slugify(name), bio: bio || null, photoUrl: photoUrl || null },
  });
  res.status(201).json({ author });
});

module.exports = router;
