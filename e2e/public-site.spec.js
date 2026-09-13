const { test, expect } = require('@playwright/test');

// Golden-path smoke test for the public site — real seed data (prisma/
// seed.js), not fixtures/mocks, so this exercises the actual API + DB
// path a visitor hits, same as the CI boot check but through a real page.
test.describe('Public site', () => {
  test('homepage loads with real nav, brand, and footer', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page).toHaveTitle(/The Sportscast/);
    await expect(page.locator('.nav-logo')).toBeVisible();
    await expect(page.locator('.nav-links a', { hasText: 'Home' })).toBeVisible();
    await expect(page.locator('.footer-nav')).toBeVisible();
  });

  test('an activated sport appears on the public sports index', async ({ page, request }) => {
    // Sport.isActive defaults to false (flipped on by hand per sport, see
    // that field's own schema comment) — seed data alone never populates
    // this page, so the real golden path is: an admin activates a sport,
    // then it shows up here. Log in as the seeded demo admin to do that,
    // exactly like a real editor would via admin/sports.html.
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const { sports } = await page.request.get('/api/sports').then((r) => r.json());
    const target = sports[0];
    expect(target).toBeTruthy();
    await page.request.put(`/api/sports/${target.id}`, { data: { isActive: true } });

    await page.goto('/sports.html');
    await expect(page.locator(`#sports-root a[href*="sport=${target.slug}"]`)).toBeVisible();
  });

  test('manifest and service worker are wired on a public page', async ({ page }) => {
    await page.goto('/index.html');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBe('/manifest.json');
    const swRegistered = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg;
    });
    expect(swRegistered).toBe(true);
  });
});
