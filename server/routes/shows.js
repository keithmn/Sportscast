const express = require('express');
const prisma = require('../db');

const router = express.Router();

// ---- Public: a show and its published episodes (with each episode's own
// Article for title/dek/cover/publish state) ----
router.get('/:slug', async (req, res) => {
  const show = await prisma.show.findUnique({
    where: { slug: req.params.slug },
    include: {
      seasons: { orderBy: { number: 'desc' } },
      episodes: {
        where: { article: { status: 'PUBLISHED' } },
        include: { article: true, season: true },
        orderBy: { episodeNumber: 'desc' },
      },
    },
  });
  if (!show || !show.isActive) return res.status(404).json({ error: 'Show not found' });
  res.json({ show });
});

module.exports = router;
