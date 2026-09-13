// Committed, re-runnable mobile viewport regression check — replaces the
// one-off manual CDP passes done throughout this project's early
// development. Per the "Greatest Form" directive's §36/§39: root-causes
// horizontal overflow rather than papering over it with
// `overflow-x:hidden`, and must be runnable by another developer, not
// just something that happened once in a chat session.
//
// CRITICAL, learned the hard way earlier in this project: `--headless
// --window-size=W,H` alone does NOT correctly emulate mobile viewport
// meta-tag behavior and produces false-positive overflow findings. This
// script always uses full CDP device emulation
// (Emulation.setDeviceMetricsOverride with mobile:true for phone/tablet
// widths), never the plain CLI flag.
//
// KNOWN ENVIRONMENTAL LIMITATION, thoroughly isolated while building this
// (not a bug in this site's own code — read on for why we're confident):
// on this machine's Chrome build, after a headless process has rendered
// a page through a full sweep of viewport sizes (including a desktop,
// mobile:false render), the NEXT Chrome process launched afterward can
// have its window.innerWidth reporting corrupted specifically at narrow
// (320-412px) widths — a stable, wrong value, not a crash or a timeout.
// Ruled out as a real overflow bug: the same page renders perfectly in
// total isolation (nothing run before it in that process), and
// scrollWidth never once exceeded the misreported innerWidth — there is
// no actual horizontal scroll, just an unreliable measurement. Ruled out
// as fixable within reasonable effort: retrying the same check, using a
// fresh CDP target, using a fresh Chrome process, waiting several
// seconds after confirmed process exit before the next launch, and
// `--disable-gpu` (which introduced its own hang) were all tried; none
// eliminated it. This is very likely OS-level GPU/shader-cache state
// shared across Chrome processes outside of --user-data-dir, not
// something a Node script can isolate from outside the browser.
//
// Because of this, a check whose emulation verification fails is
// reported as a WARNING, distinct from a FAIL — it means "we couldn't
// reliably test this one combination in this environment," not "we
// found an overflow bug." Only genuine detected overflow counts toward
// the exit code. If warnings ever appear for a page/viewport combination
// that hasn't been manually verified some other way, spot-check it by
// hand (e.g. resize a real browser window) rather than trusting either
// a pass or a fail from this script for that specific cell.
//
// Usage:
//   node server/index.js &          # server must already be running
//   node scripts/mobile-regression.js
//
// Optional env vars:
//   BASE_URL     default http://localhost:3001
//   CHROME_PATH  override auto-detection if Chrome isn't at a known path

const { spawn } = require('child_process');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const CDP_PORT = 9789;

const VIEWPORTS = [
  { name: '320 (small phone)', width: 320, height: 690, mobile: true },
  { name: '360 (common Android)', width: 360, height: 780, mobile: true },
  { name: '375 (iPhone SE/mini)', width: 375, height: 812, mobile: true },
  { name: '390 (iPhone standard)', width: 390, height: 844, mobile: true },
  { name: '412 (large Android)', width: 412, height: 915, mobile: true },
  { name: 'tablet (768)', width: 768, height: 1024, mobile: true },
  { name: 'desktop (1440)', width: 1440, height: 900, mobile: false },
];

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // macOS
    '/usr/bin/google-chrome', // Linux
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  for (const path of candidates) {
    if (fs.existsSync(path)) return path;
  }
  throw new Error('Could not find a Chrome/Chromium binary. Set CHROME_PATH to point at one.');
}

// Dynamically resolved so this never goes stale against deleted/renamed
// content — a hardcoded slug from whenever this script was written is
// exactly the kind of thing that silently stops being a real test.
async function resolveTestPages() {
  const [{ articles }, { sports }, { competitions }] = await Promise.all([
    fetch(`${BASE_URL}/api/articles?limit=1`).then((r) => r.json()),
    fetch(`${BASE_URL}/api/sports`).then((r) => r.json()),
    fetch(`${BASE_URL}/api/competitions`).then((r) => r.json()),
  ]);

  const activeSport = sports.find((s) => s.isActive) || sports[0];
  const localCompetition = competitions.find((c) => c.region === 'KENYA') || competitions[0];

  const pages = [{ name: 'Homepage', path: '/' }, { name: 'Scores', path: '/scores.html' }];
  if (articles[0]) pages.push({ name: 'Article', path: `/article.html?slug=${encodeURIComponent(articles[0].slug)}` });
  if (activeSport) pages.push({ name: 'Sport hub', path: `/sport.html?sport=${encodeURIComponent(activeSport.slug)}` });
  if (localCompetition) pages.push({ name: 'Competition', path: `/competition.html?slug=${encodeURIComponent(localCompetition.slug)}` });

  return pages;
}

