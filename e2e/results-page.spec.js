const { test, expect } = require('@playwright/test');

// Results page (2026-10-19): the quick way for an editor to enter scores.
// Real seeded data, real admin session, real routes — same convention as
// fixture-details.spec.js.
test.describe('Results page', () => {
  let kpl;

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    kpl = competitions.find((c) => c.slug === 'kenyan-premier-league');
  });

  test('an overdue game is typed in from "Waiting for a result" and saved with its source', async ({ page }) => {
    const stamp = Date.now();
    const kickoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const make = (h, a) => page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: { homeTeam: `${h} ${stamp}`, awayTeam: `${a} ${stamp}`, kickoff } }).then((r) => r.json()).then((b) => b.fixture);
    const played = await make('Due Home', 'Due Away');
    const postponed = await make('Rain Home', 'Rain Away');
    try {
      await page.goto('/admin/results.html');
      const row = page.locator(`#waiting-list .result-row[data-fixture-id="${played.id}"]`);
      await expect(row).toBeVisible();
      await expect(page.locator('#savebar')).toBeHidden();
      await row.locator('[data-score="home"]').fill('2');
      await row.locator('[data-score="away"]').fill('1');
      await expect(row.locator('.row-status')).toHaveValue('FINISHED'); // both scores → full time
      await page.locator(`#waiting-list .result-row[data-fixture-id="${postponed.id}"] .row-status`).selectOption('POSTPONED');
      await expect(page.locator('#savebar-count')).toHaveText('2 results to save');
      await page.fill('#source-url', 'https://footballkenya.org/results');
      await page.click('#savebar-btn');

      await expect(page.locator('#saved-note')).toContainText('Kenyan Premier League (2)');
      await expect(page.locator('#saved-note .rebuild-btn')).toBeVisible(); // football: table follows from scores
      await expect(page.locator(`#waiting-list .result-row[data-fixture-id="${played.id}"]`)).toHaveCount(0);

      const { fixture } = await page.request.get(`/api/fixtures/${played.id}`).then((r) => r.json());
      expect(fixture).toMatchObject({ status: 'FINISHED', homeScore: 2, awayScore: 1, sourceUrl: 'https://footballkenya.org/results' });
      const { fixture: off } = await page.request.get(`/api/fixtures/${postponed.id}`).then((r) => r.json());
      expect(off.status).toBe('POSTPONED');
    } finally {
      for (const f of [played, postponed]) await page.request.delete(`/api/competitions/fixtures/${f.id}`);
    }
  });

  test('a game missing from the list is added with its score, and a second copy is refused', async ({ page }) => {
    const stamp = Date.now();
    const home = `Missing Home ${stamp}`;
    const away = `Missing Away ${stamp}`;
    await page.goto('/admin/results.html?competition=kenyan-premier-league');
    await expect(page.locator('#competition-select')).toHaveValue('kenyan-premier-league');
    const row = page.locator('#add-rows .add-game-row').first();
    await expect(row).toBeVisible();
    await row.locator('[data-add="homeTeam"]').fill(home);
    await row.locator('[data-add="homeScore"]').fill('1');
    await row.locator('[data-add="awayScore"]').fill('0');
    await row.locator('[data-add="awayTeam"]').fill(away);
    await row.locator('[data-add="date"]').fill('2026-10-18');
    await row.locator('[data-add="round"]').fill('Matchweek 2');
    await page.click('#add-games-btn');
    await expect(page.locator('#saved-note')).toContainText('Kenyan Premier League (1)');

    const { competition } = await page.request.get('/api/competitions/kenyan-premier-league').then((r) => r.json());
    const added = competition.fixtures.find((f) => f.homeTeam === home);
    try {
      expect(added).toMatchObject({ status: 'FINISHED', homeScore: 1, awayScore: 0, round: 'Matchweek 2' });
      expect(added.kickoff).toBe('2026-10-18T12:00:00.000Z'); // 15:00 Nairobi
      // It now sits in its round on the page.
      await expect(page.locator(`#round-rows .result-row[data-fixture-id="${added.id}"]`)).toBeVisible();

      // The same game again is refused, with a reason.
      const again = await page.request.post(`/api/competitions/${kpl.id}/games`, { data: { games: [{ homeTeam: home, awayTeam: away, kickoff: '2026-10-18T18:00', homeScore: 1, awayScore: 0 }] } });
      expect(again.status()).toBe(400);
      expect((await again.json()).error).toContain('already in the fixture list');
      const half = await page.request.post(`/api/competitions/${kpl.id}/games`, { data: { games: [{ homeTeam: 'A', awayTeam: 'B', kickoff: '2026-10-25T15:00', homeScore: 1 }] } });
      expect((await half.json()).error).toContain('enter both scores, or neither');
    } finally {
      if (added) await page.request.delete(`/api/competitions/fixtures/${added.id}`);
    }
  });

  test('a logged-in editor gets edit shortcuts on public pages; visitors do not', async ({ page, browser }) => {
    await page.goto('/admin/results.html'); // any admin page remembers this browser as an editor's
    await page.goto('/competition.html?slug=kenyan-premier-league');
    const bar = page.locator('#editor-bar');
    await expect(bar).toBeVisible();
    await expect(bar.locator('a', { hasText: 'Enter results' })).toHaveAttribute('href', '/admin/results.html?competition=kenyan-premier-league');
    await bar.locator('a', { hasText: 'Enter results' }).click();
    await expect(page.locator('#competition-select')).toHaveValue('kenyan-premier-league');

    const visitor = await browser.newContext();
    const anon = await visitor.newPage();
    await anon.goto('/competition.html?slug=kenyan-premier-league');
    await expect(anon.locator('.page-title')).toBeVisible();
    await expect(anon.locator('#editor-bar')).toHaveCount(0);
    await visitor.close();
  });

  test('with no signal a save is kept on the phone and sent when the connection returns', async ({ page, context }) => {
    const kickoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { fixture } = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: { homeTeam: `Offline Home ${Date.now()}`, awayTeam: 'Offline Away', kickoff } }).then((r) => r.json());
    try {
      await page.goto('/admin/results.html');
      const row = page.locator(`#waiting-list .result-row[data-fixture-id="${fixture.id}"]`);
      await expect(row).toBeVisible();
      await row.locator('[data-score="home"]').fill('3');
      await row.locator('[data-score="away"]').fill('0');
      await context.setOffline(true);
      await page.click('#savebar-btn');
      await expect(page.locator('#offline-banner')).toContainText('kept on this phone');
      expect((await page.request.get(`/api/fixtures/${fixture.id}`).then((r) => r.json())).fixture.status).not.toBe('FINISHED');

      await context.setOffline(false);
      await expect(page.locator('#offline-banner')).toContainText('Back online — sent results', { timeout: 10000 });
      const after = (await page.request.get(`/api/fixtures/${fixture.id}`).then((r) => r.json())).fixture;
      expect([after.status, after.homeScore, after.awayScore]).toEqual(['FINISHED', 3, 0]);
    } finally {
      await context.setOffline(false);
      await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
    }
  });

  test("a federation's results sheet is checked row by row, then imported — conflicts are never overwritten", async ({ page }) => {
    const stamp = Date.now();
    const day = new Date(Date.now() - 2 * 86400000);
    const iso = day.toISOString().slice(0, 10);
    const dmy = `${String(day.getUTCDate()).padStart(2, '0')}/${String(day.getUTCMonth() + 1).padStart(2, '0')}/${day.getUTCFullYear()}`;
    const make = (h, a) => page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: { homeTeam: `${h} ${stamp}`, awayTeam: `${a} ${stamp}`, kickoff: `${iso}T15:00` } }).then((r) => r.json()).then((b) => b.fixture);
    const due = await make('Sheet Due', 'Sheet Opp');
    const right = await make('Sheet Right', 'Sheet Opp2');
    const clash = await make('Sheet Clash', 'Sheet Opp3');
    await page.request.put(`/api/competitions/${kpl.id}/fixtures/results`, { data: { results: [{ fixtureId: right.id, homeScore: 1, awayScore: 0 }, { fixtureId: clash.id, homeScore: 2, awayScore: 2 }] } });
    const sheet = [
      'Date\tHome\tHome score\tAway score\tAway\tRound',
      `${dmy}\tSheet Due ${stamp}\t3\t1\tSheet Opp ${stamp}\tMatchweek 2`,
      `${dmy}\tSheet Right ${stamp}\t1\t0\tSheet Opp2 ${stamp}\tMatchweek 2`,
      `${dmy}\tSheet Clash ${stamp}\t0\t1\tSheet Opp3 ${stamp}\tMatchweek 2`,
      `${dmy}\tSheet New ${stamp}\t2\t0\tSheet NewOpp ${stamp}\tMatchweek 2`,
      `${dmy}\tSheet Fixture ${stamp}\t\t\tSheet FixOpp ${stamp}\tMatchweek 3`,
      'nonsense row',
    ].join('\n');
    try {
      await page.goto('/admin/results.html?competition=kenyan-premier-league');
      await page.locator('.import-sheet summary').click();
      await page.fill('#sheet-text', sheet);
      await page.click('#sheet-check');
      const planList = page.locator('#sheet-plan');
      await expect(planList).toContainText('Result filled in');
      await expect(planList).toContainText('Already right — skipped');
      await expect(planList).toContainText('Conflict — not changed');
      await expect(planList).toContainText('New game with result');
      await expect(planList).toContainText('New fixture');
      await expect(planList).toContainText("Couldn't read this row");
      await expect(page.locator('#sheet-import')).toHaveText('Import 3 changes');
      expect((await page.request.get(`/api/fixtures/${due.id}`).then((r) => r.json())).fixture.status).not.toBe('FINISHED'); // the check changed nothing

      await page.click('#sheet-import');
      await expect(page.locator('#sheet-plan')).toContainText('Imported:');
      const get = async (id) => (await page.request.get(`/api/fixtures/${id}`).then((r) => r.json())).fixture;
      expect(await get(due.id)).toMatchObject({ status: 'FINISHED', homeScore: 3, awayScore: 1 });
      expect(await get(clash.id)).toMatchObject({ homeScore: 2, awayScore: 2 }); // conflict left alone
    } finally {
      const { competition } = await page.request.get('/api/competitions/kenyan-premier-league').then((r) => r.json());
      for (const f of competition.fixtures.filter((x) => String(x.homeTeam).includes(String(stamp)))) await page.request.delete(`/api/competitions/fixtures/${f.id}`);
    }
  });

  test('a near-duplicate competition name is refused unless confirmed', async ({ page }) => {
    const { sports } = await page.request.get('/api/sports').then((r) => r.json());
    const football = sports.find((s) => s.name === 'Football');
    const res = await page.request.post('/api/competitions', { data: { name: 'Kenya Premier league', sportId: football.id } });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toContain('Kenyan Premier League');
    // The Results page is one tap away on every admin page.
    await page.goto('/admin/dashboard.html');
    await expect(page.locator('.admin-sidebar a[href="/admin/results.html"]')).toBeVisible();
  });
});
