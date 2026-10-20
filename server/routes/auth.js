// Newsroom accounts (rebuilt 2026-10-19). Before this there was only
// login/logout/me: no password change, no reset, no way to add or remove
// people, so everyone shared "Admin" or "Editor" and the ChangeLog
// couldn't say who did what.
//
// - Each person has their own account. An ADMIN adds them in Account →
//   Team and gets a one-time setup link to send them (there's no email
//   sending); the same for a forgotten password.
// - Two-step login (authenticator app codes) is optional per person.
// - In production, the seeded demo password never signs anyone in. It's
//   public in the repo, so letting it in — even only to force a change —
//   would hand the account to whoever got there first. The owner sets a
//   real password with a one-time link from scripts/reset-link.js instead.

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const totp = require('../lib/totp');
const { RESET_HOURS, hashToken, createResetLink } = require('../lib/resetTokens');

const router = express.Router();

const ROLES = ['ADMIN', 'EDITOR', 'CORRESPONDENT'];
// The password prisma/seed.js gives the demo accounts — public in the repo.
const SEED_PASSWORD = 'underdoggs2026';
const refuseDemoPassword = () => Boolean(process.env.RAILWAY_ENVIRONMENT) || process.env.NODE_ENV === 'production' || process.env.REFUSE_DEMO_PASSWORD === '1';

function passwordProblem(password, user) {
  if (typeof password !== 'string' || password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'That password is too long.';
  if (password === SEED_PASSWORD) return "That's the published demo password — choose your own.";
  if (user && password.toLowerCase().includes(user.email.split('@')[0].toLowerCase())) return "Don't use your email name in the password.";
  return null;
}

// What the browser is told about the logged-in person.
async function sessionUser(user) {
  const scope = user.role === 'CORRESPONDENT'
    ? (await prisma.userCompetition.findMany({ where: { userId: user.id }, select: { competitionId: true } })).map((c) => c.competitionId)
    : null;
  return {
    id: user.id, name: user.name, email: user.email, role: user.role,
    mustChangePassword: user.mustChangePassword, totpEnabled: user.totpEnabled, competitionIds: scope,
  };
}

const newResetLink = (req, userId) => createResetLink(`${req.protocol}://${req.get('host')}`, userId);

// ---- Login ----
// Two-step accounts answer { needCode: true } to a correct password with
// no code; the browser then asks for the code and sends both again.
router.post('/login', async (req, res) => {
  const { email, password, code } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } })
    || await prisma.user.findUnique({ where: { email: String(email).trim() } });
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (refuseDemoPassword() && password === SEED_PASSWORD) {
    return res.status(403).json({ error: 'This account still has the published demo password, so it can’t sign in. Set your own password with a one-time link: run "npm run reset-link -- <your email>" on the server (see JOB_RUNBOOK.md).' });
  }
  if (user.totpEnabled) {
    if (!code) return res.status(401).json({ needCode: true, error: 'Enter the 6-digit code from your authenticator app' });
    if (!totp.verify(user.totpSecret, code)) return res.status(401).json({ needCode: true, error: "That code didn't match — try the newest one" });
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not start a session — try again' });
    sessionUser(updated).then((u) => {
      req.session.user = u;
      res.json({ user: u });
    });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Refreshes the session's copy from the database, so a deactivated
// account or a changed role takes effect on the next page.
router.get('/me', async (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  const user = await prisma.user.findUnique({ where: { id: req.session.user.id } });
  if (!user || !user.isActive) {
    return req.session.destroy(() => res.json({ user: null }));
  }
  req.session.user = await sessionUser(user);
  res.json({ user: req.session.user });
});

// ---- Your own account ----
router.post('/password', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.user.id } });
  if (!user || !(await bcrypt.compare(String(req.body.current || ''), user.passwordHash))) {
    return res.status(400).json({ error: 'Your current password is not right' });
  }
  const problem = passwordProblem(req.body.next, user);
  if (problem) return res.status(400).json({ error: problem });
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(req.body.next, 10), mustChangePassword: false, passwordChangedAt: new Date() },
  });
  req.session.user = await sessionUser(updated);
  res.json({ ok: true, user: req.session.user });
});

