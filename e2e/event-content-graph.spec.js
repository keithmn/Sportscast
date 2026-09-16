const { test, expect } = require('@playwright/test');

// Wave 9 (pre-OS refinement) §8.4 — "what media outputs exist for this
// Event?" Same real-data-only precedent as canonical-links.spec.js/
// canonical-fixture.spec.js: this suite's throwaway DB has no real
// Article rows already linked to a real Data Platform Event to test the
// populated path against (linking one for real requires a live-verified
// Event id from the actual Data Platform — not fabricated here). What's
// safe and CI-portable regardless: a canonical Event id with no linked
// Articles returns an empty, valid list, never an error, and the admin
// panel stays correctly hidden when nothing is linked.
test.describe('Event → content graph', () => {
  test('GET /api/articles/by-event/:id returns an empty list for an Event nothing is linked to', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const res = await page.request.get('/api/articles/by-event/00000000-0000-0000-0000-000000000000');
    expect(res.ok()).toBe(true);
    const { articles } = await res.json();
    expect(articles).toEqual([]);
  });

  test('rejects an unauthenticated request', async ({ request }) => {
    const res = await request.get('/api/articles/by-event/00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(401);
  });

  test('the "Content for this Event" panel stays hidden on an article with no canonical Event linked', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    await page.goto('/admin/articles.html');
    await expect(page.locator('.edit-btn').first()).toBeVisible({ timeout: 10000 });
    await page.locator('.edit-btn').first().click();

    await expect(page.locator('#canonical-event-current')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#event-content-graph')).toBeHidden();
  });
});
