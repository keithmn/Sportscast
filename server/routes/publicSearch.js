// Wave 4 — this app had no public search of any kind before this file;
// the only "search" anywhere was server/routes/canonicalSearch.js, an
// admin-only proxy to the Data Platform's own entity picker (explicitly
// not a general-purpose public API, per its own comment). This is a
// separate, genuinely public route: local content only (Article/Show/
// Club/Player/Competition) — no canonical bridge call, matching
// canonicalData.js's own "never call the Data Platform from the
// browser" rule doesn't even apply here since there's nothing canonical
// to reach for local stories/teams/players/competitions in the first
// place.
//
// Fixture/match search is deliberately not included — Fixture has no
// name field to match against (homeTeam/awayTeam are free-text strings,
// not FK'd everywhere — see its own schema comment), the same
// structural gap the Data Platform side of this ecosystem has for the
// same reason. Left as its own follow-up, not forced into this pattern.
const express = require('express');
const prisma = require('../db');
const { publicWriteLimiter } = require('../middleware/rateLimits');

const router = express.Router();

const MAX_PER_TYPE = 10;
const MIN_QUERY_LENGTH = 2;
const VALID_TYPES = ['article', 'show', 'club', 'player', 'competition'];

router.get('/', publicWriteLimiter, async (req, res) => {
  const { q, type } = req.query;
  if (typeof q !== 'string' || q.trim().length < MIN_QUERY_LENGTH) {
    return res.status(400).json({ error: `q query param is required (minimum ${MIN_QUERY_LENGTH} characters)` });
  }
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }
  const query = q.trim();
  const typesToSearch = type ? [type] : VALID_TYPES;
  const results = {};

  if (typesToSearch.includes('article')) {
    const articles = await prisma.article.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [{ title: { contains: query } }, { dek: { contains: query } }],
      },
      include: { sport: true },
      orderBy: { publishedAt: 'desc' },
      take: MAX_PER_TYPE,
    });
    results.articles = articles.map((a) => ({
      id: a.id,
      name: a.title,
      slug: a.slug,
      sportName: a.sport.name,
      isVideo: a.contentType === 'VIDEO_POST',
    }));
  }

  if (typesToSearch.includes('show')) {
    const shows = await prisma.show.findMany({
      where: { isActive: true, name: { contains: query } },
      take: MAX_PER_TYPE,
    });
    results.shows = shows.map((s) => ({ id: s.id, name: s.name, slug: s.slug, sportName: s.sportLabel }));
  }

  if (typesToSearch.includes('club')) {
    const clubs = await prisma.club.findMany({
      where: { name: { contains: query } },
      include: { competition: { include: { sport: true } } },
      take: MAX_PER_TYPE,
    });
    results.clubs = clubs.map((c) => ({ id: c.id, name: c.name, slug: c.slug, sportName: c.competition.sport.name }));
  }

  if (typesToSearch.includes('player')) {
    const players = await prisma.player.findMany({
      where: { name: { contains: query } },
      include: { club: { include: { competition: { include: { sport: true } } } } },
      take: MAX_PER_TYPE,
    });
    results.players = players.map((p) => ({ id: p.id, name: p.name, slug: p.slug, sportName: p.club.competition.sport.name }));
  }

  if (typesToSearch.includes('competition')) {
    const competitions = await prisma.competition.findMany({
      where: { name: { contains: query } },
      include: { sport: true },
      take: MAX_PER_TYPE,
    });
    results.competitions = competitions.map((c) => ({ id: c.id, name: c.name, slug: c.slug, sportName: c.sport.name }));
  }

  res.json({ results });
});

module.exports = router;
