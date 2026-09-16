const { test, expect } = require('@playwright/test');

// Wave 3 — notification foundation. See playwright.config.js for the
// throwaway test VAPID keypair this suite runs against.
//
// Confirmed directly (not assumed): Playwright's bundled Chromium test
// build has no real Google API keys embedded, so a genuine
// PushManager.subscribe() call always fails here with "push service not
// available" — a build-level restriction of the test browser itself, not
// a bug in this app or something a persistent (non-incognito) profile
// works around (tried that first; it doesn't — confirmed the actual
// error changes from an incognito-specific one to this once the profile
// is real). Real Chrome/Firefox/Safari on a real device has no such
// restriction. So this test verifies what's actually true in this
// environment: the real client code (public/js/push.js) reaches the
// browser's Push API — fetches the VAPID key, requests permission, waits
// on the service worker, calls subscribe() — and fails visibly and
// recoverably rather than hanging or leaving the button stuck.
test.describe('Push notifications', () => {
  test('the footer control reaches the real Push API and fails visibly, not silently, when subscribe is rejected', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    let alertMessage = null;
    page.on('dialog', (dialog) => { alertMessage = dialog.message(); dialog.accept(); });

    await page.goto('/index.html');

    const btn = page.locator('#push-toggle-btn');
    await expect(btn).toBeVisible({ timeout: 10000 });
    await expect(btn).toHaveText('🔔 Enable Notifications');

    await btn.click();
    await expect.poll(() => alertMessage, { timeout: 10000 }).not.toBeNull();
    expect(alertMessage.length).toBeGreaterThan(0);

    // Recovers to a clean, clickable state rather than getting stuck —
    // real for a genuinely offline device too, not just this test build.
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveText('🔔 Enable Notifications');
  });

  test('a fixture result never fails to save even when the only subscriber is unreachable', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.name === 'Kenyan Premier League');
    expect(kpl).toBeTruthy();

    // A device that follows this competition and has a push subscription
    // pointed at a real-shaped but undeliverable endpoint — sendNotification
    // will genuinely fail against it, exercising the catch path in
    // server/lib/push.js for real, not by mocking it away.
    const anonymousId = `e2etest${Date.now()}`;
    await page.request.post('/api/follows', {
      data: { anonymousId, entityType: 'competition', entitySlug: kpl.slug, name: kpl.name, href: `/competition.html?slug=${kpl.slug}` },
    });
    await page.request.post('/api/push/subscribe', {
      data: {
        anonymousId,
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-test-endpoint-not-real',
          keys: { p256dh: 'BNJxw7sd9OQKrLLsO0tzjhBjjkgemGXBqQwPWzREYhZS8kFXHTKCwlz9WmMXpAJXOOZLBUqvNoRhmrGmgUOtqBM', auth: 'FPssNDTKnInHVndSTdbKFw' },
        },
      },
    });

    const fixtureRes = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, {
      data: { homeTeam: 'Push Test Home FC', awayTeam: 'Push Test Away FC', kickoff: '2026-10-01T15:00:00.000Z' },
    });
    const { fixture } = await fixtureRes.json();

    const updateRes = await page.request.put(`/api/competitions/fixtures/${fixture.id}`, {
      data: { homeScore: 2, awayScore: 1, status: 'FINISHED' },
    });
    expect(updateRes.ok()).toBe(true);
    const { fixture: updated } = await updateRes.json();
    expect(updated.status).toBe('FINISHED');
  });
});

// Wave 7 — generalizes the single fixture-result pathway above into a
// reusable "publish → notify followers" mechanism (server/lib/events.js).
// Same real-failure-path philosophy as the fixture-result test: a
// genuinely undeliverable subscription must never affect the publish
// response, and this exercises notifyArticlePublished for real (a real
// DB read of the article's tags), not mocked away.
test.describe('Article publish notifications', () => {
  test('publishing an article tagged to a followed competition never fails to save even when the only subscriber is unreachable', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.name === 'Kenyan Premier League');
    expect(kpl).toBeTruthy();
    const { sports } = await page.request.get('/api/sports').then((r) => r.json());
    const { authors } = await page.request.get('/api/authors').then((r) => r.json());
    expect(sports.length).toBeGreaterThan(0);
    expect(authors.length).toBeGreaterThan(0);

    const anonymousId = `e2etest-article-${Date.now()}`;
    await page.request.post('/api/follows', {
      data: { anonymousId, entityType: 'competition', entitySlug: kpl.slug, name: kpl.name, href: `/competition.html?slug=${kpl.slug}` },
    });
    await page.request.post('/api/push/subscribe', {
      data: {
        anonymousId,
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-test-article-endpoint-not-real',
          keys: { p256dh: 'BNJxw7sd9OQKrLLsO0tzjhBjjkgemGXBqQwPWzREYhZS8kFXHTKCwlz9WmMXpAJXOOZLBUqvNoRhmrGmgUOtqBM', auth: 'FPssNDTKnInHVndSTdbKFw' },
        },
      },
    });

    const createRes = await page.request.post('/api/articles', {
      data: {
        title: `E2E Push Article ${Date.now()}`,
        dek: 'Exercises the publish-notification path end to end.',
        body: 'Body text.',
        sportId: sports[0].id,
        authorId: authors[0].id,
        status: 'PUBLISHED',
        competitionIds: [kpl.id],
      },
    });
    expect(createRes.ok()).toBe(true);
    const { article } = await createRes.json();
    expect(article.status).toBe('PUBLISHED');

    await page.request.delete(`/api/articles/${article.id}`);
  });
});
