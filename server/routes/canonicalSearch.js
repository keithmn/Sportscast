// Wave 2 — a real admin search picker for the Underdawgs Sports Data
// platform's canonical entities, replacing the raw-UUID-paste pattern
// articles.js's canonical-event field used until now (the audit's own
// explicit gap). Server-side proxy only — matches canonicalData.js's own
// architecture rule (never call the Data Platform from the browser,
// keeps this key-free/CORS-free for the client).
const express = require('express');
const { requireRole } = require('../middleware/auth');
const { publicWriteLimiter } = require('../middleware/rateLimits');
const { searchCanonical } = require('../lib/canonicalData');

const router = express.Router();

// Matches the Data Platform's own /v1/search?type= allowlist exactly
// (apps/api/src/routes/search.ts) — kept in sync by hand since these are
// two separate repos with no shared type import possible.
const VALID_TYPES = ['athlete', 'team', 'competition', 'venue', 'event'];

// Admin-only (not public) — this exists to help a newsroom editor find
// the right canonical id, not as a general-purpose public search API.
// Reuses publicWriteLimiter's ceiling as a cheap ceiling here too, even
// though this is a read: it's still an outbound server-to-server fetch
// per keystroke-driven request, and per-editor volume is the same shape
// as the public write endpoints it was built for (bursty, human-paced).
router.get('/', requireRole('ADMIN', 'EDITOR'), publicWriteLimiter, async (req, res) => {
  const { type, q } = req.query;
  if (typeof q !== 'string' || q.trim().length < 2) {
    return res.status(400).json({ error: 'q query param is required (minimum 2 characters)' });
  }
  if (typeof type !== 'string' || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const matches = await searchCanonical(type, q.trim());
  // Same shape as the Data Platform's own /v1/search response
  // (`{results: {events: [...]}}`) rather than a flat array — the admin
  // JS calling this was written against that shape directly.
  res.json({ results: { [`${type}s`]: matches } });
});

module.exports = router;
