const express = require('express');
const prisma = require('../db');

const router = express.Router();

// ---- Public: list players, optionally filtered by sport or competition ----
// Always Kenyan clubs only — enforced here server-side, not left to the
// client (cleaner than the client-side filter public/js/clubs.js's Teams
// browsing still uses; this endpoint is new, so it gets this right from
// the start rather than inheriting that pattern).
router.get('/', async (req, res) => {
  const { sport, competition } = req.query;
  const where = {
    club: {
      competition: {
        region: 'KENYA',
        ...(sport ? { sport: { slug: sport } } : {}),
        ...(competition ? { slug: competition } : {}),
      },
    },
  };
  const players = await prisma.player.findMany({
    where,
    include: { club: { include: { competition: { include: { sport: true } } } } },
    orderBy: { name: 'asc' },
  });
  res.json({ players });
});

module.exports = router;
