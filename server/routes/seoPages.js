// Wave 4 — server-side <title>/description/OG injection for the entity
// detail pages that need it (see server/lib/renderSeoHtml.js for why).
// Registered in index.js BEFORE express.static, so these specific paths
// never reach the static file handler at all when the entity resolves;
// when it doesn't (no slug, not found), next() falls through to the
// static file exactly as today — same client-side "not found" handling,
// unchanged.
//
// Deliberately lean queries here, not each route's full API `include` —
// this only needs the handful of fields a <title>/description ever uses.
//
// Every handler is wrapped: a bad query or a data-layer hiccup here must
// never crash the page — it falls through to the plain static file
// (generic title, noindex still on) exactly like a genuinely-missing
// entity would, rather than taking the whole process down. Found the
// hard way in development: an incorrect field name in the Club query
// (this repo's own Club has no `city` field, unlike the separate Sports
// Data platform's Club/Team models) threw inside an async handler with
// no catch and killed the server — confirmed live, then fixed alongside
// adding this catch everywhere, not just at the one call site.
const express = require('express');
const prisma = require('../db');
const { renderSeoHtml } = require('../lib/renderSeoHtml');

const router = express.Router();
const SITE_NAME = 'The Sportscast';
const DEFAULT_OG_IMAGE = '/brand/social/og-gold-1200x630.png';

router.get('/club.html', async (req, res, next) => {
  const slug = req.query.slug;
  if (!slug) return next();
  try {
    const club = await prisma.club.findUnique({
      where: { slug },
      select: { name: true, venue: true, crestUrl: true, competition: { select: { name: true, isActive: true, sport: { select: { name: true } } } } },
    });
    // Hidden competitions (Competition.isActive false): plain static shell,
    // no real title/description for search engines — same as their 404ing API.
    if (!club || !club.competition.isActive) return next();
    res.type('html').send(renderSeoHtml('club.html', {
      title: `${club.name} — ${SITE_NAME}`,
      description: `${club.name} — ${club.competition.sport.name}, ${club.competition.name}${club.venue ? `. Plays at ${club.venue}` : ''}. Squad, fixtures, and news on ${SITE_NAME}.`,
      ogImage: club.crestUrl || DEFAULT_OG_IMAGE,
      indexable: true,
    }));
  } catch (err) {
    console.error('[seoPages] club.html failed, falling back to static:', err.message);
    next();
  }
});

router.get('/player.html', async (req, res, next) => {
  const slug = req.query.slug;
  if (!slug) return next();
  try {
    const player = await prisma.player.findUnique({
      where: { slug },
      select: { name: true, position: true, nationality: true, photoUrl: true, club: { select: { name: true, competition: { select: { isActive: true } } } } },
    });
    if (!player || !player.club.competition.isActive) return next();
    const context = [player.position, player.nationality].filter(Boolean).join(', ');
    res.type('html').send(renderSeoHtml('player.html', {
      title: `${player.name} — ${SITE_NAME}`,
      description: `${player.name}${context ? ` (${context})` : ''} — plays for ${player.club.name}. Profile and coverage on ${SITE_NAME}.`,
      ogImage: player.photoUrl || DEFAULT_OG_IMAGE,
      indexable: true,
    }));
  } catch (err) {
    console.error('[seoPages] player.html failed, falling back to static:', err.message);
    next();
  }
});

const SITE_URL = (process.env.SITE_URL || 'https://sportscast-production-c267.up.railway.app').replace(/\/$/, '');
const EVENT_STATUS = {
  SCHEDULED: 'https://schema.org/EventScheduled',
  LIVE: 'https://schema.org/EventScheduled',
  FINISHED: 'https://schema.org/EventScheduled',
  POSTPONED: 'https://schema.org/EventPostponed',
  ABANDONED: 'https://schema.org/EventCancelled',
};

router.get('/competition.html', async (req, res, next) => {
  const slug = req.query.slug;
  if (!slug) return next();
  try {
    const competition = await prisma.competition.findUnique({
      where: { slug },
      select: { name: true, category: true, isActive: true, governingBody: true, sport: { select: { name: true } } },
    });
    if (!competition || !competition.isActive) return next();
    res.type('html').send(renderSeoHtml('competition.html', {
      title: `${competition.name} — ${SITE_NAME}`,
      description: `Standings, fixtures, and results for ${competition.name} (${competition.sport.name}) on ${SITE_NAME}.`,
      ogImage: DEFAULT_OG_IMAGE,
      indexable: true,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'SportsOrganization',
        name: competition.name,
        sport: competition.sport.name,
        url: `${SITE_URL}/competition.html?slug=${encodeURIComponent(slug)}`,
        ...(competition.governingBody ? { parentOrganization: { '@type': 'SportsOrganization', name: competition.governingBody } } : {}),
      },
    }));
  } catch (err) {
    console.error('[seoPages] competition.html failed, falling back to static:', err.message);
    next();
  }
});

