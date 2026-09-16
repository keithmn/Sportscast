// Wave 7 — the REGISTERED tier of the directive's ANONYMOUS/REGISTERED/
// STAFF/API_CLIENT authentication model. Deliberately minimal: no email
// verification, no password-reset flow (see FanAccount's own schema
// comment for why — no email-sending service exists in this stack yet).
// Session-based, same mechanism as server/routes/auth.js's admin login,
// but stored under a DISTINCT session key (`req.session.fan`, not
// `req.session.user`) so an admin and a fan session can coexist in the
// same browser without colliding, and fan logout only ever clears its
// own key rather than calling req.session.destroy() (which would also
// kill an admin session sharing the same cookie).
const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function toPublicAccount(account) {
  return { id: account.id, email: account.email, name: account.name, anonymousId: account.anonymousId };
}

router.post('/register', async (req, res) => {
  const { email, password, name, anonymousId } = req.body;
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const existing = await prisma.fanAccount.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  // The incoming anonymousId (this browser's existing follows/push
  // subscription) becomes this account's own — see FanAccount's schema
  // comment for why that alone is enough to "migrate" it, with no Follow/
  // PushSubscription rows actually moved. If that anonymousId is somehow
  // already claimed by a different account (unexpected, but not
  // impossible — a shared/borrowed device), register the new account
  // without claiming it rather than failing the whole registration.
  const anonymousIdTaken = anonymousId
    ? Boolean(await prisma.fanAccount.findUnique({ where: { anonymousId } }))
    : false;

  const passwordHash = await bcrypt.hash(password, 10);
  const account = await prisma.fanAccount.create({
    data: {
      email,
      passwordHash,
      name: name || null,
      anonymousId: anonymousId && !anonymousIdTaken ? anonymousId : null,
    },
  });

  req.session.fan = toPublicAccount(account);
  res.status(201).json({ account: req.session.fan });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const account = await prisma.fanAccount.findUnique({ where: { email } });
  if (!account) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  req.session.fan = toPublicAccount(account);
  res.json({ account: req.session.fan });
});

router.post('/logout', (req, res) => {
  delete req.session.fan;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ account: req.session.fan || null });
});

module.exports = router;