router.post('/totp/setup', requireAuth, async (req, res) => {
  const secret = totp.newSecret();
  const user = await prisma.user.update({ where: { id: req.session.user.id }, data: { totpSecret: secret, totpEnabled: false } });
  res.json({ secret, uri: totp.otpauthUri(secret, user.email) });
});

router.post('/totp/enable', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.user.id } });
  if (!user.totpSecret) return res.status(400).json({ error: 'Start the set-up first' });
  if (!totp.verify(user.totpSecret, req.body.code)) return res.status(400).json({ error: "That code didn't match — check the app and try the newest code" });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  req.session.user = await sessionUser(updated);
  res.json({ ok: true, user: req.session.user });
});

router.post('/totp/disable', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.user.id } });
  if (!(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(400).json({ error: 'Your password is not right' });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  req.session.user = await sessionUser(updated);
  res.json({ ok: true, user: req.session.user });
});

// ---- Set a password from a one-time link (no login needed) ----
router.post('/reset', async (req, res) => {
  const token = String(req.body.token || '');
  const record = token && await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
    return res.status(400).json({ error: 'This link has expired or was already used — ask an admin for a new one' });
  }
  const problem = passwordProblem(req.body.password, record.user);
  if (problem) return res.status(400).json({ error: problem });
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await bcrypt.hash(req.body.password, 10), mustChangePassword: false, passwordChangedAt: new Date() } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  res.json({ ok: true, email: record.user.email });
});

// ---- The team (ADMIN only) ----
router.get('/users', requireRole('ADMIN'), async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true, isActive: true, totpEnabled: true, lastLoginAt: true, createdAt: true, competitions: { select: { competitionId: true } } },
  });
  res.json({ users: users.map((u) => ({ ...u, competitionIds: u.competitions.map((c) => c.competitionId), competitions: undefined })), roles: ROLES });
});

router.post('/users', requireRole('ADMIN'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = req.body.role;
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'A name and a valid email are needed' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of ${ROLES.join(', ')}` });
  if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: `${email} already has an account` });
  const competitionIds = role === 'CORRESPONDENT' && Array.isArray(req.body.competitionIds) ? req.body.competitionIds : [];
  // No usable password until they set one through the link.
  const user = await prisma.user.create({
    data: {
      name, email, role, mustChangePassword: true,
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      competitions: { create: competitionIds.map((competitionId) => ({ competitionId })) },
    },
  });
  res.status(201).json({ user: { id: user.id, name, email, role }, setupLink: await newResetLink(req, user.id), validHours: RESET_HOURS });
});

router.put('/users/:id', requireRole('ADMIN'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'No such person' });
  const data = {};
  if (req.body.name !== undefined) data.name = String(req.body.name).trim() || user.name;
  if (req.body.role !== undefined) {
    if (!ROLES.includes(req.body.role)) return res.status(400).json({ error: `Role must be one of ${ROLES.join(', ')}` });
    data.role = req.body.role;
  }
  if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
  // Never lock the newsroom out: keep at least one active admin.
  const losingAdmin = user.role === 'ADMIN' && ((data.role && data.role !== 'ADMIN') || data.isActive === false);
  if (losingAdmin && await prisma.user.count({ where: { role: 'ADMIN', isActive: true } }) <= 1) {
    return res.status(400).json({ error: "This is the only active admin — make someone else an admin first" });
  }
  const ops = [prisma.user.update({ where: { id: user.id }, data })];
  if (Array.isArray(req.body.competitionIds)) {
    ops.push(prisma.userCompetition.deleteMany({ where: { userId: user.id } }));
    req.body.competitionIds.forEach((competitionId) => ops.push(prisma.userCompetition.create({ data: { userId: user.id, competitionId } })));
  }
  await prisma.$transaction(ops);
  res.json({ ok: true });
});

router.post('/users/:id/reset-link', requireRole('ADMIN'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'No such person' });
  res.json({ link: await newResetLink(req, user.id), validHours: RESET_HOURS });
});

module.exports = router;
module.exports.SEED_PASSWORD = SEED_PASSWORD;
