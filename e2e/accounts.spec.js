const { test, expect } = require('@playwright/test');

// Accounts and the critical fixes of 2026-10-19: one login per person,
// set-up/reset links, two-step login, deactivation, correspondents; a
// server that survives everyday mistakes; no scoreless "full time"; the
// featured story not emptying the homepage; Nairobi-time scheduling;
// postponed games with a new date.
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { codeAt } = require('../server/lib/totp');

const ROOT = path.join(__dirname, '..');
const DB_PATH = process.env.E2E_DB_PATH || path.join(ROOT, 'prisma', '.e2e-test.db');
const OFF = '0 0 1 1 *';
const CRONS = ['BACKUP_CRON', 'BALLDONTLIE_SYNC_CRON', 'CLEANUP_RAW_RECORDINGS_CRON', 'KENYA_CUP_SYNC_CRON', 'MONITORING_ENRICH_CRON', 'MONITORING_FETCH_CRON', 'PUBLISH_SCHEDULED_CRON', 'SEASON_ROLLOVER_CRON', 'SQUAD_SYNC_CRON', 'SYNC_INTERVAL_CRON', 'THESPORTSDB_SYNC_CRON'];
const nodeEnv = (extra) => ({ ...process.env, DATABASE_URL: `file:${DB_PATH}`, NODE_NO_WARNINGS: '1', ...extra });

async function signIn(page, email = 'admin@underdoggs.co.ke', password = 'underdoggs2026') {
  await page.goto('/admin/index.html');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button:has-text("Sign In")');
}

