const { test, expect } = require('@playwright/test');

// Wave 2 — Club->Team and Player->Athlete canonical-link pickers
// (public/admin/js/clubs.js, server/routes/clubs.js's canonical-team/
// canonical-athlete routes). Same reasoning as e2e/admin-articles.spec.js's
// canonical-event test: a real link requires a real Data Platform Team/
// Athlete to search for, which this suite's throwaway SQLite DB has no
// live counterpart for (verified separately, live, against a real local
// Data Platform instance — not faked here). What's safe and CI-portable
// regardless of whether the Data Platform is reachable: a query matching
// nothing degrades to an empty state, never an error.
test.describe('Canonical links — Club/Player pickers', () => {
  test('club->Team and player->Athlete pickers both degrade cleanly when nothing matches', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const clubRes = await page.request.post('/api/clubs', { data: { name: `E2E Canonical Club ${Date.now()}`, competitionId: competitions[0].id } });
    const { club } = await clubRes.json();
    const playerRes = await page.request.post(`/api/clubs/${club.id}/players`, { data: { name: 'E2E Canonical Player' } });
    const { player } = await playerRes.json();

    await page.goto('/admin/clubs.html');
    const teamWidget = page.locator(`.canonical-link-widget[data-kind="team"][data-local-id="${club.id}"]`);
    await expect(teamWidget).toBeVisible();
    await teamWidget.locator('.canonical-search-input').fill('zzz-no-such-team-zzz');
    await expect(teamWidget.locator('.canonical-results')).toContainText('No matches found.', { timeout: 5000 });

    const athleteWidget = page.locator(`.canonical-link-widget[data-kind="athlete"][data-local-id="${player.id}"]`);
    await expect(athleteWidget).toBeVisible();
    await athleteWidget.locator('.canonical-search-input').fill('zzz-no-such-athlete-zzz');
    await expect(athleteWidget.locator('.canonical-results')).toContainText('No matches found.', { timeout: 5000 });

    await page.request.delete(`/api/clubs/${club.id}`);
  });
});
