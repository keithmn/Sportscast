const { test, expect } = require('@playwright/test');

// Wave 4 — this app is plain express.static with no server-side
// templating layer at all before this; club/player/competition pages
// were hardcoded noindex with a generic <title>, and article/show pages
// only ever got a real <title> client-side (too late for a crawler or
// social-preview bot). See server/routes/seoPages.js.
test.describe('Server-rendered SEO metadata', () => {
  test('a real competition gets a real title/description and loses noindex', async ({ page, request }) => {
    const { competitions } = await request.get('/api/competitions').then((r) => r.json());
    const target = competitions[0];

    const res = await request.get(`/competition.html?slug=${target.slug}`);
    const html = await res.text();
    expect(html).toContain(`<title>${target.name} — The Sportscast</title>`);
    expect(html).not.toContain('name="robots" content="noindex"');
    expect(html).toContain('property="og:title"');

    // And the page still actually works, not just the raw HTML.
    await page.goto(`/competition.html?slug=${target.slug}`);
    await expect(page).toHaveTitle(`${target.name} — The Sportscast`);
    await expect(page.locator('h1')).toContainText(target.name);
  });

  test('a nonexistent competition falls through to the generic static page, still noindex', async ({ request }) => {
    const res = await request.get('/competition.html?slug=no-such-competition-at-all-zzz');
    const html = await res.text();
    expect(html).toContain('<title>Competition — The Sportscast</title>');
    expect(html).toContain('name="robots" content="noindex"');
  });

  test('a published article gets a real title and description', async ({ page, request }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const { articles } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
    const published = articles.find((a) => a.status === 'PUBLISHED');
    expect(published).toBeTruthy();

    const res = await request.get(`/article.html?slug=${published.slug}`);
    const html = await res.text();
    expect(html).toContain(`<title>${published.title} — The Sportscast</title>`);
    expect(html).toContain(`content="${published.dek}"`);
  });
});
