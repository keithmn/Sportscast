const { test, expect } = require('@playwright/test');

// Jurisdictional categorization (2026-10-17): competitions are grouped by
// level — County, Schools & Universities, National, Regional, Continental,
// Global — instead of the old League/Cup/Continental/International mix.
// Real seeded data, real admin session, no mocked responses.
test.describe('Competition jurisdiction levels', () => {
  test('the seed classifies competitions and the API carries the level labels', async ({ request }) => {
    const { competitions, classification } = await request.get('/api/competitions?sport=football').then((r) => r.json());
    expect(classification.jurisdictions.map((j) => j.label)).toEqual(
      ['County', 'Schools & Universities', 'National', 'Regional', 'Continental', 'Global'],
    );
    const bySlug = Object.fromEntries(competitions.map((c) => [c.slug, c]));
    expect(bySlug['kenyan-premier-league']).toMatchObject({ jurisdiction: 'NATIONAL', format: 'LEAGUE', teamType: 'CLUB', governingBody: 'FKF' });
    expect(bySlug['cecafa-senior-challenge-cup']).toMatchObject({ jurisdiction: 'REGIONAL', teamType: 'NATIONAL_TEAM', governingBody: 'CECAFA' });
    expect(bySlug['caf-champions-league']).toMatchObject({ jurisdiction: 'CONTINENTAL', teamType: 'CLUB', governingBody: 'CAF' });
    expect(bySlug['fifa-world-cup']).toMatchObject({ jurisdiction: 'GLOBAL', governingBody: 'FIFA' });
  });

  // The public lists hide competitions with nothing in their current
  // season, and the seeded database is mostly empty shells — so these give
  // one competition per level a real fixture first, and remove it after.
  const LEVEL_SAMPLES = ['kenyan-premier-league', 'national-super-league', 'fkf-division-one-zone-a', 'fkf-cup',
    'cecafa-senior-challenge-cup', 'africa-cup-of-nations', 'european-championship', 'fifa-world-cup'];
  async function signIn(page) {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');
  }
  async function giveData(page, slugs) {
    const { competitions } = await page.request.get('/api/competitions?includeInactive=1').then((r) => r.json());
    const ids = [];
    for (const slug of slugs) {
      const c = competitions.find((x) => x.slug === slug);
      const { fixture } = await page.request.post(`/api/competitions/${c.id}/fixtures`, {
        data: { homeTeam: `Level Home ${slug}`, awayTeam: `Level Away ${slug}`, kickoff: '2026-12-12T15:00' },
      }).then((r) => r.json());
      ids.push(fixture.id);
    }
    return ids;
  }
  async function removeData(page, ids) {
    for (const id of ids) await page.request.delete(`/api/competitions/fixtures/${id}`);
  }

  test('the football Competitions tab lists the levels in order, National first, Kenyan first within a level', async ({ page }) => {
    await signIn(page);
    const ids = await giveData(page, LEVEL_SAMPLES);
    try {
      await page.goto('/sport.html?sport=football&tab=competitions');
      const levels = page.locator('.jurisdiction-level');
      await expect(levels.first()).toBeVisible();
      expect(await levels.evaluateAll((els) => els.map((el) => el.dataset.jurisdiction))).toEqual(['NATIONAL', 'REGIONAL', 'CONTINENTAL', 'GLOBAL']);
      // AFCON (Kenya-involved) ahead of the Euros inside Continental.
      const continental = await page.locator('[data-jurisdiction="CONTINENTAL"] .card-title').allTextContents();
      expect(continental.indexOf('Africa Cup of Nations')).toBeLessThan(continental.indexOf('European Championship'));
      await expect(page.locator('[data-jurisdiction="CONTINENTAL"] .card-eyebrow').first()).toContainText('CAF');
      // Down the pyramid inside National: KPL (tier 1), NSL (2), Division One (3), then the FKF Cup.
      const national = await page.locator('[data-jurisdiction="NATIONAL"] .card-title').allTextContents();
      // (Relative order — other specs add their own test leagues.)
      expect(national.slice(0, 3)).toEqual(['Kenyan Premier League', 'National Super League', 'FKF Division One Zone A']);
      expect(national[national.length - 1]).toBe('FKF Cup');
      // Every Kenyan competition shows, even with nothing entered yet.
      expect(national).toContain('FKF Division One Zone B');
      expect(continental).toContain('CAF Champions League');
      // A non-Kenyan competition with no data this season stays off (rugby's Six Nations in the seed).
      await page.goto('/sport.html?sport=rugby&tab=competitions');
      await expect(page.locator('.jurisdiction-level').first()).toBeVisible();
      const rugby = await page.locator('.jurisdiction-level .card-title').allTextContents();
      expect(rugby).toContain('Rugby Africa Cup'); // Kenyan-region, empty in the seed — still listed
      expect(rugby).not.toContain('Six Nations Championship');
    } finally {
      await removeData(page, ids);
    }
  });

  test('the football Tables tab shows Kenyan tables open, KPL first, and every non-Kenyan table collapsed', async ({ page }) => {
    await signIn(page);
    const ids = await giveData(page, LEVEL_SAMPLES);
    try {
      await page.goto('/sport.html?sport=football&tab=tables');
      // The KPL leads as the full table.
      await expect(page.locator('.lead-table .card-title')).toHaveText('Kenyan Premier League');
      // Other Kenyan competitions follow as previews, in pyramid order.
      const previews = await page.locator('[data-kenya-tables] .mini-table-card .card-title').allTextContents();
      expect(previews.slice(0, 2)).toEqual(['National Super League', 'FKF Division One Zone A']);
      expect(previews).toContain('Africa Cup of Nations'); // Kenya-involved stays open
      // Kenyan competitions with no table yet are listed (not dropped), after the tables.
      await expect(page.locator('.not-started-item .not-started-name', { hasText: 'FKF Division One Zone B' })).toBeVisible();
      await expect(page.locator('.not-started-item .not-started-name', { hasText: 'CHAN' })).toBeVisible();
      // Non-Kenyan competitions are collapsed rows, not tables.
      const collapsed = page.locator('details.collapsed-competition');
      await expect(collapsed.locator('.collapsed-competition-name')).toHaveText(['European Championship', 'FIFA World Cup']);
      expect(await collapsed.evaluateAll((els) => els.every((d) => !d.open))).toBe(true);
      await expect(page.locator('.mini-table-card .card-title', { hasText: 'FIFA World Cup' })).toHaveCount(0);
      // Tapping one loads it.
      await collapsed.filter({ hasText: 'FIFA World Cup' }).locator('summary').click();
      await expect(collapsed.filter({ hasText: 'FIFA World Cup' }).locator('a.btn-link')).toBeVisible();
    } finally {
      await removeData(page, ids);
    }
  });

  test('the football Scores & Fixtures tab shows Kenyan games open and other competitions collapsed', async ({ page }) => {
    await signIn(page);
    const { competitions } = await page.request.get('/api/competitions?includeInactive=1').then((r) => r.json());
    const today = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10); // Nairobi calendar day
    const ids = [];
    for (const [slug, home] of [['kenyan-premier-league', 'Today KPL Home'], ['fifa-world-cup', 'Today WC Home']]) {
      const c = competitions.find((x) => x.slug === slug);
      const { fixture } = await page.request.post(`/api/competitions/${c.id}/fixtures`, {
        data: { homeTeam: home, awayTeam: `${home} Away`, kickoff: `${today}T23:30` },
      }).then((r) => r.json());
      ids.push(fixture.id);
    }
    try {
      await page.goto('/sport.html?sport=football&tab=scores');
      const list = page.locator('[data-fixtures-list]');
      await expect(list.locator('.section-label').first()).toHaveText('Kenyan Premier League');
      await expect(list.getByText('Today KPL Home', { exact: false })).toBeVisible();
      const other = list.locator('details.collapsed-competition', { hasText: 'FIFA World Cup' });
      await expect(other).toHaveCount(1);
      expect(await other.evaluate((d) => d.open)).toBe(false);
      await expect(list.getByText('Today WC Home', { exact: false })).toBeHidden();
      await other.locator('summary').click();
      await expect(list.getByText('Today WC Home', { exact: false })).toBeVisible();
    } finally {
      await removeData(page, ids);
    }
  });

  test('editors set the level when adding a competition and can change it later', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const { sports } = await page.request.get('/api/sports').then((r) => r.json());
    const football = sports.find((s) => s.name === 'Football');
    const name = `Nairobi County League ${Date.now()}`;
    const bad = await page.request.post('/api/competitions', { data: { name, sportId: football.id, jurisdiction: 'PLANETARY' } });
    expect(bad.status()).toBe(400);
    expect((await page.request.post('/api/competitions', { data: { name, sportId: football.id, tier: 0 } })).status()).toBe(400);

    const { competition } = await page.request.post('/api/competitions', {
      data: { name, sportId: football.id, jurisdiction: 'COUNTY', format: 'LEAGUE', teamType: 'CLUB', governingBody: '  FKF Nairobi  ' },
    }).then((r) => r.json());
    let countyFixtureId = null;
    let nationalIds = [];
    try {
      expect(competition).toMatchObject({ jurisdiction: 'COUNTY', governingBody: 'FKF Nairobi' });

      // Once it has a fixture, a County level appears on the Competitions tab, ahead of National.
      const { fixture: countyFixture } = await page.request.post(`/api/competitions/${competition.id}/fixtures`, {
        data: { homeTeam: 'Westlands County', awayTeam: 'Kibra County', kickoff: '2026-12-13T15:00' },
      }).then((r) => r.json());
      countyFixtureId = countyFixture.id;
      nationalIds = await giveData(page, ['kenyan-premier-league']);
      await page.goto('/sport.html?sport=football&tab=competitions');
      const levels = page.locator('.jurisdiction-level');
      await expect(levels.first()).toHaveAttribute('data-jurisdiction', 'COUNTY');
      await expect(levels.nth(1)).toHaveAttribute('data-jurisdiction', 'NATIONAL');

      // Change it from the competition's Settings tab.
      await page.goto(`/admin/competitions.html?competition=${competition.slug}&tab=settings`);
      const row = page.locator('.comp-settings');
      await expect(row.locator('[data-classification="jurisdiction"]')).toHaveValue('COUNTY', { timeout: 15000 });
      await row.locator('[data-classification="jurisdiction"]').selectOption('SCHOOLS');
      await row.locator('[data-classification="governingBody"]').fill('');
      await row.locator('[data-classification="tier"]').fill('2');
      await page.click('#set-save');
      await expect(page.locator('#set-msg')).toHaveText('Settings saved');
      const { competitions } = await page.request.get('/api/competitions?sport=football').then((r) => r.json());
      expect(competitions.find((c) => c.id === competition.id)).toMatchObject({ jurisdiction: 'SCHOOLS', tier: 2, governingBody: null });
    } finally {
      if (countyFixtureId) await page.request.delete(`/api/competitions/fixtures/${countyFixtureId}`);
      await removeData(page, nationalIds);
      // No delete route for competitions — hide it so it doesn't leak into later specs' public views.
      await page.request.put(`/api/competitions/${competition.id}/active`, { data: { isActive: false } });
    }
  });
});
