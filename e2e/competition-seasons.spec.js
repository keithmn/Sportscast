const { test, expect } = require('@playwright/test');

// Wave 4 — Sportscast had no season concept at all tied to a Competition
// before this: every Fixture/StandingRow belonged only to a competition,
// with no way to keep last season's table around once this season's
// results started coming in. See server/lib/seasonResolution.js and the
// CompetitionSeason model in prisma/schema.prisma.
test.describe('Competition seasons', () => {
  test('starting a new season preserves the old one and scopes writes to the new one', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const { sports } = await page.request.get('/api/sports').then((r) => r.json());
    const football = sports.find((s) => s.name === 'Football');
    expect(football).toBeTruthy();

    const createRes = await page.request.post('/api/competitions', {
      data: { name: 'E2E Season Test League', sportId: football.id, category: 'LEAGUE' },
    });
    const { competition } = await createRes.json();

    // First fixture/standings write for a brand-new competition has no
    // season yet — getOrCreateCurrentSeason should create one on the fly.
    const fixtureRes = await page.request.post(`/api/competitions/${competition.id}/fixtures`, {
      data: { homeTeam: 'Season One FC', awayTeam: 'Season One Rivals', kickoff: '2026-09-01T15:00:00.000Z' },
    });
    const { fixture: seasonOneFixture } = await fixtureRes.json();
    await page.request.put(`/api/competitions/${competition.id}/standings`, {
      data: { rows: [{ teamName: 'Season One FC', played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 0, points: 3 }] },
    });

    let detail = await page.request.get(`/api/competitions/${competition.slug}`).then((r) => r.json());
    expect(detail.competition.seasons).toHaveLength(1);
    expect(detail.competition.seasons[0].isCurrent).toBe(true);
    expect(detail.competition.fixtures).toHaveLength(1);
    expect(detail.competition.standings).toHaveLength(1);
    const seasonOneId = detail.competition.seasons[0].id;

    // Start a new season through the real admin UI, not the API directly —
    // this is the one actual admin workflow being verified here.
    page.once('dialog', (dialog) => dialog.accept());
    await page.goto('/admin/competitions.html');
    const card = page.locator('.card', { has: page.locator(`text=${competition.name}`) });
    await card.locator('.new-season-label').fill('Season Two');
    await card.locator('.start-season-btn').click();
    await expect(card.locator('text=Season Two')).toBeVisible({ timeout: 10000 }); // loadCompetitions() re-render after the write resolves

    detail = await page.request.get(`/api/competitions/${competition.slug}`).then((r) => r.json());
    expect(detail.competition.seasons).toHaveLength(2);
    const seasonTwo = detail.competition.seasons.find((s) => s.isCurrent);
    expect(seasonTwo.label).toBe('Season Two');
    // The new season starts empty...
    expect(detail.competition.fixtures).toHaveLength(0);
    expect(detail.competition.standings).toHaveLength(0);

    // ...while season one's data is untouched, reachable via ?season=.
    const seasonOneDetail = await page.request.get(`/api/competitions/${competition.slug}?season=${seasonOneId}`).then((r) => r.json());
    expect(seasonOneDetail.competition.fixtures).toHaveLength(1);
    expect(seasonOneDetail.competition.fixtures[0].id).toBe(seasonOneFixture.id);
    expect(seasonOneDetail.competition.standings).toHaveLength(1);

    // A fixture added now attaches to season two, not season one.
    const secondFixtureRes = await page.request.post(`/api/competitions/${competition.id}/fixtures`, {
      data: { homeTeam: 'Season Two FC', awayTeam: 'Season Two Rivals', kickoff: '2026-10-01T15:00:00.000Z' },
    });
    const { fixture: seasonTwoFixture } = await secondFixtureRes.json();
    expect(seasonTwoFixture.seasonId).toBe(seasonTwo.id);

    // Public competition page: the season <select> appears and switching
    // it actually changes which fixtures/standings render.
    await page.goto(`/competition.html?slug=${competition.slug}`);
    await expect(page.locator('#season-select')).toBeVisible();
    await page.click('[data-sport-tabs] button[data-key="scores"]');
    await expect(page.locator(`a[href="/match.html?id=${seasonTwoFixture.id}"]`)).toBeVisible();

    await page.selectOption('#season-select', seasonOneId);
    await page.waitForURL(`**/competition.html?slug=${competition.slug}&season=${seasonOneId}`);
    await page.click('[data-sport-tabs] button[data-key="scores"]');
    await expect(page.locator(`a[href="/match.html?id=${seasonOneFixture.id}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/match.html?id=${seasonTwoFixture.id}"]`)).toHaveCount(0);
  });
});
