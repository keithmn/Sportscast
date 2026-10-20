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
        include: { article: true, season: true, hosts: { select: { name: true } }, guests: { select: { name: true, role: true } } },
        orderBy: { episodeNumber: 'desc' },
      },
    },
  });
  if (!show || !show.isActive) return res.status(404).json({ error: 'Show not found' });
  // The public pages read ep.host / ep.guest (plain text) — fields replaced
  // by the hosts/guests relations, so names typed in the admin never showed
  // (fixed 2026-10-20). Give them the names again, derived from the
  // relations.
  show.episodes = show.episodes.map((ep) => ({
    ...ep,
    host: ep.hosts.map((h) => h.name).join(', ') || null,
    guest: ep.guests.length ? `with ${ep.guests.map((g) => (g.role ? `${g.name} (${g.role})` : g.name)).join(', ')}` : null,
  }));
  res.json({ show });
});

module.exports = router;
