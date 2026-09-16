const { test, expect } = require('@playwright/test');

// Wave 9 (pre-OS refinement) §8.1 — BLUEPRINT.md §28 documented the 5
// niche shows as "actually removed, not just dormant" (2026-09-13), but
// prisma/seed.js kept unconditionally recreating those same 6 Article
// rows on every reseed, silently contradicting that decision. Fixed by
// deleting the niche-show seeding block. This re-verifies §28's own
// original verification claims, now against the corrected seed.
test.describe('Show strategy — flagship-only, niche shows genuinely gone', () => {
  test('a fresh reseed creates no niche-show content', async ({ request }) => {
    const res = await request.get('/api/articles?contentType=VIDEO_POST');
    expect(res.ok()).toBe(true);
    const { articles } = await res.json();

    const nicheShowNames = ['The Hydration Break', 'The Ruck', 'Bully Off', 'Fast Break', 'The Circuit'];
    // videoSeries isn't necessarily in the public list response — check by
    // the actual seeded titles instead, which are unambiguous either way.
    const nicheShowTitles = [
      "Gor Mahia's Away-Day Problem",
      'Kakamega Homeboyz Are Building Something',
      "Inside the Shujaa's Pre-Season Camp",
      'The Blackbucks Push for Visibility',
      "Nairobi's Youth Courts Are Producing Talent",
      'Who Carries Kenyan Distance Running Next?',
    ];
    const titles = articles.map((a) => a.title);
    for (const nicheTitle of nicheShowTitles) {
      expect(titles).not.toContain(nicheTitle);
    }

    // Only the flagship's own episodes should exist as VIDEO_POST content.
    expect(articles.length).toBeGreaterThan(0);
    for (const article of articles) {
      expect(nicheShowNames.some((n) => article.title.includes(n))).toBe(false);
    }
  });

  test('a removed niche show\'s URL shows "not found", not a crash', async ({ page }) => {
    await page.goto('/show.html?slug=the-ruck');
    await expect(page.locator('body')).not.toContainText('undefined');
    const notFound = page.getByText(/not found/i);
    await expect(notFound).toBeVisible();
  });

  test('shows.html only lists the flagship show', async ({ page }) => {
    await page.goto('/shows.html');
    await expect(page.locator('body')).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    for (const niche of ['Hydration Break', 'Bully Off', 'Fast Break']) {
      expect(bodyText).not.toContain(niche);
    }
  });
});
