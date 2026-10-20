// One-time password links, shared by the Account → Team page
// (server/routes/auth.js) and scripts/reset-link.js, which an owner runs on
// the server when no one can sign in. Only a hash of the token is stored.

const crypto = require('crypto');
const prisma = require('../db');

const RESET_HOURS = 24;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function createResetLink(baseUrl, userId) {
  const token = crypto.randomBytes(24).toString('base64url');
  await prisma.passwordResetToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_HOURS * 3600000) } });
  return `${baseUrl.replace(/\/$/, '')}/admin/reset.html?token=${token}`;
}

module.exports = { RESET_HOURS, hashToken, createResetLink };