test.describe('Accounts', () => {
  test('two-step codes match RFC 6238', () => {
    const key = Buffer.from('12345678901234567890');
    expect(codeAt(key, 59000, 8)).toBe('94287082');
    expect(codeAt(key, 1111111109000, 8)).toBe('07081804');
  });

  test('the login page no longer prints the demo password', async ({ page }) => {
    await page.goto('/admin/index.html');
    await expect(page.locator('body')).not.toContainText('underdoggs2026');
  });

  // The repo is public, so the demo password is too. In production it must
  // not sign anyone in — not even to "change it first", which would hand
  // the account to whoever tried it first.
  test('in production the demo password signs no one in', async () => {
    test.setTimeout(60000);
    const port = 3197;
    const server = spawn('node', ['server/index.js'], {
      cwd: ROOT,
      env: nodeEnv({ PORT: String(port), REFUSE_DEMO_PASSWORD: '1', SESSION_SECRET: 'e2e-production-check', ...Object.fromEntries(CRONS.map((c) => [c, OFF])) }),
      stdio: 'ignore',
    });
    try {
      const base = `http://localhost:${port}`;
      for (let i = 0; i < 60; i += 1) {
        try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* still starting */ }
        await new Promise((r) => setTimeout(r, 500));
      }
      const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@underdoggs.co.ke', password: 'underdoggs2026' }) });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.user).toBeUndefined();
      expect(body.error).toContain('reset-link');
      expect(res.headers.get('set-cookie')).toBeNull();
    } finally {
      server.kill();
    }
  });

  test('when no one can sign in, the server prints a one-time link', async ({ page, browser }) => {
    await signIn(page);
    await page.waitForURL('**/admin/dashboard.html');
    const email = `owner${Date.now()}@example.com`;
    await page.request.post('/api/auth/users', { data: { name: 'Owner Test', email, role: 'ADMIN' } });

    const out = execFileSync('node', ['scripts/reset-link.js', email, '--base', 'https://example.invalid'], { cwd: ROOT, env: nodeEnv({}), encoding: 'utf8' });
    const link = new URL(out.match(/https:\/\/example\.invalid\/admin\/reset\.html\?token=\S+/)[0]);
    const ctx = await browser.newContext();
    const them = await ctx.newPage();
    await them.goto(link.pathname + link.search);
    await them.fill('#new-password', 'owner-pass-2026');
    await them.fill('#confirm-password', 'owner-pass-2026');
    await them.click('button:has-text("Set password")');
    await expect(them.locator('#reset-done')).toBeVisible();
    await signIn(them, email, 'owner-pass-2026');
    await them.waitForURL('**/admin/dashboard.html');
    await ctx.close();

    expect(() => execFileSync('node', ['scripts/reset-link.js', 'nobody@example.invalid'], { cwd: ROOT, env: nodeEnv({}), stdio: 'pipe' })).toThrow();
  });

  test('an admin adds a correspondent, who sets a password from the link and can only enter results', async ({ page, browser }) => {
    await signIn(page);
    await page.waitForURL('**/admin/dashboard.html');
    const stamp = Date.now();
    const email = `corr${stamp}@example.com`;
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.slug === 'kenyan-premier-league');
    const created = await page.request.post('/api/auth/users', { data: { name: `Correspondent ${stamp}`, email, role: 'CORRESPONDENT', competitionIds: [kpl.id] } }).then((r) => r.json());
    expect(created.setupLink).toMatch(/\/admin\/reset\.html\?token=/);

    const ctx = await browser.newContext();
    const them = await ctx.newPage();
    await them.goto(created.setupLink.replace(/^https?:\/\/[^/]+/, ''));
    await them.fill('#new-password', 'pitch-side-2026');
    await them.fill('#confirm-password', 'pitch-side-2026');
    await them.click('button:has-text("Set password")');
    await expect(them.locator('#reset-done')).toBeVisible();
    // The link works once.
    const again = await them.request.post('/api/auth/reset', { data: { token: new URL(created.setupLink).searchParams.get('token'), password: 'another-pass-123' } });
    expect(again.status()).toBe(400);

    await signIn(them, email, 'pitch-side-2026');
    await them.waitForURL('**/admin/results.html');
    expect((await them.request.get('/api/auth/users')).status()).toBe(403);
    expect((await them.request.get('/api/articles/admin/all')).status()).toBe(403);
    const me = await them.request.get('/api/auth/me').then((r) => r.json());
    expect(me.user).toMatchObject({ role: 'CORRESPONDENT', competitionIds: [kpl.id] });

    // Deactivated: signed out and can't sign back in.
    await page.request.put(`/api/auth/users/${created.user.id}`, { data: { isActive: false } });
    expect((await them.request.get('/api/auth/me').then((r) => r.json())).user).toBeNull();
    const blocked = await them.request.post('/api/auth/login', { data: { email, password: 'pitch-side-2026' } });
    expect(blocked.status()).toBe(401);
    await ctx.close();
  });

  test('change password, two-step login, and the last admin can\'t be removed', async ({ page, browser }) => {
    await signIn(page);
    await page.waitForURL('**/admin/dashboard.html');
    const stamp = Date.now();
    const email = `ed${stamp}@example.com`;
    const { user, setupLink } = await page.request.post('/api/auth/users', { data: { name: `Editor ${stamp}`, email, role: 'EDITOR' } }).then((r) => r.json());
    const token = new URL(setupLink).searchParams.get('token');
    const ctx = await browser.newContext();
    const ed = await ctx.newPage();
    expect((await ed.request.post('/api/auth/reset', { data: { token, password: 'short' } })).status()).toBe(400);
    expect((await ed.request.post('/api/auth/reset', { data: { token, password: 'underdoggs2026' } })).status()).toBe(400);
    expect((await ed.request.post('/api/auth/reset', { data: { token, password: 'first-password-1' } })).ok()).toBe(true);

    await signIn(ed, email, 'first-password-1');
    await ed.waitForURL('**/admin/dashboard.html');
    await ed.goto('/admin/account.html');
    await ed.fill('#pw-current', 'first-password-1');
    await ed.fill('#pw-next', 'second-password-2');
    await ed.fill('#pw-confirm', 'second-password-2');
    await ed.click('button:has-text("Change password")');
    await expect(ed.locator('#pw-ok')).toBeVisible();
    expect((await ed.request.post('/api/auth/login', { data: { email, password: 'first-password-1' } })).status()).toBe(401);

    // Two-step login.
    const { secret } = await ed.request.post('/api/auth/totp/setup').then((r) => r.json());
    expect((await ed.request.post('/api/auth/totp/enable', { data: { code: '000000' } })).status()).toBe(400);
    expect((await ed.request.post('/api/auth/totp/enable', { data: { code: codeAt(secret) } })).ok()).toBe(true);
    const fresh = await browser.newContext();
    const noCode = await fresh.request.post('/api/auth/login', { data: { email, password: 'second-password-2' } });
    expect(noCode.status()).toBe(401);
    expect((await noCode.json()).needCode).toBe(true);
    expect((await fresh.request.post('/api/auth/login', { data: { email, password: 'second-password-2', code: codeAt(secret) } })).ok()).toBe(true);
    await fresh.close();
    await ctx.close();

    // An editor can't manage the team; the only admin can't be demoted.
    expect((await page.request.put(`/api/auth/users/${user.id}`, { data: { isActive: false } })).ok()).toBe(true);
    const { users } = await page.request.get('/api/auth/users').then((r) => r.json());
    const admins = users.filter((u) => u.role === 'ADMIN' && u.isActive);
    if (admins.length === 1) {
      const res = await page.request.put(`/api/auth/users/${admins[0].id}`, { data: { role: 'EDITOR' } });
      expect(res.status()).toBe(400);
    }
  });
});

