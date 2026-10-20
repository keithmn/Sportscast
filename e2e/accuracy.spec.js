const { test, expect } = require('@playwright/test');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');

// Accuracy (2026-10-19): match outcomes, sanity checks, corrections,
// provisional results from correspondents, one identity per club, and
// season handover. Real routes, real seeded data.
const ROOT = path.join(__dirname, '..');
const DB_PATH = process.env.E2E_DB_PATH || path.join(ROOT, 'prisma', '.e2e-test.db');

async function signIn(page, email = 'admin@underdoggs.co.ke', password = 'underdoggs2026') {
  await page.goto('/admin/index.html');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(/\/admin\/(dashboard|results)\.html/);
}

async function kpl(page) {
  const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
  return competitions.find((c) => c.slug === 'kenyan-premier-league');
}

async function newFixture(page, competitionId, label, kickoff = new Date(Date.now() - 4 * 3600000).toISOString()) {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const { fixture } = await page.request.post(`/api/competitions/${competitionId}/fixtures`, { data: { homeTeam: `${label} Home ${stamp}`, awayTeam: `${label} Away ${stamp}`, kickoff } }).then((r) => r.json());
  return fixture;
}

const saveResults = (page, competitionId, body) => page.request.put(`/api/competitions/${competitionId}/fixtures/results`, { data: body });

