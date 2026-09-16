// Wave 1 security audit: the only rate limiter anywhere in this app was
// scoped to /api/auth/login. Every other public, unauthenticated write
// endpoint (anonymous follows, anonymous poll votes, the public
// contact/tip/partnership/newsletter form) had none — follows.js's own
// header comment said so outright ("no rate limiting exists anywhere
// here yet"). Same shape as index.js's loginLimiter, just a separate,
// slightly more generous ceiling since these are normal-use anonymous
// actions, not a credential check.
const rateLimit = require('express-rate-limit');

const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — try again later.' },
});

module.exports = { publicWriteLimiter };
