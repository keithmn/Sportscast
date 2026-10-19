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
