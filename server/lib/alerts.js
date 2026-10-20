// Failure alerts (2026-10-19). Every alert goes to the server log; when
// ALERT_WEBHOOK_URL is set it is also POSTed there as { text } — the shape
// Slack, Discord (append /slack to a Discord webhook URL) and most chat
// webhooks accept. The same alert is sent at most once an hour, so a job
// failing every 2 minutes doesn't flood the channel.

const lastSent = new Map();
const QUIET_MS = 60 * 60 * 1000;

async function sendAlert(key, message) {
  console.error(`[alert] ${message}`);
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return false;
  const now = Date.now();
  if (lastSent.has(key) && now - lastSent.get(key) < QUIET_MS) return false;
  lastSent.set(key, now);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `The Sportscast: ${message}` }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch (err) {
    console.error(`[alert] could not reach ALERT_WEBHOOK_URL: ${err.message}`);
    return false;
  }
}

module.exports = { sendAlert };
