#!/usr/bin/env node
// X watch — the watcher. Runs on an editor's own Mac, in its own Chrome
// profile that the editor logs into X with by hand (--login). Every
// interval it opens each watched account's profile like a reader would,
// reads the posts already on the page, and sends them to the newsroom's
// /api/watch/ingest. See README.md in this folder before running it.
//
// Ground rules, built in:
// - Human pace: one profile page at a time, a pause between accounts,
//   at most one gentle scroll, a 15-minute minimum interval, watch hours.
// - It never works around X. A login wall, a challenge, "rate limit" or
//   "something went wrong" makes it report BLOCKED to the dashboard and
//   STOP — no retry, no other browser, no new account. An editor sorts it
//   out by hand in the watcher's Chrome window and starts it again.
// - Reads text only. Never likes, posts, follows or opens DMs.
//
// Usage:
//   node scripts/x-watch/watch.js --login          # one-off: log into X by hand
//   WATCH_BASE_URL=http://localhost:3000 WATCH_INGEST_TOKEN=... \
//     node scripts/x-watch/watch.js [--once] [--interval=20] [--hours=9-23] [--show]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));

const PROFILE_DIR = process.env.WATCH_PROFILE_DIR || path.join(os.homedir(), '.sportscast-x-watch');
const BASE_URL = (process.env.WATCH_BASE_URL || '').replace(/\/$/, '');
const TOKEN = process.env.WATCH_INGEST_TOKEN || '';
const INTERVAL_MIN = Math.max(15, Number(args.interval) || 20);
const [HOUR_FROM, HOUR_TO] = String(args.hours || '9-23').split('-').map(Number);
const MAX_POSTS = 25;
// Only for testing the watcher against a local fake page; always X in real use.
const X_ORIGIN = (process.env.WATCH_X_ORIGIN || 'https://x.com').replace(/\/$/, '');

const BLOCK_SIGNS = [
  { re: /\/(i\/flow\/)?login|\/account\/access|\/i\/flow\/consent/, why: 'X asked to log in again' },
];
const BLOCK_TEXT = [
  { re: /rate limit|try again later|you are rate limited/i, why: 'X says rate limit reached' },
  { re: /something went wrong/i, why: 'X showed "Something went wrong"' },
  { re: /verify you are human|are you a robot|captcha|unusual activity/i, why: 'X showed a challenge' },
  { re: /your account (is|has been) (locked|suspended)|account suspended/i, why: 'X says the account is locked or suspended' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base, spread) => base + Math.round((Math.random() - 0.5) * 2 * spread);

function nairobiHour() {
  return Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Nairobi' }));
}

async function api(pathname, body) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-watch-token': TOKEN },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${pathname}: ${data.error || res.status}`);
  return data;
}

async function openBrowser(visible) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const options = { headless: !visible, viewport: { width: 1280, height: 900 } };
  // The editor's installed Chrome when there is one (the same browser they
  // log in with), otherwise Playwright's own Chromium.
  try {
    return await chromium.launchPersistentContext(PROFILE_DIR, { ...options, channel: 'chrome' });
  } catch {
    return chromium.launchPersistentContext(PROFILE_DIR, options);
  }
}

