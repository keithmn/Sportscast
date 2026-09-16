const { test, expect } = require('@playwright/test');

// Wave 1 security-audit regression coverage — the audit's own explicit
// "add login/security test" item. Previously nothing in this suite
// exercised a rejected login, response headers, or the Source SSRF guard.
test.describe('Security', () => {
  test('rejects a wrong password without creating a session', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'definitely-the-wrong-password');
    await page.click('button:has-text("Sign In")');

    // Still on the login page — not redirected to the dashboard.
    await expect(page).toHaveURL(/\/admin\/(index\.html)?$/);

    // Dashboard itself refuses an unauthenticated request server-side too,
    // not just via client-side redirect logic.
    const res = await page.request.get('/api/articles/admin/all');
    expect(res.status()).toBe(401);
  });

  test('sends baseline security headers (helmet)', async ({ page }) => {
    const res = await page.goto('/');
    const headers = res.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toContain("default-src 'self'");
  });

  test('rejects a monitoring Source pointed at a private/internal address', async ({ page }) => {
    await page.goto('/admin/index.html');
    await page.fill('#email', 'admin@underdoggs.co.ke');
    await page.fill('#password', 'underdoggs2026');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/admin/dashboard.html');

    const res = await page.request.post('/api/sources', {
      data: {
        name: 'SSRF test source',
        category: 'NEWS',
        fetchMethod: 'RSS',
        url: 'http://169.254.169.254/latest/meta-data/',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/private\/internal address/);
  });
});
