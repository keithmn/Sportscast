const { test, expect } = require('@playwright/test');

// Trust and rights (2026-10-20): rights records stay internal, legal hold
// takes a competition off the site, tables say when they were updated and
// where the data comes from, match reports are checked against results,
// and the coverage report measures freshness.
async function signIn(page) {
  await page.goto('/admin/index.html');
  await page.fill('#email', 'admin@underdoggs.co.ke');
  await page.fill('#password', 'underdoggs2026');
  await page.click('button:has-text("Sign In")');
  await page.waitForURL('**/admin/dashboard.html');
}

test.describe('Trust and rights', () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

  test('rights are internal; legal hold takes a competition off the site and keeps it off', async ({ page, request }) => {
    const { sports } = await page.request.get('/api/sports').then((r) => r.json());
    const { competition } = await page.request.post('/api/competitions', { data: { name: `Rights Test ${Date.now()}`, sportId: sports.find((s) => s.name === 'Football').id, confirmNew: true } }).then((r) => r.json());
    await page.request.put(`/api/competitions/${competition.id}/rights`, { data: { status: 'PERMISSION_PENDING', notes: 'SECRET internal note' } });
    const pub = await request.get(`/api/competitions/${competition.slug}`).then((r) => r.text());
    expect(pub).not.toContain('SECRET internal note');
    expect(pub).not.toContain('PERMISSION_PENDING');

    await page.request.put(`/api/competitions/${competition.id}/rights`, { data: { status: 'LEGAL_HOLD' } });
    expect((await request.get(`/api/competitions/${competition.slug}`)).status()).toBe(404);
    const show = await page.request.put(`/api/competitions/${competition.id}/active`, { data: { isActive: true } });
    expect(show.status()).toBe(409);
    expect((await show.json()).error).toContain('legal hold');
  });

  test('a table says when it was updated and where it comes from', async ({ page }) => {
    const { sports } = await page.request.get('/api/sports').then((r) => r.json());
    const { competition } = await page.request.post('/api/competitions', { data: { name: `Stamp Test ${Date.now()}`, sportId: sports.find((s) => s.name === 'Football').id, confirmNew: true } }).then((r) => r.json());
    try {
      await page.request.put(`/api/competitions/${competition.id}/standings`, { data: { rows: [{ teamName: 'Stamp FC', played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 1, goalsAgainst: 0, points: 3 }] } });
      await page.request.put(`/api/competitions/${competition.id}/details`, { data: { attribution: 'Data: Stamp Federation' } });
      await page.goto(`/competition.html?slug=${competition.slug}`);
      await expect(page.locator('.table-stamp')).toContainText(/Updated \d+ \w+, \d\d:\d\d · Data: Stamp Federation/);
    } finally {
      await page.request.put(`/api/competitions/${competition.id}/active`, { data: { isActive: false } });
    }
  });

  test('a match report whose score disagrees with the result is caught', async ({ page }) => {
    const [{ competitions }, { sports }, { authors }] = await Promise.all([
      page.request.get('/api/competitions').then((r) => r.json()), page.request.get('/api/sports').then((r) => r.json()), page.request.get('/api/authors').then((r) => r.json()),
    ]);
    const kpl = competitions.find((c) => c.slug === 'kenyan-premier-league');
    const stamp = Date.now();
    const { fixture } = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: { homeTeam: `Checkers ${stamp}`, awayTeam: `Rivals ${stamp}`, kickoff: new Date(Date.now() - 5 * 3600000).toISOString() } }).then((r) => r.json());
    await page.request.put(`/api/competitions/${kpl.id}/fixtures/results`, { data: { results: [{ fixtureId: fixture.id, homeScore: 2, awayScore: 2 }] } });
    const story = { title: `Checkers ${stamp} 2-1 Rivals ${stamp}`, dek: 'Report', body: 'A tight game.', sportId: sports.find((s) => s.slug === 'football').id, authorId: authors[0].id, status: 'PUBLISHED', fixtureId: fixture.id };
    let id = null;
    try {
      const caught = await page.request.post('/api/articles', { data: story });
      expect(caught.status()).toBe(409);
      expect((await caught.json()).warnings[0]).toContain('the result on the site is');
      ({ article: { id } } = await page.request.post('/api/articles', { data: { ...story, confirm: true } }).then((r) => r.json()));
      const { mismatches } = await page.request.get('/api/articles/admin/score-mismatches').then((r) => r.json());
      expect(mismatches.map((m) => m.id)).toContain(id);
      await page.goto('/admin/dashboard.html');
      await expect(page.locator('#dashboard-root')).toContainText('Story disagrees with the result');
    } finally {
      if (id) await page.request.delete(`/api/articles/${id}`);
      await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
    }
  });

  test('match pages carry a real title and schema.org SportsEvent data, and are in the sitemap', async ({ page, request }) => {
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.slug === 'kenyan-premier-league');
    const stamp = Date.now();
    const { fixture } = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: { homeTeam: `Schema Home ${stamp}`, awayTeam: `Schema Away ${stamp}`, kickoff: new Date(Date.now() - 5 * 3600000).toISOString(), venue: `Schema Ground ${stamp}` } }).then((r) => r.json());
    try {
      await page.request.put(`/api/competitions/${kpl.id}/fixtures/results`, { data: { results: [{ fixtureId: fixture.id, homeScore: 3, awayScore: 1 }] } });
      const html = await request.get(`/match.html?id=${fixture.id}`).then((r) => r.text());
      expect(html).toContain(`<title>Schema Home ${stamp} 3–1 Schema Away ${stamp} — Kenyan Premier League — The Sportscast</title>`);
      const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
      expect(ld).toMatchObject({ '@type': 'SportsEvent', homeTeam: { name: `Schema Home ${stamp}` }, location: { name: `Schema Ground ${stamp}` } });
      expect(await request.get('/sitemap.xml').then((r) => r.text())).toContain(`match.html?id=${fixture.id}`);
    } finally {
      await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
    }
  });

  test('the coverage report measures results, freshness and details per competition', async ({ page }) => {
    const { rows } = await page.request.get('/api/competitions/admin/coverage?days=30').then((r) => r.json());
    expect(Array.isArray(rows)).toBe(true);
    await page.goto('/admin/coverage.html');
    await expect(page.locator('#coverage-root')).not.toContainText('Loading', { timeout: 10000 });
    if (rows.length) await expect(page.locator('.cov-card').first()).toBeVisible();
  });
});
