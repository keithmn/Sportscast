const express = require('express');
const prisma = require('../db');

const router = express.Router();

// ---- Public: list players, optionally filtered by sport or competition ----
// Always Kenyan clubs only — enforced here server-side, not left to the
// client (cleaner than the client-side filter public/js/clubs.js's Teams
// browsing still uses; this endpoint is new, so it gets this right from
// the start rather than inheriting that pattern).
router.get('/', async (req, res) => {
  const { sport, competition, q } = req.query;
  // q powers the admin episode-guest picker (Wave 5) — a name-contains
  // search, same shape as the fixture/canonical-event search pickers
  // elsewhere in the admin. Deliberately not gated behind the Kenyan-only
  // region filter below (a guest could plausibly be a player from a
  // global competition too), so it's handled as its own branch.
  if (q) {
    if (q.trim().length < 2) return res.json({ players: [] });
    const players = await prisma.player.findMany({
      where: { name: { contains: q.trim() } },
      include: { club: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: 15,
    });
    return res.json({ players });
  }

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