// Match pages (2026-10-20): a real title ("Gor Mahia 2–1 AFC Leopards —
// Kenyan Premier League") and schema.org SportsEvent data. Only confirmed
// results put a score in the title; a provisional one is described as
// such.
router.get('/match.html', async (req, res, next) => {
  const id = req.query.id;
  if (!id) return next();
  try {
    const f = await prisma.fixture.findUnique({
      where: { id },
      select: {
        homeTeam: true, awayTeam: true, kickoff: true, status: true, homeScore: true, awayScore: true, resultProvisional: true,
        venue: { select: { name: true, city: true } },
        competition: { select: { name: true, slug: true, isActive: true, sport: { select: { name: true } } } },
      },
    });
    if (!f || !f.competition.isActive) return next();
    const final = f.status === 'FINISHED' && f.homeScore != null && !f.resultProvisional;
    const teams = f.awayTeam ? `${f.homeTeam} ${final ? `${f.homeScore}–${f.awayScore}` : 'v'} ${f.awayTeam}` : f.homeTeam;
    const when = f.kickoff.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' });
    res.type('html').send(renderSeoHtml('match.html', {
      title: `${teams} — ${f.competition.name} — ${SITE_NAME}`,
      description: `${teams}, ${f.competition.name}, ${when}${f.venue ? ` at ${f.venue.name}` : ''}.${final ? ' Full-time result.' : f.status === 'POSTPONED' ? ' Postponed.' : ''}`,
      ogImage: DEFAULT_OG_IMAGE,
      indexable: true,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'SportsEvent',
        name: f.awayTeam ? `${f.homeTeam} v ${f.awayTeam}` : f.homeTeam,
        sport: f.competition.sport.name,
        startDate: f.kickoff.toISOString(),
        eventStatus: EVENT_STATUS[f.status] || EVENT_STATUS.SCHEDULED,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        url: `${SITE_URL}/match.html?id=${encodeURIComponent(id)}`,
        superEvent: { '@type': 'SportsEvent', name: f.competition.name, url: `${SITE_URL}/competition.html?slug=${encodeURIComponent(f.competition.slug)}` },
        ...(f.venue ? { location: { '@type': 'Place', name: f.venue.name, ...(f.venue.city ? { address: f.venue.city } : {}) } } : {}),
        homeTeam: { '@type': 'SportsTeam', name: f.homeTeam },
        ...(f.awayTeam ? { awayTeam: { '@type': 'SportsTeam', name: f.awayTeam } } : {}),
        ...(final ? { description: `Full time: ${f.homeTeam} ${f.homeScore}–${f.awayScore} ${f.awayTeam}` } : {}),
      },
    }));
  } catch (err) {
    console.error('[seoPages] match.html failed, falling back to static:', err.message);
    next();
  }
});

router.get('/article.html', async (req, res, next) => {
  const slug = req.query.slug;
  if (!slug) return next();
  try {
    const article = await prisma.article.findUnique({
      where: { slug },
      select: { title: true, dek: true, coverImageUrl: true, status: true },
    });
    // Draft articles get no SEO treatment either — same effect as before
    // (generic title, no description), just not worth special-casing a
    // draft-preview description for a page search engines were never
    // meant to see anyway.
    if (!article || article.status !== 'PUBLISHED') return next();
    res.type('html').send(renderSeoHtml('article.html', {
      title: `${article.title} — ${SITE_NAME}`,
      description: article.dek,
      ogImage: article.coverImageUrl || DEFAULT_OG_IMAGE,
      indexable: true,
    }));
  } catch (err) {
    console.error('[seoPages] article.html failed, falling back to static:', err.message);
    next();
  }
});

router.get('/show.html', async (req, res, next) => {
  const slug = req.query.slug;
  if (!slug) return next();
  try {
    const show = await prisma.show.findUnique({
      where: { slug },
      select: { name: true, tagline: true, coverImageUrl: true, isActive: true },
    });
    if (!show || !show.isActive) return next();
    res.type('html').send(renderSeoHtml('show.html', {
      title: `${show.name} — ${SITE_NAME}`,
      description: show.tagline,
      ogImage: show.coverImageUrl || DEFAULT_OG_IMAGE,
      indexable: true,
    }));
  } catch (err) {
    console.error('[seoPages] show.html failed, falling back to static:', err.message);
    next();
  }
});

module.exports = router;
