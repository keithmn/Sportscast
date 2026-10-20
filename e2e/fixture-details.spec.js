const { test, expect } = require('@playwright/test');

// Match details (2026-10-17): venue / round / broadcaster on fixtures,
// entered by editors and shown publicly. Real seeded data, real admin
// session, no mocked responses — same convention as admin-wave4.spec.js.
test.describe('Fixture match details (venue, round, broadcaster)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');
  });

  test('bulk import carries venue/round/broadcaster, reuses venues, and the details show publicly', async ({ page }) => {
    const stamp = Date.now();
    const venue = `E2E Ground ${stamp}`;
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.name === 'Kenyan Premier League');
    // Kick-off well in the future so it lists as upcoming.
    const day = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const res = await page.request.post(`/api/competitions/${kpl.id}/fixtures/bulk`, {
      data: { fixtures: [
        { homeTeam: `Details Home ${stamp}`, awayTeam: `Details Away ${stamp}`, kickoff: `${day}T15:00`, venue, round: 'Matchweek 9', broadcaster: 'Azam TV' },
        // Different case/spacing — must reuse the same venue, not create a second one.
        { homeTeam: `Details Home2 ${stamp}`, awayTeam: `Details Away2 ${stamp}`, kickoff: `${day}T18:00`, venue: `  ${venue.toLowerCase()} ` },
      ] },
    });
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(body.createdVenues).toEqual([venue]);

    const { venues } = await page.request.get('/api/venues').then((r) => r.json());
    expect(venues.filter((v) => v.name.toLowerCase() === venue.toLowerCase())).toHaveLength(1);

    const { competition } = await page.request.get('/api/competitions/kenyan-premier-league').then((r) => r.json());
    const fixture = competition.fixtures.find((f) => f.homeTeam === `Details Home ${stamp}`);
    expect(fixture.venue.name).toBe(venue);
    expect(fixture.round).toBe('Matchweek 9');
    expect(fixture.broadcaster).toBe('Azam TV');
    // Bulk times are Nairobi time: 15:00 EAT is 12:00 UTC.
    expect(fixture.kickoff).toBe(`${day}T12:00:00.000Z`);

    await page.goto(`/match.html?id=${fixture.id}`);
    await expect(page.locator('.fixture-details-hub')).toHaveText(`Matchweek 9 · 15:00 · ${venue} · On Azam TV`);

    // Clearing the venue in an update removes it rather than keeping the old one.
    const cleared = await page.request.put(`/api/competitions/fixtures/${fixture.id}`, { data: { venue: '' } }).then((r) => r.json());
    expect(cleared.fixture.venueId).toBeNull();

    const other = competition.fixtures.find((f) => f.homeTeam === `Details Home2 ${stamp}`);
    for (const f of [fixture, other]) await page.request.delete(`/api/competitions/fixtures/${f.id}`);
  });

  test('re-pasting an existing fixture is skipped with a message, not a crash, and creates no stray venue', async ({ page }) => {
    const stamp = Date.now();
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.name === 'Kenyan Premier League');
    const line = { homeTeam: `Repaste Home ${stamp}`, awayTeam: `Repaste Away ${stamp}`, kickoff: '2026-12-05T15:00' };
    const first = await page.request.post(`/api/competitions/${kpl.id}/fixtures/bulk`, { data: { fixtures: [line] } }).then((r) => r.json());
    expect(first.created).toBe(1);

    const freshVenue = `Repaste Ground ${stamp}`;
    const res = await page.request.post(`/api/competitions/${kpl.id}/fixtures/bulk`, {
      data: { fixtures: [{ ...line, venue: freshVenue }, { ...line, homeTeam: `Repaste Home2 ${stamp}` }, { ...line, homeTeam: `Repaste Home2 ${stamp}` }] },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.errors.join(' ')).toContain('already exists');
    expect(body.errors.join(' ')).toContain('duplicates an earlier line');
    const { venues } = await page.request.get('/api/venues').then((r) => r.json());
    expect(venues.some((v) => v.name === freshVenue)).toBe(false);

    const { competition } = await page.request.get('/api/competitions/kenyan-premier-league').then((r) => r.json());
    for (const f of competition.fixtures.filter((x) => x.homeTeam.startsWith('Repaste Home'))) {
      await page.request.delete(`/api/competitions/fixtures/${f.id}`);
    }
  });

  test('saving the same fixture twice in one round is refused, so followers never get two full-time alerts', async ({ page }) => {
    const stamp = Date.now();
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.name === 'Kenyan Premier League');
    const { fixture } = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, {
      data: { homeTeam: `Twice Home ${stamp}`, awayTeam: `Twice Away ${stamp}`, kickoff: '2026-12-06T15:00' },
    }).then((r) => r.json());
    const res = await page.request.put(`/api/competitions/${kpl.id}/fixtures/results`, {
      data: { results: [{ fixtureId: fixture.id, homeScore: 1, awayScore: 0 }, { fixtureId: fixture.id, homeScore: 2, awayScore: 0 }] },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('more than once');
    // Basketball-sized scores are accepted — in a football league only after
    // the editor confirms the "unusually high score" warning (2026-10-19).
    const warned = await page.request.put(`/api/competitions/${kpl.id}/fixtures/results`, { data: { results: [{ fixtureId: fixture.id, homeScore: 102, awayScore: 87 }] } });
    expect(warned.status()).toBe(409);
    const ok = await page.request.put(`/api/competitions/${kpl.id}/fixtures/results`, { data: { results: [{ fixtureId: fixture.id, homeScore: 102, awayScore: 87 }], confirm: true } });
    expect(ok.status()).toBe(200);
    await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
  });

  test('admin fixture rows show and save venue/round/broadcaster, with a venue list', async ({ page }) => {
    const stamp = Date.now();
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.name === 'Kenyan Premier League');
    const { fixture } = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, {
      data: { homeTeam: `Row Home ${stamp}`, awayTeam: `Row Away ${stamp}`, kickoff: '2026-12-01T15:00', venue: `Row Ground ${stamp}` },
    }).then((r) => r.json());

    await page.goto(`/admin/competitions.html?competition=kenyan-premier-league&tab=fixtures&fixture=${fixture.id}`);
    const row = page.locator(`.fx-card[data-fixture-id="${fixture.id}"]`);
    await expect(row.locator('[data-f="venue"]')).toHaveValue(`Row Ground ${stamp}`, { timeout: 15000 });
    await expect(page.locator(`#venue-options option[value="Row Ground ${stamp}"]`)).toBeAttached();

    await row.locator('[data-f="round"]').fill('Matchweek 3');
    await row.locator('[data-f="broadcaster"]').fill('KBC');
    await row.locator('.fx-save').click();
    await expect(page.locator(`#fx-${fixture.id} .inline-msg`)).toHaveText('Saved');
    await expect.poll(async () => {
      const { competition } = await page.request.get('/api/competitions/kenyan-premier-league').then((r) => r.json());
      const f = competition.fixtures.find((x) => x.id === fixture.id);
      return `${f.round}|${f.broadcaster}|${f.venue?.name}`;
    }).toBe(`Matchweek 3|KBC|Row Ground ${stamp}`);

    await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
  });
});
