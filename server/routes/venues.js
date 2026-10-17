const express = require('express');
const prisma = require('../db');

const router = express.Router();

// ---- Public: every venue, alphabetical — feeds the admin venue
// autocomplete now, and venue pages later. ----
router.get('/', async (req, res) => {
  const venues = await prisma.venue.findMany({
    select: { id: true, name: true, slug: true, city: true },
    orderBy: { name: 'asc' },
  });
  res.json({ venues });
});

module.exports = router;