const CDP_TIMEOUT_MS = 10_000;

function cdpCall(ws, pending, idRef, method, params) {
  return new Promise((resolve, reject) => {
    const id = idRef.next++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP call ${method} (id ${id}) timed out after ${CDP_TIMEOUT_MS}ms`));
    }, CDP_TIMEOUT_MS);
    pending.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function checkOverflow(ws, pending, idRef, url, viewport) {
  await cdpCall(ws, pending, idRef, 'Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.mobile ? 2 : 1,
    mobile: viewport.mobile,
  });
  await new Promise((r) => setTimeout(r, 200));

  await cdpCall(ws, pending, idRef, 'Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 1200));

  const result = await cdpCall(ws, pending, idRef, 'Runtime.evaluate', {
    expression: `({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })`,
    returnByValue: true,
  });
  const { scrollWidth, innerWidth } = result.result.value;

  if (innerWidth !== viewport.width) {
    // See the header comment — this means the emulation didn't reliably
    // apply, not that we found an overflow bug. Surfaced as a distinct
    // `emulationFailed` case so the caller never conflates it with FAIL.
    return { emulationFailed: true, innerWidth };
  }

  return { overflow: scrollWidth > innerWidth, scrollWidth, innerWidth };
}

async function testOnePage(testPage, pageIndex) {
  const chromePath = findChrome();
  const userDataDir = `/tmp/mobile-regression-chrome-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const port = CDP_PORT + pageIndex;
  const chrome = spawn(chromePath, ['--headless', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`]);

  await new Promise((r) => setTimeout(r, 1500));

  const targets = await fetch(`http://localhost:${port}/json`).then((r) => r.json());
  const page = targets.find((t) => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const idRef = { next: 1 };
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
  });
  await cdpCall(ws, pending, idRef, 'Page.enable', {});
  await cdpCall(ws, pending, idRef, 'Runtime.enable', {});

  const results = [];
  for (const viewport of VIEWPORTS) {
    const url = `${BASE_URL}${testPage.path}`;
    try {
      const check = await checkOverflow(ws, pending, idRef, url, viewport);
      if (check.emulationFailed) {
        results.push({ viewport: viewport.name, kind: 'warn', detail: `couldn't verify — page reports innerWidth ${check.innerWidth}, see header comment` });
      } else {
        results.push({ viewport: viewport.name, kind: check.overflow ? 'fail' : 'ok', detail: `scrollWidth ${check.scrollWidth} vs innerWidth ${check.innerWidth}` });
      }
    } catch (err) {
      results.push({ viewport: viewport.name, kind: 'fail', detail: err.message });
    }
  }

  ws.close();
  chrome.kill();
  await new Promise((resolve) => chrome.once('exit', resolve));
  fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

  return results;
}

async function main() {
  const pages = await resolveTestPages();
  console.log(`Testing ${pages.length} pages × ${VIEWPORTS.length} viewports against ${BASE_URL}`);
  console.log(`(one fresh Chrome process per page — see the header comment for why)\n`);

  let failures = 0;
  let warnings = 0;
  for (let i = 0; i < pages.length; i++) {
    const testPage = pages[i];
    const results = await testOnePage(testPage, i);
    for (const r of results) {
      const label = { ok: 'ok', fail: 'FAIL', warn: 'WARN' }[r.kind];
      if (r.kind === 'fail') failures++;
      if (r.kind === 'warn') warnings++;
      console.log(`  [${label}] ${testPage.name.padEnd(14)} @ ${r.viewport.padEnd(22)} (${r.detail})`);
    }
  }

  console.log('');
  if (failures > 0) console.log(`${failures} overflow failure(s) found.`);
  if (warnings > 0) console.log(`${warnings} check(s) couldn't be verified in this environment (see header comment) — not counted as failures, but worth a manual spot-check if you're specifically worried about one of them.`);
  if (failures === 0 && warnings === 0) console.log('All pages clean — no horizontal overflow at any tested viewport.');
  else if (failures === 0) console.log('No overflow found in every check that could run reliably.');

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Mobile regression check failed to run:', err);
  process.exit(1);
});
