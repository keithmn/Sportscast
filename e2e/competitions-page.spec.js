const { test, expect } = require('@playwright/test');

// Competitions page (rebuilt 2026-10-20): one competition at a time, a
// card per fixture. Saving one card must not wipe typing in another, and a
// game can be moved to a new date.
test.describe('Competitions page', () => {
  test('reschedule a game from its card without losing typing elsewhere; history shows it', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.slug === 'kenyan-premier-league');
    const stamp = Date.now();
    const round = `E2E Round ${stamp}`;
    const make = (h, kickoff) => page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: { homeTeam: `${h} ${stamp}`, awayTeam: `Opp ${h} ${stamp}`, kickoff, round } }).then((r) => r.json()).then((b) => b.fixture);
    const a = await make('Moved', '2026-12-05T15:00');
    const b = await make('Typed', '2026-12-05T18:00');
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/admin/competitions.html?competition=kenyan-premier-league&tab=fixtures&fixture=${a.id}`);
      const cardA = page.locator(`.fx-card[data-fixture-id="${a.id}"]`);
      const cardB = page.locator(`.fx-card[data-fixture-id="${b.id}"]`);
      await expect(cardA).toHaveClass(/focus/);
      await cardB.locator('[data-f="broadcaster"]').fill('Typed but not saved');
      await cardA.locator('[data-f="kickoff"]').fill('2026-12-12T16:30');
      await cardA.locator('[data-f="status"]').selectOption('POSTPONED');
      await cardA.locator('.fx-save').click();
      await expect(page.locator(`#fx-${a.id} .inline-msg`)).toHaveText('Saved');
      await expect(cardB.locator('[data-f="broadcaster"]')).toHaveValue('Typed but not saved');
      const moved = (await page.request.get(`/api/fixtures/${a.id}`).then((r) => r.json())).fixture;
      expect(moved.kickoff).toBe('2026-12-12T13:30:00.000Z');
      expect(moved.originalKickoff).toBe('2026-12-05T12:00:00.000Z');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      await page.click('.comp-tabs button[data-tab="history"]');
      await expect(page.locator('.history-list')).toContainText(`Postponed Moved ${stamp}`);
    } finally {
      for (const f of [a, b]) await page.request.delete(`/api/competitions/fixtures/${f.id}`);
    }
  });
});
