const { test, expect } = require('@playwright/test');

// Wave 4 — this app had no public search of any kind before this (the
// only prior "search" was an admin-only canonical-entity proxy). Real
// seed data (prisma/seed.js), not fixtures — same golden-path convention
// as public-site.spec.js.
test.describe('Public search', () => {
  test('is reachable from the main nav', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.nav-links a', { hasText: 'Search' })).toBeVisible();
    await page.click('.nav-links a:has-text("Search")');
    await page.waitForURL('**/search.html');
  });

  test('finds a real seeded story and the link resolves', async ({ page }) => {
    await page.goto('/search.html');
    await page.fill('#search-input', 'Kenyan');
    await page.click('button:has-text("Search")');
    await page.waitForURL('**/search.html?q=Kenyan');

    await expect(page.locator('.section-label', { hasText: 'Stories' })).toBeVisible();
    const link = page.locator('a[href*="/article.html?slug="]').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');

    await page.goto(href);
    await expect(page.locator('.page-title, .article-header h1')).not.toHaveCount(0);
  });

  test('degrades cleanly on no matches, not an error', async ({ page }) => {
    await page.goto('/search.html?q=zzzznosuchthingatallzzzz');
    await expect(page.locator('.empty-state', { hasText: 'No matches found' })).toBeVisible();
  });

  test('a too-short query shows a clear message, not a false "unavailable"', async ({ page }) => {
    await page.goto('/search.html?q=a');
    await expect(page.locator('.empty-state', { hasText: 'Type at least 2 characters' })).toBeVisible();
  });

  // Wave 9 §8.3 — canonical results are a real, live network call to the
  // production Data Platform (searchCanonical, same fail-soft function
  // the admin picker uses) — not mocked. What's safe and CI-portable
  // regardless of whether it's reachable or has a match for this exact
  // query: the response always has the `canonical` key (null or populated,
  // never missing/erroring), and a no-canonical-matches query still
  // degrades to the same clean "No matches found" state as before.
  test('search response includes a canonical results key, real network call, fails soft', async ({ request }) => {
    const res = await request.get('/api/search?q=Kenyan');
    expect(res.ok()).toBe(true);
    const { results } = await res.json();
    expect('canonical' in results).toBe(true);
    expect(results.canonical === null || typeof results.canonical === 'object').toBe(true);
    if (results.canonical) {
      expect(Array.isArray(results.canonical.teams)).toBe(true);
      expect(Array.isArray(results.canonical.athletes)).toBe(true);
      expect(Array.isArray(results.canonical.competitions)).toBe(true);
    }
  });

  test('a no-canonical-matches query still degrades to "No matches found", not an error', async ({ page }) => {
    await page.goto('/search.html?q=zzzznosuchthingatallzzzz');
    await expect(page.locator('.empty-state', { hasText: 'No matches found' })).toBeVisible();
  });
});
