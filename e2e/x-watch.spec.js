const { test, expect } = require('@playwright/test');

// X watch (2026-10-19): posts reported by the watcher are parsed into
// scores and compared with our own fixtures. Real seeded data and admin
// session; the watcher itself (it drives X) is not run here — its reports
// are sent the same way it sends them, to /api/watch/ingest.
test.describe('X watch dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');
  });

  test('only the watcher token or an editor can report, and only for watched accounts', async ({ page, request }) => {
    expect((await request.post('/api/watch/ingest', { data: { handle: 'anyone', posts: [] } })).status()).toBe(401);
    expect((await request.get('/api/watch/accounts')).status()).toBe(401);
    expect((await request.get('/api/watch/accounts', { headers: { 'x-watch-token': 'short' } })).status()).toBe(401);
    expect((await page.request.post('/api/watch/ingest', { data: { handle: 'not_watched_here', posts: [] } })).status()).toBe(404);
    expect((await page.request.post('/api/watch/accounts', { data: { handle: 'bad handle!' } })).status()).toBe(400);
  });

  test('scores in posts are compared with our fixtures: not entered, matches, differs, no fixture', async ({ page }) => {
    const stamp = Date.now();
    const handle = `e2e_${String(stamp).slice(-8)}`;
    await page.request.post('/api/watch/accounts', { data: { handle, displayName: 'E2E Reporter' } });

    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.slug === 'kenyan-premier-league');
    const home = `Watch Home ${stamp}`;
    const away = `Watch Away ${stamp}`;
    const kickoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { fixture } = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, { data: { homeTeam: home, awayTeam: away, kickoff } }).then((r) => r.json());

    const postedAt = new Date().toISOString();
    const id = String(stamp);
    const res = await page.request.post('/api/watch/ingest', {
      data: {
        handle,
        status: 'OK',
        posts: [
          { url: `https://x.com/${handle}/status/${id}1`, text: `FT: ${home} 2-1 ${away} #FKFPL`, postedAt },
          { url: `https://x.com/${handle}/status/${id}2`, text: `FULL TIME RESULTS\nNowhere Rovers ${stamp} 3-0 Phantom FC ${stamp}`, postedAt },
          { url: `https://x.com/${handle}/status/${id}3`, text: 'Matchday 2 runs 17-18 October across eight venues', postedAt },
          { url: `https://x.com/${handle}/status/${id}4`, text: `Starting XI vs ${away}: Ochieng, Omondi`, postedAt },
          { url: 'https://example.com/not-x/status/1', text: 'FT: A 1-0 B', postedAt },
        ],
      },
    }).then((r) => r.json());
    expect(res.created).toBe(4);
    expect(res.rejected).toHaveLength(1);

    const load = async () => (await page.request.get('/api/watch/posts?status=all').then((r) => r.json())).posts
      .filter((p) => p.account.handle === handle);
    let posts = await load();
    const byId = (suffix) => posts.find((p) => p.postId === `${id}${suffix}`);
    expect(byId(1)).toMatchObject({ kind: 'RESULT', verdict: 'NOT_ENTERED' });
    expect(byId(2)).toMatchObject({ verdict: 'NO_FIXTURE' });
    expect(byId(3)).toMatchObject({ kind: 'NEWS', verdict: 'NONE' }); // "17-18 October" is not a score
    expect(byId(4)).toMatchObject({ kind: 'LINEUP', verdict: 'NONE' });

    try {
      // Enter the same result: it now matches.
      await page.request.put(`/api/competitions/${kpl.id}/fixtures/results`, { data: { results: [{ fixtureId: fixture.id, homeScore: 2, awayScore: 1 }] } });
      posts = await load();
      expect(byId(1).verdict).toBe('MATCHES');
      // A different score: flagged.
      // Changing a published result is a correction and needs a reason (2026-10-19).
      await page.request.put(`/api/competitions/${kpl.id}/fixtures/results`, { data: { results: [{ fixtureId: fixture.id, homeScore: 1, awayScore: 1 }], corrections: { [fixture.id]: 'e2e: test a differing score' } } });
      posts = await load();
      expect(byId(1).verdict).toBe('DIFFERS');

      // The admin page shows it under "Needs attention".
      await page.goto('/admin/watch.html');
      const row = page.locator(`tr[data-post-id="${byId(1).id}"]`);
      await expect(row).toContainText('Differs from ours');
      await expect(row).toContainText(`Ours: ${home} 1–1 ${away}`);
      await row.locator('.post-status-btn[data-status="DONE"]').click();
      await expect(page.locator(`tr[data-post-id="${byId(1).id}"]`)).toHaveCount(0);

      // A watcher that hit a wall shows as stopped.
      await page.request.post('/api/watch/ingest', { data: { handle, status: 'BLOCKED', error: 'X showed a challenge' } });
      await page.reload();
      await expect(page.locator('#watcher-banner')).toContainText('The watcher stopped');
    } finally {
      const { accounts } = await page.request.get('/api/watch/accounts').then((r) => r.json());
      const account = accounts.find((a) => a.handle === handle);
      if (account) await page.request.put(`/api/watch/accounts/${account.id}`, { data: { isActive: false } });
      await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
    }
  });
});
