const { test, expect } = require('@playwright/test');

// Stories (2026-10-20): "Write the report" opens a match report already
// tagged with the match's competition and clubs, saving says what happened
// with a link to see it, and a broken cover image link is refused.
test.describe('Stories', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');
  });

  test('a match report opens pre-filled and tagged, and saving says where to see it', async ({ page }) => {
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.slug === 'kenyan-premier-league');
    const stamp = Date.now();
    const home = (await page.request.post('/api/clubs', { data: { name: `Report Home ${stamp}`, competitionId: kpl.id } }).then((r) => r.json())).club;
    const away = (await page.request.post('/api/clubs', { data: { name: `Report Away ${stamp}`, competitionId: kpl.id } }).then((r) => r.json())).club;
    const { fixture } = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: { homeTeam: home.name, awayTeam: away.name, kickoff: new Date(Date.now() - 5 * 3600000).toISOString() } }).then((r) => r.json());
    await page.request.put(`/api/competitions/${kpl.id}/fixtures/results`, { data: { results: [{ fixtureId: fixture.id, homeScore: 2, awayScore: 1 }] } });
    let articleId = null;
    try {
      await page.goto(`/admin/articles.html?new=1&fixture=${fixture.id}`);
      await expect(page.locator('#title')).toHaveValue(`${home.name} 2–1 ${away.name}`, { timeout: 10000 });
      await expect(page.locator(`.competition-checkbox[value="${kpl.id}"]`)).toBeChecked();
      await expect(page.locator(`.club-checkbox[value="${home.id}"]`)).toBeChecked();
      await expect(page.locator(`.club-checkbox[value="${away.id}"]`)).toBeChecked();
      await expect(page.locator('#fixture-current')).toContainText(home.name);

      await page.fill('#body', 'A test match report.');
      await page.click('#article-form button[type="submit"]');
      const banner = page.locator('#save-banner');
      await expect(banner).toContainText('Saved as a draft');
      await expect(banner.locator('a', { hasText: 'Preview' })).toHaveAttribute('href', /\/article\.html\?slug=/);
      const { articles } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
      const saved = articles.find((a) => a.title === `${home.name} 2–1 ${away.name}`);
      articleId = saved.id;
      expect(saved.fixtureId).toBe(fixture.id);
    } finally {
      if (articleId) await page.request.delete(`/api/articles/${articleId}`);
      await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
      for (const c of [home, away]) await page.request.delete(`/api/clubs/${c.id}`);
    }
  });

  test('a cover image link that does not open is refused before publishing', async ({ page }) => {
    const [{ sports }, { authors }] = await Promise.all([page.request.get('/api/sports').then((r) => r.json()), page.request.get('/api/authors').then((r) => r.json())]);
    const res = await page.request.post('/api/articles', { data: { title: `Broken cover ${Date.now()}`, dek: 'd', body: 'b', sportId: sports[0].id, authorId: authors[0].id, status: 'PUBLISHED', coverImageUrl: 'https://nonexistent-host.invalid/photo.jpg' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/^Cover image:/);
    const missingUpload = await page.request.post('/api/articles', { data: { title: `Missing upload ${Date.now()}`, dek: 'd', body: 'b', sportId: sports[0].id, authorId: authors[0].id, coverImageUrl: '/uploads/not-there.jpg' } });
    expect((await missingUpload.json()).error).toContain('missing');
  });
});
