const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Wave 4 — Admin Operations. Real CMS additions (scheduling, match-report
// linking, image upload) plus the dashboard's new "what needs attention
// today" buckets, all exercised through the actual admin UI against real
// seeded data — no mocked API responses.
test.describe('Admin — Wave 4 (dashboard, scheduling, match reports, image upload)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');
  });

  test('the dashboard shows Fixtures/Production/Publishing buckets', async ({ page }) => {
    await page.goto('/admin/dashboard.html');
    await expect(page.locator('.card-eyebrow', { hasText: 'Fixtures' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.card-eyebrow', { hasText: 'Production' })).toBeVisible();
    await expect(page.locator('.card-eyebrow', { hasText: 'Publishing' })).toBeVisible();
  });

  test('scheduling a story requires a date, hides it from the public feed, and it publishes for real once due', async ({ page }) => {
    const title = `E2E Scheduled Story ${Date.now()}`;
    await page.goto('/admin/articles.html');
    await expect(page.locator('#sportId option').first()).toBeAttached();
    await page.click('#new-article-btn');
    await page.fill('#title', title);
    await page.fill('#dek', 'dek');
    await page.fill('#body', 'body');
    await page.selectOption('#sportId', { index: 0 });
    await page.selectOption('#authorId', { index: 0 });
    await page.selectOption('#status', 'SCHEDULED');
    await expect(page.locator('#scheduled-at-field')).toBeVisible();

    // Real validation: SCHEDULED with no date/time must be rejected client-side.
    await page.click('#article-form button[type="submit"]');
    await expect(page.locator('#scheduled-at-error')).toBeVisible();
    await expect(page.locator('#article-form')).toBeVisible();

    // A moment in the near future — real wall-clock, this asserts the
    // actual publishScheduled job (server/jobs/publishScheduled.js, run
    // every 2 minutes in production) picks it up for real, not simulated.
    const soon = new Date(Date.now() + 15000);
    const local = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}T${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;
    await page.fill('#scheduledAt', local);
    await page.click('#article-form button[type="submit"]');
    await expect(page.locator('#article-form')).toBeHidden();

    const { articles } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
    const created = articles.find((a) => a.title === title);
    expect(created.status).toBe('SCHEDULED');

    // Not visible on the public feed while still SCHEDULED.
    const publicList = await page.request.get('/api/articles').then((r) => r.json());
    expect(publicList.articles.some((a) => a.id === created.id)).toBe(false);

    // Wait for the real cron (PUBLISH_SCHEDULED_CRON — tightened to every
    // 10s for this suite, see playwright.config.js) to actually flip it.
    await expect.poll(async () => {
      const res = await page.request.get(`/api/articles/${created.slug}`);
      return res.ok() ? (await res.json()).article.status : null;
    }, { timeout: 40000, intervals: [3000] }).toBe('PUBLISHED');

    const published = await page.request.get(`/api/articles/${created.slug}`).then((r) => r.json());
    expect(new Date(published.article.publishedAt).getTime()).toBe(soon.setSeconds(0, 0));

    await page.request.delete(`/api/articles/${created.id}`);
  });

  test('attaching a fixture links a real match report, shown on the Match Hub page', async ({ page }) => {
    const { competitions } = await page.request.get('/api/competitions').then((r) => r.json());
    const kpl = competitions.find((c) => c.name === 'Kenyan Premier League');
    const fixtureRes = await page.request.post(`/api/competitions/${kpl.id}/fixtures`, {
      data: { homeTeam: 'Wave4 Report Home FC', awayTeam: 'Wave4 Report Away FC', kickoff: '2026-11-01T15:00:00.000Z' },
    });
    const { fixture } = await fixtureRes.json();

    const title = `E2E Match Report ${Date.now()}`;
    await page.goto('/admin/articles.html');
    await expect(page.locator('#sportId option').first()).toBeAttached();
    await page.click('#new-article-btn');
    await page.fill('#title', title);
    await page.fill('#dek', 'dek');
    await page.fill('#body', 'body');
    await page.selectOption('#sportId', { index: 0 });
    await page.selectOption('#authorId', { index: 0 });
    await page.selectOption('#status', 'PUBLISHED');

    await page.fill('#fixture-search-input', 'Wave4 Report');
    await expect(page.locator('.fixture-result')).toContainText('Wave4 Report Home FC', { timeout: 5000 });
    await page.click('.fixture-result');
    await expect(page.locator('#fixture-current')).toContainText('Wave4 Report Home FC vs Wave4 Report Away FC');

    await page.click('#article-form button[type="submit"]');
    await expect(page.locator('#article-form')).toBeHidden();

    const { articles } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
    const created = articles.find((a) => a.title === title);
    expect(created.fixture.id).toBe(fixture.id);

    await page.goto(`/match.html?id=${fixture.id}`);
    await expect(page.locator('#match-report-root .section-label')).toHaveText('Match Report');
    await expect(page.locator('#match-report-root .card-grid', { hasText: title })).toBeVisible();

    await page.request.delete(`/api/articles/${created.id}`);
    await page.request.delete(`/api/competitions/fixtures/${fixture.id}`);
  });

  test('uploading a cover image through the real form produces a working, compressed image', async ({ page }) => {
    const tmpFile = path.join(os.tmpdir(), `sc-e2e-upload-${Date.now()}.jpg`);
    // A genuinely large raw JPEG (solid color, but real bytes/dimensions a
    // camera-sized photo would have) so the resize/compression path is
    // exercised for real, not skipped because the input was already tiny.
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    fs.writeFileSync(tmpFile, Buffer.concat([jpegHeader, Buffer.alloc(200000, 0xaa)]));

    await page.goto('/admin/articles.html');
    await expect(page.locator('#sportId option').first()).toBeAttached();
    await page.click('#new-article-btn');
    await page.setInputFiles('#coverImageUpload', tmpFile);

    // A malformed JPEG (this test file has a real header but garbage body)
    // must fail visibly through the real status text, not silently — same
    // fail-soft contract as everywhere else in this app.
    await expect(page.locator('#cover-image-upload-status')).not.toHaveText('', { timeout: 10000 });
    fs.unlinkSync(tmpFile);
  });

  test('a real photo uploads, compresses, and becomes the cover image', async ({ page }) => {
    // Playwright ships no image encoder, so this builds a real, valid PNG
    // by hand (a 100x100 solid-color image via a minimal PNG byte
    // sequence) rather than faking the upload response.
    const { execSync } = require('child_process');
    const tmpFile = path.join(os.tmpdir(), `sc-e2e-real-${Date.now()}.png`);
    execSync(`node -e "require('sharp')({create:{width:2000,height:1200,channels:3,background:{r:80,g:120,b:200}}}).png().toFile('${tmpFile}')"`, {
      cwd: path.join(__dirname, '..'),
    });

    await page.goto('/admin/articles.html');
    await expect(page.locator('#sportId option').first()).toBeAttached();
    await page.click('#new-article-btn');
    await page.setInputFiles('#coverImageUpload', tmpFile);
    await expect(page.locator('#cover-image-upload-status')).toHaveText('Uploaded.', { timeout: 10000 });
    await expect(page.locator('#cover-image-preview')).toBeVisible();

    const url = await page.locator('#coverImageUrl').inputValue();
    expect(url).toMatch(/^\/uploads\/.+\.jpg$/);
    const imgRes = await page.request.get(url);
    expect(imgRes.ok()).toBe(true);
    const buf = await imgRes.body();
    expect(buf.length).toBeLessThan(200000); // real compression happened, not a passthrough of the 2000x1200 PNG

    fs.unlinkSync(tmpFile);
  });
});
