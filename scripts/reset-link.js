#!/usr/bin/env node
// Prints a one-time link to set a password, for when no one can sign in —
// the first sign-in on a new production database (the seeded demo password
// is refused there), or the only admin forgetting theirs.
//
//   npm run reset-link -- <email>
//   npm run reset-link -- <email> --base https://thesportscast.co.ke
//
// On Railway, run it inside the container: railway ssh, then the command.
// The link works once, for 24 hours. Send it only to the person it's for.

require('dotenv').config();
const prisma = require('../server/db');
const { RESET_HOURS, createResetLink } = require('../server/lib/resetTokens');

async function main() {
  const args = process.argv.slice(2);
  const baseAt = args.indexOf('--base');
  const base = baseAt >= 0 ? args[baseAt + 1] : (process.env.SITE_URL || 'https://sportscast-production-c267.up.railway.app');
  const email = args.find((a, i) => !a.startsWith('--') && i !== baseAt + 1);
  if (!email || !base) {
    console.error('Usage: npm run reset-link -- <email> [--base <site address>]');
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    || await prisma.user.findUnique({ where: { email: email.trim() } });
  if (!user) {
    console.error(`No account for ${email}.`);
    process.exit(1);
  }
  if (!user.isActive) {
    console.error(`${user.email} is switched off — an admin has to switch it back on first.`);
    process.exit(1);
  }
  console.log(`Link for ${user.name} (${user.email}, ${user.role}) — works once, for ${RESET_HOURS} hours:`);
  console.log(await createResetLink(base, user.id));
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
