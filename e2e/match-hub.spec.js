const { test, expect } = require('@playwright/test');

// Wave 4 — this app had no per-fixture detail page at all before this
// (fixture rows were plain, unclickable divs everywhere they appeared).
// Real admin-created fixture, not a fixture/mock — same golden-path
// convention as admin-articles.spec.js.
test.describe('Match Hub', () => {
  test('a fixture is reachable from the competition page and shows real data', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.name === 'Kenyan Premier League');
    expect(kpl).toBeTruthy();

    const fixtureRes = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, {
      data: { homeTeam: 'E2E Home FC', awayTeam: 'E2E Away FC', kickoff: '2026-10-01T15:00:00.000Z', status: 'FINISHED' },
    });
    const { fixture } = await fixtureRes.json();
    await page.request.put(`/api/competitions/fixtures/${fixture.id}`, { data: { homeScore: 3, awayScore: 2 } });

    // Reachable from the competition page's Scores & Fixtures tab.
    await page.goto(`/competition.html?slug=${kpl.slug}`);
    await page.click('text=Scores & Fixtures');
    const fixtureLink = page.locator(`a[href="/match.html?id=${fixture.id}"]`);
    await expect(fixtureLink).toBeVisible();
    await fixtureLink.click();
    await page.waitForURL(`**/match.html?id=${fixture.id}`);

    // Real data on the Match Hub page itself.
    await expect(page.locator('#match-root')).toContainText('E2E Home FC');
    await expect(page.locator('#match-root')).toContainText('E2E Away FC');
    await expect(page.locator('#match-root')).toContainText('3');
    await expect(page.locator('#match-root')).toContainText('2');
    await expect(page.locator('#match-root')).toContainText('Kenyan Premier League');
    await expect(page.locator('#match-root')).toContainText('FINISHED');

    await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
  });

  test('a missing fixture id shows "not found", not a crash', async ({ page }) => {
    await page.goto('/match.html?id=no-such-fixture-id-at-all');
    await expect(page.locator('.empty-state', { hasText: 'Match not found' })).toBeVisible();
  });
});
