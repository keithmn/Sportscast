const { test, expect } = require('@playwright/test');

// Wave 7 — neither sitemap.xml nor robots.txt existed at all before this
// (confirmed: no file anywhere in public/, no route in server/). See
// server/routes/sitemap.js.
test.describe('sitemap.xml and robots.txt', () => {
  test('sitemap.xml lists static pages plus real published/active entities, absolute URLs', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('xml');
    const xml = await res.text();

    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://sportscast-production-c267.up.railway.app/</loc>');
    expect(xml).toContain('/news.html</loc>');

    const { competitions } = await request.get('/api/competitions').then((r) => r.json());
    expect(competitions.length).toBeGreaterThan(0);
    expect(xml).toContain(`/competition.html?slug=${competitions[0].slug}</loc>`);

    const { articles } = await request.get('/api/articles').then((r) => r.json());
    expect(articles.length).toBeGreaterThan(0);
    expect(xml).toContain(`/article.html?slug=${articles[0].slug}</loc>`);
    // Articles have a real updatedAt — lastmod should be present for them.
    expect(xml).toMatch(new RegExp(`article\\.html\\?slug=${articles[0].slug}</loc>\\s*<lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>`));

    // Deliberately excluded — high-cardinality, per the file's own comment.
    expect(xml).not.toContain('/player.html');
    expect(xml).not.toContain('/match.html');
  });

  test('robots.txt disallows admin/api and points at the real sitemap', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.ok()).toBe(true);
    const body = await res.text();
    expect(body).toContain('Disallow: /admin/');
    expect(body).toContain('Disallow: /api/');
    expect(body).toContain('Sitemap: https://sportscast-production-c267.up.railway.app/sitemap.xml');
  });
});
