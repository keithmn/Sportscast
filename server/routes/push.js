// Wave 3 — notification foundation. No auth, same as follows.js: anonymousId
// identifies a device, not a person. See server/lib/push.js for how a
// subscription actually gets used (filtered against Follow at send time).
const express = require('express');
const prisma = require('../db');
const { publicWriteLimiter } = require('../middleware/rateLimits');
const { pushConfigured } = require('../lib/push');

const router = express.Router();
const ANON_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function validId(anonymousId) {
  return typeof anonymousId === 'string' && ANON_ID_RE.test(anonymousId);
}

// Client needs the public key to call PushManager.subscribe() — returning
// null (not a 500) when push isn't configured lets the client cleanly skip
// offering the "Enable Notifications" control instead of erroring.
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: pushConfigured ? process.env.VAPID_PUBLIC_KEY : null });
});

router.post('/subscribe', publicWriteLimiter, async (req, res) => {
  const { anonymousId, subscription } = req.body || {};
  if (!validId(anonymousId)) return res.status(400).json({ error: 'A valid anonymousId is required' });
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'A valid subscription (endpoint + keys) is required' });

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { anonymousId, p256dh, auth },
    create: { anonymousId, endpoint, p256dh, auth },
  });
  res.status(201).json({ ok: true });
});

router.delete('/subscribe', publicWriteLimiter, async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  res.json({ ok: true });
});

module.exports = router;
