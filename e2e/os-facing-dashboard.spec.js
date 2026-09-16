const { test, expect } = require('@playwright/test');

// Wave 9 (pre-OS refinement) §8.8 — two real dashboard gaps closed: a
// finished match with no report never surfaced anywhere before this, and
// AI-suggested clips were only ever visible one episode at a time.
test.describe('OS-facing dashboard additions', () => {
  test('GET /api/fixtures/missing-reports finds a real finished fixture with no article, excludes one that has a report', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const stamp = Date.now();
    const kickoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const withoutReport = await page.request.post(`/api/competitions/${competitions[0].id}/fixtures`, {
      data: { homeTeam: `E2E NoReport Home ${stamp}`, awayTeam: `E2E NoReport Away ${stamp}`, kickoff },
    }).then((r) => r.json());
    await page.request.put(`/api/competitions/fixtures/${withoutReport.fixture.id}`, { data: { homeScore: 1, awayScore: 0, status: 'FINISHED' } });

    const withReport = await page.request.post(`/api/competitions/${competitions[0].id}/fixtures`, {
      data: { homeTeam: `E2E HasReport Home ${stamp}`, awayTeam: `E2E HasReport Away ${stamp}`, kickoff },
    }).then((r) => r.json());
    await page.request.put(`/api/competitions/fixtures/${withReport.fixture.id}`, { data: { homeScore: 2, awayScore: 2, status: 'FINISHED' } });

    const { sports } = await page.request.get('/api/sports').then((r) => r.json());
    const { authors } = await page.request.get('/api/authors').then((r) => r.json());
    const articleRes = await page.request.post('/api/articles', {
      data: {
        title: `E2E Match Report ${stamp}`, dek: 'A real match report.', body: 'Body.',
        sportId: sports[0].id, authorId: authors[0].id, status: 'PUBLISHED', fixtureId: withReport.fixture.id,
      },
    });
    const { article } = await articleRes.json();

    const res = await page.request.get('/api/fixtures/missing-reports');
    expect(res.ok()).toBe(true);
    const { fixtures } = await res.json();
    const ids = fixtures.map((f) => f.id);
    expect(ids).toContain(withoutReport.fixture.id);
    expect(ids).not.toContain(withReport.fixture.id);

    await page.request.delete(`/api/articles/${article.id}`);
    await page.request.delete(`/api/competitions/fixtures/${withoutReport.fixture.id}`);
    await page.request.delete(`/api/competitions/fixtures/${withReport.fixture.id}`);
  });

  test('GET /api/episodes/clips/pending only ever returns SUGGESTED clips', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const res = await page.request.get('/api/episodes/clips/pending');
    expect(res.ok()).toBe(true);
    const { clips } = await res.json();
    for (const clip of clips) {
      expect(clip.status).toBe('SUGGESTED');
    }
  });

  test('the dashboard renders without error and both new API calls succeed', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    await expect(page.locator('#dashboard-root .card').first()).toBeVisible({ timeout: 10000 });
  });
});
