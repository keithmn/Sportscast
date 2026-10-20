// Two-step login codes (TOTP, RFC 6238) — the 6-digit codes Google
// Authenticator, Microsoft Authenticator, Authy etc. show. Node's own
// crypto; checked against the RFC's test vector in e2e/accounts.spec.js.

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function newSecret() {
  return base32Encode(crypto.randomBytes(20));
}

// The code for a secret (raw bytes or base32) at a moment, 30-second steps.
function codeAt(secret, timeMs = Date.now(), digits = 6) {
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / 30)));
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const n = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(n % 10 ** digits).padStart(digits, '0');
}

// Accepts the current code or the one either side, for clock drift.
function verify(secret, code, timeMs = Date.now()) {
  const given = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return false;
  return [-1, 0, 1].some((step) => crypto.timingSafeEqual(Buffer.from(codeAt(secret, timeMs + step * 30000)), Buffer.from(given)));
}

function otpauthUri(secret, email) {
  const label = encodeURIComponent(`The Sportscast:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('The Sportscast')}`;
}

module.exports = { newSecret, codeAt, verify, otpauthUri, base32Encode };
