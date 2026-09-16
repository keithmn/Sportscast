const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Wave 5 — Content Transformation Engine. The AI-dependent legs of this
// pipeline (Whisper transcription, Claude clip suggestions, Claude quote
// generation) need OPENAI_API_KEY/ANTHROPIC_API_KEY, neither of which is
// configured in this environment (confirmed directly — neither key exists
// locally or in this app's Railway production variables; the pre-existing
// monitoring engine's own Claude integration has the identical gap,
// documented in BLUEPRINT.md). Those paths were verified as thoroughly as
// possible without a real key: the transcription failure path end-to-end
// via curl (fails visibly, raw recording preserved for later manual use),
// and the quote-verification logic (normalizeForMatch) directly, proving
// a real quote passes and a fabricated one is rejected. This suite covers
// what's actually exercisable here for real: hosts/guests, manual clip
// creation through to a genuinely rendered (ffmpeg-cut) video file with
// real burned-in captions, and sponsors — all through the real admin UI.
test.describe('Content Engine — hosts/guests/clips/sponsors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');
  });

  test('hosts and guests save through the real form, with a guest linked to a real player', async ({ page }) => {
    const { articles } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
    const episodeArticle = articles.find((a) => a.episode);
    expect(episodeArticle).toBeTruthy();

    await page.goto('/admin/articles.html');
    await expect(page.locator('#sportId option').first()).toBeAttached();
    await page.click(`.edit-btn[data-id="${episodeArticle.id}"]`);
    await expect(page.locator('#content-engine-section')).toBeVisible();

    await page.locator('.host-checkbox').first().check();
    await page.click('#add-guest-btn');
    await page.locator('.guest-name').last().fill('E2E Test Guest');
    await page.locator('.guest-role').last().fill('Head Coach');

    await page.click('#article-form button[type="submit"]');
    await expect(page.locator('#article-form')).toBeHidden();

    const { articles: after } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
    const updated = after.find((a) => a.id === episodeArticle.id);
    expect(updated.episode.hosts.length).toBeGreaterThan(0);
    expect(updated.episode.guests.some((g) => g.name === 'E2E Test Guest' && g.role === 'Head Coach')).toBe(true);
  });

  test('a manual clip renders for real through the UI — a genuine ffmpeg-cut, correctly-timed video file', async ({ page }) => {
    const { articles } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
    const episodeArticle = articles.find((a) => a.episode);
    const episodeId = episodeArticle.episode.id;

    // A real, valid raw recording — ffmpeg is genuinely available in this
    // environment (confirmed earlier in this session), used the same way
    // an editor's actual studio recording would be.
    const tmpFile = path.join(os.tmpdir(), `sc-e2e-recording-${Date.now()}.mp4`);
    execSync(
      `ffmpeg -y -f lavfi -i "testsrc=duration=20:size=320x240:rate=10" -f lavfi -i "sine=frequency=800:duration=20" -c:v libx264 -c:a aac -shortest "${tmpFile}"`,
      { stdio: 'ignore' }
    );
    // Placed directly where server/routes/episodes.js's findRawRecordingPath
    // looks for it — the same effective state as a real upload having
    // completed, without needing OPENAI_API_KEY for the transcription leg
    // this specific test isn't exercising.
    const rawRecordingsDir = path.join(__dirname, '..', 'prisma', 'raw-recordings');
    fs.mkdirSync(rawRecordingsDir, { recursive: true });
    fs.copyFileSync(tmpFile, path.join(rawRecordingsDir, `${episodeId}.mp4`));

    await page.goto('/admin/articles.html');
    await expect(page.locator('#sportId option').first()).toBeAttached();
    await page.click(`.edit-btn[data-id="${episodeArticle.id}"]`);
    await expect(page.locator('#content-engine-section')).toBeVisible();

    // Deliberately doesn't contain the word "Rendered" — an earlier version
    // of this test named the clip "E2E Rendered Clip" and its own status-
    // wait assertion below false-matched against the TITLE the instant the
    // clip appeared, long before the real (fast, but non-instant) render
    // had actually finished — a bug in the test, not the app.
    await page.fill('#newClipTitle', 'E2E Clip Under Test');
    await page.fill('#newClipStart', '2');
    await page.fill('#newClipEnd', '7');
    await page.click('#add-clip-btn');
    await expect(page.locator('#clips-list')).toContainText('E2E Clip Under Test', { timeout: 5000 });

    await page.click('.render-clip-btn');
    // Polls the real API rather than DOM text, so there's no ambiguity
    // between "the clip's title happens to contain a status-like word" and
    // "the render actually finished."
    await expect.poll(async () => {
      const { articles: polled } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
      return polled.find((a) => a.id === episodeArticle.id).episode.clips.find((c) => c.title === 'E2E Clip Under Test')?.status;
    }, { timeout: 20000 }).toBe('RENDERED');

    const { articles: after } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
    const clip = after.find((a) => a.id === episodeArticle.id).episode.clips.find((c) => c.title === 'E2E Clip Under Test');
    expect(clip.status).toBe('RENDERED');
    expect(clip.videoUrl).toMatch(/^\/uploads\/.+\.mp4$/);

    const videoRes = await page.request.get(clip.videoUrl);
    expect(videoRes.ok()).toBe(true);
    const outFile = path.join(os.tmpdir(), `sc-e2e-rendered-${Date.now()}.mp4`);
    fs.writeFileSync(outFile, await videoRes.body());
    const duration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outFile}"`).toString());
    expect(duration).toBeCloseTo(5, 0); // 7s - 2s

    fs.unlinkSync(tmpFile);
    fs.unlinkSync(outFile);
    fs.rmSync(path.join(rawRecordingsDir, `${episodeId}.mp4`), { force: true });
    fs.rmSync(path.join(__dirname, '..', 'prisma', 'uploads', path.basename(clip.videoUrl)), { force: true });
    await page.request.delete(`/api/episodes/clips/${clip.id}`);
  });

  test('episode sponsors save and delete through the real form', async ({ page }) => {
    const { articles } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
    const episodeArticle = articles.find((a) => a.episode);

    await page.goto('/admin/articles.html');
    await expect(page.locator('#sportId option').first()).toBeAttached();
    await page.click(`.edit-btn[data-id="${episodeArticle.id}"]`);
    await expect(page.locator('#content-engine-section')).toBeVisible();

    await page.fill('#newSponsorName', 'E2E Test Sponsor');
    await page.click('#add-sponsor-btn');
    await expect(page.locator('#episode-sponsors-list')).toContainText('E2E Test Sponsor', { timeout: 5000 });

    await page.click('.delete-episode-sponsor-btn');
    await expect(page.locator('#episode-sponsors-list')).not.toContainText('E2E Test Sponsor', { timeout: 5000 });
  });

  test('uploading a raw recording without OPENAI_API_KEY fails visibly, not silently, and preserves the file for manual use', async ({ page }) => {
    const { articles } = await page.request.get('/api/articles/admin/all').then((r) => r.json());
    const episodeArticle = articles.find((a) => a.episode);
    const episodeId = episodeArticle.episode.id;

    const tmpFile = path.join(os.tmpdir(), `sc-e2e-fail-${Date.now()}.mp4`);
    execSync(`ffmpeg -y -f lavfi -i "testsrc=duration=3:size=160x120:rate=5" -c:v libx264 "${tmpFile}"`, { stdio: 'ignore' });

    await page.goto('/admin/articles.html');
    await expect(page.locator('#sportId option').first()).toBeAttached();
    await page.click(`.edit-btn[data-id="${episodeArticle.id}"]`);
    await page.setInputFiles('#recordingUpload', tmpFile);

    await expect(page.locator('#recording-status')).toContainText('Transcribing', { timeout: 5000 });
    await expect.poll(async () => {
      const res = await page.request.get(`/api/episodes/${episodeId}/status`);
      return (await res.json()).transcriptionStatus;
    }, { timeout: 15000 }).toBe('FAILED');

    const rawPath = path.join(__dirname, '..', 'prisma', 'raw-recordings', `${episodeId}.mp4`);
    expect(fs.existsSync(rawPath)).toBe(true);

    fs.unlinkSync(tmpFile);
    fs.rmSync(rawPath, { force: true });
    await page.request.delete(`/api/episodes/${episodeId}/recording`).catch(() => {});
  });
});
