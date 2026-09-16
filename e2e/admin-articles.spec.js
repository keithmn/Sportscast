const { test, expect } = require('@playwright/test');

// Real CMS golden path: log in as the seeded demo admin (prisma/seed.js),
// create a genuinely new article through the actual admin form (no
// mocked API responses), publish it, then confirm it's independently
// visible on the real public-facing article page — not just present in
// the admin's own list, which alone wouldn't prove publishing actually
// works end to end.
test.describe('Admin — article CMS', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');
  });

  test('creates and publishes an article, visible on the public site', async ({ page }) => {
    const title = `E2E Test Article ${Date.now()}`;

    await page.goto('/admin/articles.html');
    // initArticlesPage() wires #new-article-btn's click handler only after
    // several awaited setup API calls resolve — wait for that to actually
    // finish (options populated) rather than racing a click against it.
    await expect(page.locator('#sportId option').first()).toBeAttached();
    await page.click('#new-article-btn');
    await expect(page.locator('#title')).toBeVisible();
    await page.fill('#title', title);
    await page.fill('#dek', 'A dek written entirely by the Playwright acceptance suite.');
    await page.fill('#body', 'This article exists only to prove the CMS create-and-publish path works end to end.');
    // Real seed data — first option in each dropdown, not a fabricated id.
    await page.selectOption('#sportId', { index: 0 });
    await page.selectOption('#authorId', { index: 0 });
    await page.selectOption('#status', 'PUBLISHED');
    await page.click('#article-form button[type="submit"]');

    // Saved (form closes) and the new row is now in the admin's own list.
    await expect(page.locator('#article-form')).toBeHidden();
    await expect(page.locator('#articles-tbody')).toContainText(title);

    const { articles } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
    const created = articles.find((a) => a.title === title);
    expect(created).toBeTruthy();
    expect(created.status).toBe('PUBLISHED');

    // The real proof this isn't just an admin-side illusion: the public,
    // unauthenticated article page independently renders it.
    await page.goto(`/article.html?slug=${created.slug}`);
    await expect(page.locator('.page-title')).toContainText(title);

    await page.request.delete(`/api/articles/${created.id}`);
  });

  // Wave 2 — the canonical-event picker (server/routes/canonicalSearch.js)
  // replaced a raw-UUID-paste field. This doesn't assert a real link
  // happens (that needs a real Data Platform Event to search for, which
  // this suite's throwaway SQLite DB has no equivalent counterpart for —
  // verified separately, live, against a real local Data Platform
  // instance rather than faked here). What's safe and CI-portable
  // regardless of whether the Data Platform is reachable from wherever
  // this runs: searching for something that matches nothing must degrade
  // to an empty state, never an error — same fail-soft contract
  // canonicalData.js documents for every other function in that file.
  test('canonical-event picker degrades cleanly when nothing matches', async ({ page }) => {
    await page.goto('/admin/articles.html');
    await expect(page.locator('#sportId option').first()).toBeAttached();
    await page.click('#new-article-btn');
    await page.fill('#title', `E2E Picker Test ${Date.now()}`);
    await page.fill('#dek', 'dek');
    await page.fill('#body', 'body');
    await page.selectOption('#sportId', { index: 0 });
    await page.selectOption('#authorId', { index: 0 });
    await page.selectOption('#status', 'PUBLISHED');
    await page.click('#article-form button[type="submit"]');
    await expect(page.locator('#article-form')).toBeHidden();

    const { articles } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
    const created = articles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    await page.click(`.edit-btn[data-id="${created.id}"]`);
    await expect(page.locator('#canonical-event-section')).toBeVisible();

    await page.fill('#canonical-event-search-input', 'zzz-no-such-event-should-ever-match-zzz');
    await expect(page.locator('#canonical-event-results')).toContainText('No matching events found.', { timeout: 5000 });
    await expect(page.locator('#canonical-event-error')).toBeHidden();

    await page.request.delete(`/api/articles/${created.id}`);
  });
});
