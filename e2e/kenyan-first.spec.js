const { test, expect } = require('@playwright/test');

// Kenyan-first coverage (2026-10-17): a competition with isActive false —
// the foreign club leagues, e.g. the English Premier League — must be gone
// from every public page and API, its clubs and players included, while
// editors can still open and re-enable it. Real seeded data, real admin
// session; the anonymous checks use the cookie-less `request` fixture.
test.describe('Kenyan-first coverage — hidden competitions', () => {
  let premierLeague;
  let club;
  let player;

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');
    const { competitions } = await page.request.get('/api/competitions?includeInactive=1').then((r) => r.json());
    premierLeague = competitions.find((c) => c.slug === 'premier-league');
  });

  test('the seed hides foreign club leagues and keeps Kenyan and international ones', async ({ request }) => {
    expect(premierLeague).toBeTruthy();
    expect(premierLeague.isActive).toBe(false);
    const names = (await request.get('/api/competitions?sport=football&includeInactive=1').then((r) => r.json())).competitions.map((c) => c.name);
    expect(names).toContain('Kenyan Premier League');
    expect(names).toContain('FIFA World Cup');
    expect(names).toContain('CHAN');
    expect(names).not.toContain('Premier League'); // includeInactive is ignored for the public
    expect(names).not.toContain('Bundesliga');
  });

  test('a hidden competition, its club and its player are invisible to the public but open for editors', async ({ page, request }) => {
    const stamp = Date.now();
    ({ club } = await page.request.post('/api/clubs', { data: { name: `Hidden Club ${stamp}`, competitionId: premierLeague.id } }).then((r) => r.json()));
    ({ player } = await page.request.post(`/api/clubs/${club.id}/players`, { data: { name: `Hidden Player ${stamp}` } }).then((r) => r.json()));
    try {
      // Public: every route 404s or omits it.
      expect((await request.get('/api/competitions/premier-league')).status()).toBe(404);
      expect((await request.get(`/api/clubs/${club.slug}`)).status()).toBe(404);
      expect((await request.get(`/api/clubs/players/${player.slug}`)).status()).toBe(404);
      const clubList = (await request.get('/api/clubs').then((r) => r.json())).clubs.map((c) => c.slug);
      expect(clubList).not.toContain(club.slug);
      const search = await request.get(`/api/search?q=${encodeURIComponent(`Hidden Club ${stamp}`)}`).then((r) => r.json());
      expect(JSON.stringify(search)).not.toContain(club.slug);
      const sitemap = await request.get('/sitemap.xml').then((r) => r.text());
      expect(sitemap).not.toContain('slug=premier-league');
      expect(sitemap).not.toContain(club.slug);
      // Server-rendered pages fall back to the plain shell: no real title.
      const html = await request.get(`/player.html?slug=${player.slug}`).then((r) => r.text());
      expect(html).not.toContain(`Hidden Player ${stamp}`);

      // Editors still get through.
      expect((await page.request.get('/api/competitions/premier-league')).status()).toBe(200);
      expect((await page.request.get(`/api/clubs/players/${player.slug}`)).status()).toBe(200);

      // Switching it on makes it public; switching it off hides it again.
      await page.request.put(`/api/competitions/${premierLeague.id}/active`, { data: { isActive: true } });
      expect((await request.get(`/api/clubs/players/${player.slug}`)).status()).toBe(200);
      await page.request.put(`/api/competitions/${premierLeague.id}/active`, { data: { isActive: false } });
      expect((await request.get(`/api/clubs/players/${player.slug}`)).status()).toBe(404);
    } finally {
      await page.request.put(`/api/competitions/${premierLeague.id}/active`, { data: { isActive: false } });
      if (player) await page.request.delete(`/api/clubs/players/${player.id}`);
      if (club) await page.request.delete(`/api/clubs/${club.id}`);
    }
  });
});