test.describe('Critical fixes', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.waitForURL('**/admin/dashboard.html');
  });

  test('everyday mistakes get a clear answer instead of taking the server down', async ({ page, request }) => {
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.slug === 'kenyan-premier-league');
    const game = { homeTeam: `Twice ${Date.now()}`, awayTeam: 'Tapped FC', kickoff: '2026-12-20T15:00' };
    const first = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: game }).then((r) => r.json());
    const second = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: game });
    expect(second.status()).toBe(409);
    await page.request.delete(`/api/competitions/fixtures/${first.fixture.id}`);
    const gone = await page.request.delete(`/api/competitions/fixtures/${first.fixture.id}`);
    expect(gone.status()).toBe(404);
    expect((await request.get('/api/health').then((r) => r.json())).ok).toBe(true); // still up
  });

  test('"Full time" needs both scores; a postponed game gets its new date', async ({ page }) => {
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.slug === 'kenyan-premier-league');
    const { fixture } = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: { homeTeam: `Rain ${Date.now()}`, awayTeam: 'Delay FC', kickoff: '2026-12-21T15:00' } }).then((r) => r.json());
    try {
      const scoreless = await page.request.put(`/api/competitions/fixtures/${fixture.id}`, { data: { status: 'FINISHED' } });
      expect(scoreless.status()).toBe(400);
      expect((await scoreless.json()).error).toContain('both scores');

      await page.request.put(`/api/competitions/${kpl.id}/fixtures/results`, { data: { results: [{ fixtureId: fixture.id, status: 'POSTPONED' }] } });
      await page.goto(`/match.html?id=${fixture.id}`);
      await expect(page.locator('#match-root')).toContainText('Postponed — new date to be confirmed');
      await page.request.put(`/api/competitions/${kpl.id}/fixtures/results`, { data: { results: [{ fixtureId: fixture.id, status: 'POSTPONED', kickoff: '2027-01-09T16:00' }] } });
      const moved = (await page.request.get(`/api/fixtures/${fixture.id}`).then((r) => r.json())).fixture;
      expect(moved.kickoff).toBe('2027-01-09T13:00:00.000Z');
      expect(moved.originalKickoff).toBe('2026-12-21T12:00:00.000Z');
      await page.reload();
      await expect(page.locator('#match-root')).toContainText('Postponed from 21 Dec 2026 — now 9 Jan 2027');
    } finally {
      await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
    }
  });

  test('featuring a story keeps the rest of the homepage, and schedules are Nairobi time', async ({ page }) => {
    const [{ sports }, { authors }] = await Promise.all([
      page.request.get('/api/sports').then((r) => r.json()),
      page.request.get('/api/authors').then((r) => r.json()),
    ]);
    const base = { dek: 'A test story', body: 'Body text for an e2e story.', sportId: sports[0].id, authorId: authors[0].id };
    const { article } = await page.request.post('/api/articles', { data: { ...base, title: `Featured ${Date.now()}`, status: 'PUBLISHED', featured: true } }).then((r) => r.json());
    const { article: later } = await page.request.post('/api/articles', { data: { ...base, title: `Scheduled ${Date.now()}`, status: 'SCHEDULED', scheduledAt: '2027-03-01T10:00' } }).then((r) => r.json());
    try {
      expect(later.scheduledAt).toBe('2027-03-01T07:00:00.000Z'); // 10:00 in Nairobi
      await page.goto('/');
      await expect(page.locator('#lead-story-root')).toContainText(article.title);
      await expect(page.locator('#stories-r1 .story-card, #stories-r1 a').first()).toBeVisible();
    } finally {
      await page.request.put(`/api/articles/${article.id}`, { data: { featured: false } });
      await page.request.delete(`/api/articles/${article.id}`);
      await page.request.delete(`/api/articles/${later.id}`);
    }
  });
});