test.describe('Accuracy', () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  test('penalties, extra time and abandoned games are recorded and shown', async ({ page }) => {
    const comp = await kpl(page);
    const cup = await newFixture(page, comp.id, 'Pens');
    const off = await newFixture(page, comp.id, 'Lights');
    try {
      const unequal = await saveResults(page, comp.id, { results: [{ fixtureId: cup.id, homeScore: 2, awayScore: 1, decidedBy: 'PENALTIES', homePenalties: 4, awayPenalties: 3 }] });
      expect((await unequal.json()).error).toContain('level score');
      expect((await saveResults(page, comp.id, { results: [
        { fixtureId: cup.id, homeScore: 1, awayScore: 1, decidedBy: 'PENALTIES', homePenalties: 4, awayPenalties: 3 },
        { fixtureId: off.id, status: 'ABANDONED', homeScore: 1, awayScore: 0, resultNote: 'Floodlight failure' },
      ] })).ok()).toBe(true);
      await page.goto(`/match.html?id=${cup.id}`);
      await expect(page.locator('#match-root')).toContainText('(4–3 pens)');
      await page.goto(`/match.html?id=${off.id}`);
      await expect(page.locator('#match-root')).toContainText('Abandoned — Floodlight failure');
    } finally {
      for (const f of [cup, off]) await page.request.delete(`/api/competitions/fixtures/${f.id}`);
    }
  });

  test('an unusual score needs confirming; a published result needs a reason to change, and the change is shown and can be undone', async ({ page }) => {
    const comp = await kpl(page);
    const f = await newFixture(page, comp.id, 'Fix');
    try {
      const wild = await saveResults(page, comp.id, { results: [{ fixtureId: f.id, homeScore: 9, awayScore: 0 }] });
      expect(wild.status()).toBe(409);
      expect((await wild.json()).warnings.join(' ')).toContain('unusually high');
      expect((await saveResults(page, comp.id, { results: [{ fixtureId: f.id, homeScore: 1, awayScore: 0 }] })).ok()).toBe(true);

      const noReason = await saveResults(page, comp.id, { results: [{ fixtureId: f.id, homeScore: 2, awayScore: 0 }] });
      expect(noReason.status()).toBe(400);
      expect((await noReason.json()).needsReason).toEqual([f.id]);
      expect((await saveResults(page, comp.id, { results: [{ fixtureId: f.id, homeScore: 2, awayScore: 0 }], corrections: { [f.id]: 'Late goal missed' } })).ok()).toBe(true);

      await page.goto(`/match.html?id=${f.id}`);
      await expect(page.locator('.correction-note')).toContainText('was 1–0 (Late goal missed)');

      const detail = await page.request.get(`/api/fixtures/${f.id}`).then((r) => r.json());
      expect(detail.fixture.corrections).toHaveLength(1);
      const { corrections } = await page.request.get('/api/competitions/corrections/pending').then((r) => r.json());
      expect(corrections.find((c) => c.fixtureId === f.id)).toBeUndefined(); // applied straight away by default

      // Undo: back to 1-0, and the note goes.
      expect((await page.request.post(`/api/competitions/corrections/${detail.fixture.corrections[0].id}/revert`)).ok()).toBe(true);
      const reverted = (await page.request.get(`/api/fixtures/${f.id}`).then((r) => r.json())).fixture;
      expect([reverted.homeScore, reverted.awayScore]).toEqual([1, 0]);
      expect(reverted.corrections).toHaveLength(0);
    } finally {
      await page.request.delete(`/api/competitions/fixtures/${f.id}`);
    }
  });

  test("a correspondent's result is provisional until an editor confirms it, and stays in their competitions", async ({ page, browser }) => {
    const comp = await kpl(page);
    const stamp = Date.now();
    const email = `field${stamp}@example.com`;
    const { setupLink } = await page.request.post('/api/auth/users', { data: { name: `Field ${stamp}`, email, role: 'CORRESPONDENT', competitionIds: [comp.id] } }).then((r) => r.json());
    await page.request.post('/api/auth/reset', { data: { token: new URL(setupLink).searchParams.get('token'), password: 'ground-report-1' } });
    const f = await newFixture(page, comp.id, 'Ground');
    const ctx = await browser.newContext();
    const field = await ctx.newPage();
    try {
      await signIn(field, email, 'ground-report-1');
      const { competitions } = await field.request.get('/api/competitions').then((r) => r.json());
      const other = competitions.find((c) => c.slug === 'national-super-league');
      expect((await field.request.put(`/api/competitions/${other.id}/fixtures/results`, { data: { results: [{ fixtureId: f.id, homeScore: 1, awayScore: 1 }] } })).status()).toBe(403);
      const sent = await saveResults(field, comp.id, { results: [{ fixtureId: f.id, homeScore: 3, awayScore: 1 }] });
      expect(await sent.json()).toMatchObject({ provisional: true });

      await page.goto(`/match.html?id=${f.id}`);
      await expect(page.locator('#match-root')).toContainText('Provisional');
      const { fixtures } = await page.request.get('/api/fixtures/provisional').then((r) => r.json());
      expect(fixtures.map((x) => x.id)).toContain(f.id);

      // The editor confirms by saving it (same score).
      expect((await saveResults(page, comp.id, { results: [{ fixtureId: f.id, homeScore: 3, awayScore: 1 }] })).ok()).toBe(true);
      const after = (await page.request.get(`/api/fixtures/${f.id}`).then((r) => r.json())).fixture;
      expect(after.resultProvisional).toBe(false);
      // A correspondent can't change a confirmed result.
      expect((await saveResults(field, comp.id, { results: [{ fixtureId: f.id, homeScore: 4, awayScore: 1 }], corrections: { [f.id]: 'x' } })).status()).toBe(403);
    } finally {
      await ctx.close();
      await page.request.delete(`/api/competitions/fixtures/${f.id}`);
    }
  });

  test('one identity per club: aliases link fixtures, cup games link to the league club, duplicates merge', async ({ page }) => {
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const comp = competitions.find((c) => c.slug === 'kenyan-premier-league');
    const cup = competitions.find((c) => c.slug === 'fkf-cup');
    const stamp = Date.now();
    const name = `Aliasville ${stamp} FC`;
    const { club } = await page.request.post('/api/clubs', { data: { name, competitionId: comp.id } }).then((r) => r.json());
    expect((await page.request.post('/api/clubs', { data: { name, competitionId: comp.id } })).status()).toBe(409);
    const short = `AVFC${stamp}`;
    const league = (await page.request.post(`/api/competitions/${comp.id}/fixtures`, { data: { homeTeam: short, awayTeam: 'Nobody Utd', kickoff: '2026-12-27T15:00' } }).then((r) => r.json())).fixture;
    const cupGame = (await page.request.post(`/api/competitions/${cup.id}/fixtures`, { data: { homeTeam: `Aliasville ${stamp}`, awayTeam: 'Nobody Utd', kickoff: '2026-12-28T15:00' } }).then((r) => r.json())).fixture;
    const dup = (await page.request.post('/api/clubs', { data: { name: `Aliasville ${stamp} Duplicate`, competitionId: comp.id } }).then((r) => r.json())).club;
    const { player } = await page.request.post(`/api/clubs/${dup.id}/players`, { data: { name: `Moved Player ${stamp}` } }).then((r) => r.json());
    try {
      expect(cupGame.homeClubId).toBe(club.id); // cup game, league club
      expect(league.homeClubId).toBeNull();
      const { unlinked } = await page.request.get('/api/clubs/admin/unlinked').then((r) => r.json());
      expect(unlinked.some((u) => u.team === short)).toBe(true);

      const added = await page.request.post(`/api/clubs/${club.id}/aliases`, { data: { name: short } }).then((r) => r.json());
      expect(added.linked).toBeGreaterThanOrEqual(1);
      const relinked = (await page.request.get(`/api/fixtures/${league.id}`).then((r) => r.json())).fixture;
      expect(relinked.homeClubId).toBe(club.id);

      const merged = await page.request.post(`/api/clubs/${dup.id}/merge`, { data: { intoId: club.id } }).then((r) => r.json());
      expect(merged.ok).toBe(true);
      const moved = await page.request.get(`/api/clubs/players/${player.slug}`).then((r) => r.json());
      expect(moved.player.club.id).toBe(club.id);
      const { aliases } = await page.request.get(`/api/clubs/${club.id}/aliases`).then((r) => r.json());
      expect(aliases.map((a) => a.name)).toContain(`Aliasville ${stamp} Duplicate`);
    } finally {
      await page.request.delete(`/api/competitions/fixtures/${league.id}`);
      await page.request.delete(`/api/competitions/fixtures/${cupGame.id}`);
      await page.request.delete(`/api/clubs/${club.id}`);
    }
  });

  test('a planned season stays hidden until its start date, then takes over; an ended season says "Final table"', async ({ page, request }) => {
    const { sports } = await page.request.get('/api/sports').then((r) => r.json());
    const stamp = Date.now();
    const { competition } = await page.request.post('/api/competitions', { data: { name: `Season Test ${stamp}`, sportId: sports.find((s) => s.name === 'Football').id, confirmNew: true } }).then((r) => r.json());
    try {
      await page.request.post(`/api/competitions/${competition.id}/seasons`, { data: { label: '2025/26', endsOn: '2026-06-30' } });
      const planned = await page.request.post(`/api/competitions/${competition.id}/seasons`, { data: { label: '2026/27', startsOn: '2026-11-15' } }).then((r) => r.json());
      expect(planned.planned).toBe(true);
      const publicView = await request.get(`/api/competitions/${competition.slug}`).then((r) => r.json());
      expect(publicView.competition.seasons.map((s) => s.label)).toEqual(['2025/26']);

      await page.goto(`/competition.html?slug=${competition.slug}`);
      await expect(page.locator('.season-table-label')).toContainText('Final table · 2025/26');

      // The nightly job, run as if it were 15 November.
      await promisify(execFile)('node', ['-e', "require('./server/jobs/rolloverSeasons').rolloverSeasons(new Date('2026-11-15T06:00:00+03:00')).then((d) => { console.log(d); return require('./server/db').$disconnect(); })"], {
        cwd: ROOT, env: { ...process.env, DATABASE_URL: `file:${DB_PATH}`, NODE_NO_WARNINGS: '1' },
      });
      const after = await request.get(`/api/competitions/${competition.slug}`).then((r) => r.json());
      expect(after.competition.seasons.find((s) => s.isCurrent).label).toBe('2026/27');
    } finally {
      await page.request.put(`/api/competitions/${competition.id}/active`, { data: { isActive: false } });
    }
  });
});
