// Wave 1 security audit: monitoring Sources are admin/editor-created
// (server/routes/sources.js, requireRole('ADMIN','EDITOR')) but nothing
// stopped one from pointing at an internal/private address — the cron
// job (runMonitoringFetch.js) would fetch it on a schedule regardless.
// Lower severity than a public-facing SSRF (it requires a compromised or
// malicious admin/editor account), but a real gap: a bad Source could
// have this server probe 127.0.0.1, 169.254.169.254 (cloud metadata),
// or anything else on Railway's private network.
//
// Checked at fetch time (not just when the Source is created) so a
// hostname that resolved to a public IP at creation time and a private
// one later (DNS rebinding) is still caught on every actual fetch.
//
// Known residual gap, stated plainly rather than glossed over: this
// validates the URL being fetched, not every hop a redirect might take —
// a source that 30x-redirects from a public URL to an internal one after
// this check passes is not covered. Closing that fully would mean
// disabling fetch's automatic redirect-following and re-validating each
// hop by hand; left as a follow-up, not pretended away.

const dns = require('node:dns').promises;
const net = require('node:net');

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateIPv4(ip) {
  const int = ipv4ToInt(ip);
  const inRange = (base, bits) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (int & mask) === (ipv4ToInt(base) & mask);
  };
  return (
    inRange('0.0.0.0', 8) ||       // "this network"
    inRange('10.0.0.0', 8) ||      // private
    inRange('127.0.0.0', 8) ||     // loopback
    inRange('169.254.0.0', 16) ||  // link-local (includes cloud metadata, 169.254.169.254)
    inRange('172.16.0.0', 12) ||   // private
    inRange('192.168.0.0', 16) ||  // private
    inRange('100.64.0.0', 10)      // carrier-grade NAT
  );
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true; // link-local
  const firstGroup = parseInt(lower.split(':')[0], 16);
  if (!Number.isNaN(firstGroup) && firstGroup >= 0xfc00 && firstGroup <= 0xfdff) return true; // unique local
  // IPv4-mapped (::ffff:a.b.c.d) — check the embedded v4 address.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // not a recognizable IP at all — refuse rather than guess
}

/**
 * Throws if `rawUrl` isn't http(s), or resolves to a private/loopback/
 * link-local/reserved address. Resolves DNS itself (rather than trusting
 * the hostname string) so an attacker can't rely on a public-looking
 * hostname that actually resolves internally.
 */
async function assertPublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Not a valid URL: ${rawUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Refusing non-http(s) URL: ${rawUrl}`);
  }

  const addresses = await dns.lookup(parsed.hostname, { all: true }).catch(() => {
    throw new Error(`Could not resolve host: ${parsed.hostname}`);
  });
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error(`Refusing to fetch ${parsed.hostname} — resolves to a private/internal address (${address})`);
    }
  }
}

module.exports = { assertPublicUrl };
