// Wave 3 — notification foundation. Deliberately the smallest real,
// working loop: a device opts in once ("Enable Notifications", no
// account), and what it actually receives is filtered against that same
// device's existing Follow rows at send time — there's no separate
// per-topic subscription model, no preference UI beyond the one on/off
// toggle. See prisma/schema.prisma's PushSubscription comment.
//
// No-ops (logs a warning, never throws) when VAPID keys aren't set — same
// fail-soft convention as this app's other optional integrations
// (FOOTBALL_DATA_API_KEY, ANTHROPIC_API_KEY, etc.).
const webpush = require('web-push');
const prisma = require('../db');

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
const configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (configured) {
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@underdoggs.co.ke', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — push notifications disabled.');
}

// Sends `payload` (plain object — title/body/url, see sw.js's push
// handler for the exact shape it expects) to every device that (a) has an
// active push subscription and (b) follows at least one of `targets`
// (array of {entityType, entitySlug} — e.g. a fixture result goes to
// followers of either club AND the competition). Recipients are deduped
// by anonymousId first, so a fan following both a club and its
// competition gets one push, not two. A dead subscription (410 Gone, or
// 404 — the push service no longer recognizes it, e.g. the browser data
// was cleared) is deleted here rather than left to fail silently forever
// on every future send.
async function sendPushToFollowers(targets, payload) {
  if (!configured || !targets.length) return;

  const follows = await prisma.follow.findMany({
    where: { OR: targets.map(({ entityType, entitySlug }) => ({ entityType, entitySlug })) },
    select: { anonymousId: true },
  });
  if (!follows.length) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { anonymousId: { in: follows.map((f) => f.anonymousId) } },
  });
  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);
  await Promise.all(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        console.error('[push] Send failed:', err.message);
      }
    }
  }));
}

module.exports = { sendPushToFollowers, pushConfigured: configured };
