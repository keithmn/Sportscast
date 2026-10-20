const { test, expect } = require('@playwright/test');

// Clubs & Players (rebuilt 2026-10-20): edit a club's details and crest,
// link an unlinked fixture name to it, and add a player — at phone size.
test.describe('Clubs page', () => {
  test('edit a club, link a fixture name to it, add a player — on a phone', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.slug === 'kenyan-premier-league');
    const stamp = Date.now();
    const { club } = await page.request.post('/api/clubs', { data: { name: `Phone Town ${stamp}`, competitionId: kpl.id } }).then((r) => r.json());
    const nick = `PTFC${stamp}`;
    const { fixture } = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: { homeTeam: nick, awayTeam: 'Somebody Else', kickoff: '2026-12-30T15:00' } }).then((r) => r.json());
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/admin/clubs.html?club=${club.slug}`);
      await expect(page.locator('.club-editor h2')).toHaveText(`Phone Town ${stamp}`);
      await page.fill('#cl-venue', 'Phone Town Stadium');
      await page.fill('#cl-crest', '/brand/favicon/favicon-192.png');
      await page.click('#cl-save');
      await expect(page.locator('#cl-msg')).toContainText('Saved');
      const { club: saved } = await page.request.get(`/api/clubs/${club.slug}`).then((r) => r.json());
      expect(saved).toMatchObject({ venue: 'Phone Town Stadium', crestUrl: '/brand/favicon/favicon-192.png' });

      await page.fill('#cl-alias', nick);
      await page.click('#cl-alias-add');
      await expect(page.locator('#cl-alias-msg')).toContainText('linked');
      expect((await page.request.get(`/api/fixtures/${fixture.id}`).then((r) => r.json())).fixture.homeClubId).toBe(club.id);

      const squad = page.locator('[data-section="squad"]');
      await squad.locator('.person-row[data-id=""] summary').click(); // the empty "New player" row
      const newPlayer = squad.locator('.person-row[data-id=""]');
      await newPlayer.locator('[data-p="name"]').fill(`Phone Player ${stamp}`);
      await newPlayer.locator('.person-save').click();
      await expect(page.locator('[data-section="squad"] h3')).toHaveText('Squad · 1');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally {
      await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
      await page.request.delete(`/api/clubs/${club.id}`);
    }
  });
});