// Reads the posts currently on a profile page. Returns { posts } or { blocked }.
async function readProfile(page, handle) {
  let response;
  try {
    response = await page.goto(`${X_ORIGIN}/${handle}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (err) {
    // Chrome reports an HTTP error page this way: X refused the page.
    if (/ERR_HTTP_RESPONSE_CODE_FAILURE|ERR_BLOCKED/.test(err.message)) return { blocked: 'X refused the page (HTTP error) — not logged in, or limited' };
    throw err;
  }
  const code = response ? response.status() : 0;
  if (code === 429) return { blocked: 'X says rate limit reached (HTTP 429)' };
  if (code === 401 || code === 403) return { blocked: `X refused the page (HTTP ${code}) — not logged in, or limited` };
  if (code >= 400) return { error: `X returned HTTP ${code}` };
  const urlBlock = BLOCK_SIGNS.find(({ re }) => re.test(new URL(page.url()).pathname));
  if (urlBlock) return { blocked: urlBlock.why };

  const appeared = await page.waitForSelector('article[data-testid="tweet"]', { timeout: 20000 }).then(() => true).catch(() => false);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const textBlock = BLOCK_TEXT.find(({ re }) => re.test(bodyText));
  if (textBlock && !appeared) return { blocked: textBlock.why };
  if (!appeared) {
    if (/this account doesn.t exist|account suspended/i.test(bodyText)) return { error: `@${handle} doesn't exist or is suspended` };
    if (/these posts are protected/i.test(bodyText)) return { error: `@${handle}'s posts are protected` };
    return { error: 'No posts appeared on the profile page' };
  }

  // One gentle scroll for a little more of the timeline — no more.
  await sleep(jitter(2500, 800));
  await page.mouse.wheel(0, 1600);
  await sleep(jitter(3000, 1000));

  const posts = await page.$$eval('article[data-testid="tweet"]', (articles, owner) => articles.map((a) => {
    const social = a.querySelector('[data-testid="socialContext"]')?.innerText || '';
    const timeEl = a.querySelector('time');
    const link = timeEl ? timeEl.closest('a') : a.querySelector('a[href*="/status/"]');
    const href = link ? link.getAttribute('href') : '';
    const text = a.querySelector('[data-testid="tweetText"]')?.innerText || '';
    return {
      url: href ? `https://x.com${href.split('?')[0].replace(/\/(analytics|photo|video)\/.*$/, '')}` : '',
      text,
      postedAt: timeEl ? timeEl.getAttribute('datetime') : null,
      isRepost: /reposted|retweeted/i.test(social) || (href && !href.toLowerCase().startsWith(`/${owner.toLowerCase()}/`)),
      isPinned: /pinned/i.test(social),
    };
  }), handle);

  const seen = new Set();
  return {
    posts: posts
      .filter((p) => p.url && p.text && !p.isPinned) // a pinned post is old news
      .filter((p) => (seen.has(p.url) ? false : seen.add(p.url)))
      .slice(0, MAX_POSTS)
      .map(({ isPinned, ...p }) => p),
  };
}

async function checkAll(context) {
  const { accounts } = await api('/api/watch/accounts');
  const active = accounts.filter((a) => a.isActive);
  if (!active.length) { console.log('No active accounts on the watch list — add some in the admin (X Watch).'); return 'OK'; }
  const page = context.pages()[0] || await context.newPage();
  for (const account of active) {
    let result;
    try {
      result = await readProfile(page, account.handle);
    } catch (err) {
      result = { error: err.message.split('\n')[0] };
    }
    if (result.blocked) {
      await api('/api/watch/ingest', { handle: account.handle, status: 'BLOCKED', error: result.blocked }).catch(() => {});
      console.error(`STOPPED: ${result.blocked} (@${account.handle}). Open the watcher's Chrome window (node scripts/x-watch/watch.js --login), sort it out by hand, then start the watcher again.`);
      return 'BLOCKED';
    }
    if (result.error) {
      await api('/api/watch/ingest', { handle: account.handle, status: 'ERROR', error: result.error }).catch(() => {});
      console.warn(`@${account.handle}: ${result.error}`);
    } else {
      const { created, rejected } = await api('/api/watch/ingest', { handle: account.handle, status: 'OK', posts: result.posts });
      console.log(`${new Date().toISOString()} @${account.handle}: ${result.posts.length} read, ${created} new${rejected.length ? `, ${rejected.length} rejected` : ''}`);
    }
    await sleep(process.env.WATCH_X_ORIGIN ? 200 : jitter(12000, 4000)); // pause between accounts (shortened only against a local fake X)
  }
  return 'OK';
}

async function main() {
  if (args.login) {
    const context = await openBrowser(true);
    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://x.com/login');
    console.log(`Log into X in the window that just opened, then close the window. Profile: ${PROFILE_DIR}`);
    await new Promise((resolve) => context.on('close', resolve));
    return;
  }
  if (!BASE_URL || TOKEN.length < 24) {
    console.error('Set WATCH_BASE_URL (the newsroom site, e.g. http://localhost:3000) and WATCH_INGEST_TOKEN (the same 24+ character value as the server) first. See scripts/x-watch/README.md.');
    process.exit(1);
  }

  const context = await openBrowser(Boolean(args.show));
  const stop = async (code) => { await context.close().catch(() => {}); process.exit(code); };
  process.on('SIGINT', () => stop(0));

  for (;;) {
    const hour = nairobiHour();
    const inHours = HOUR_FROM <= HOUR_TO ? hour >= HOUR_FROM && hour < HOUR_TO : hour >= HOUR_FROM || hour < HOUR_TO;
    if (inHours || args.once) {
      const outcome = await checkAll(context).catch((err) => { console.error(err.message); return 'ERROR'; });
      if (outcome === 'BLOCKED') await stop(2);
    } else {
      console.log(`Outside watch hours (${HOUR_FROM}:00-${HOUR_TO}:00 Nairobi) — waiting.`);
    }
    if (args.once) await stop(0);
    await sleep(jitter(INTERVAL_MIN * 60 * 1000, 3 * 60 * 1000));
  }
}

main();
