const { test, expect } = require('@playwright/test');

// Wave 9 (pre-OS refinement) §8.2 — Fixture never had a canonical Data
// Platform link at all before this (every other core entity did). Same
// reasoning as canonical-links.spec.js: a real link requires a real
// Data Platform Fixture between two already-canonically-linked Teams,
// which this suite's throwaway test data has no live counterpart for.
// What's safe and CI-portable regardless of Data Platform reachability:
// no canonical link degrades cleanly everywhere it's read, never an error.
test.describe('Canonical Fixture/Match linking', () => {
  test('the admin panel shows "not linked" and "no candidates" for a fixture whose clubs have no canonical Team link', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const competition = competitions[0];
    const stamp = Date.now();
    const fixtureRes = await page.request.post(`/api/competitions/${competition.id}/fixtures`, {
      data: { homeTeam: `E2E Canonical Home ${stamp}`, awayTeam: `E2E Canonical Away ${stamp}`, kickoff: '2026-11-01T15:00:00.000Z' },
    });
    expect(fixtureRes.ok()).toBe(true);
    const { fixture } = await fixtureRes.json();

    // Direct API check first — real, unmocked, against this repo's own
    // route (not the Data Platform, which the candidates lookup fails
    // soft against without ever calling out — both clubs are unresolved).
    const linkRes = await page.request.get(`/api/competitions/fixtures/${fixture.id}/canonical-fixture`);
    expect(linkRes.ok()).toBe(true);
    expect((await linkRes.json()).canonicalFixture).toBeNull();

    const candidatesRes = await page.request.get(`/api/competitions/fixtures/${fixture.id}/canonical-fixture-candidates`);
    expect(candidatesRes.ok()).toBe(true);
    expect((await candidatesRes.json()).candidates).toEqual([]);

    // And through the real admin UI.
    await page.goto(`/admin/competitions.html`);
    const row = page.locator(`.fixture-admin-row[data-fixture-id="${fixture.id}"]`);
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('.canonical-fixture-toggle-btn').click();
    const panel = row.locator('.canonical-fixture-panel');
    await expect(panel).toContainText('Not linked.');
    await expect(panel).toContainText('No candidates found');

    await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
  });

  test('the public match page degrades cleanly with no canonical link — local score, no crash', async ({ page }) => {
    // Fixture creation/scoring are admin-gated writes — log in first, same
    // as the previous test. The match page itself is read below via a
    // fresh, unauthenticated navigation, since GET /match.html is public.
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const stamp = Date.now();
    const fixtureRes = await page.request.post(`/api/competitions/${competitions[0].id}/fixtures`, {
      data: { homeTeam: `E2E Match Home ${stamp}`, awayTeam: `E2E Match Away ${stamp}`, kickoff: '2026-11-02T15:00:00.000Z' },
    });
    const { fixture: created } = await fixtureRes.json();
    await page.request.put(`/api/competitions/fixtures/${created.id}`, { data: { homeScore: 2, awayScore: 1, status: 'FINISHED' } });

    const fixtureDetailRes = await page.request.get(`/api/fixtures/${created.id}`);
    expect(fixtureDetailRes.ok()).toBe(true);
    const { fixture } = await fixtureDetailRes.json();
    expect(fixture.canonicalFixture).toBeNull();

    await page.goto(`/match.html?id=${created.id}`);
    await expect(page.locator('#match-root')).toContainText('2 – 1');
    await expect(page.locator('#match-root')).not.toContainText('Verified via the Underdawgs Sports Data platform');

    await page.request.delete(`/api/competitions/fixtures/${created.id}`);
  });
});
