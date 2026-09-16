const { test, expect } = require('@playwright/test');

// Wave 7 — the REGISTERED tier of the directive's authentication model.
// Deliberately minimal (no email verification, no password reset — see
// FanAccount's own schema comment for why). Exercises the real routes
// (server/routes/fanAuth.js), not the UI form, except for one check that
// the account page itself actually reflects a real session.
test.describe('Fan accounts', () => {
  test('registers, is immediately signed in, and the account claims the device anonymousId', async ({ request }) => {
    const email = `e2e-fan-${Date.now()}@example.com`;
    const anonymousId = `e2e-anon-${Date.now()}`;

    const registerRes = await request.post('/api/fan-auth/register', {
      data: { email, password: 'correcthorsebattery', name: 'E2E Fan', anonymousId },
    });
    expect(registerRes.status()).toBe(201);
    const { account } = await registerRes.json();
    expect(account.email).toBe(email);
    expect(account.anonymousId).toBe(anonymousId);

    const meRes = await request.get('/api/fan-auth/me');
    expect((await meRes.json()).account.email).toBe(email);
  });

  test('rejects a duplicate email with 409', async ({ request }) => {
    const email = `e2e-fan-dup-${Date.now()}@example.com`;
    const first = await request.post('/api/fan-auth/register', { data: { email, password: 'correcthorsebattery' } });
    expect(first.status()).toBe(201);

    const second = await request.post('/api/fan-auth/register', { data: { email, password: 'anotherpassword1' } });
    expect(second.status()).toBe(409);
  });

  test('rejects a too-short password with 400, and an invalid email with 400', async ({ request }) => {
    const shortPw = await request.post('/api/fan-auth/register', { data: { email: `e2e-${Date.now()}@example.com`, password: 'short' } });
    expect(shortPw.status()).toBe(400);

    const badEmail = await request.post('/api/fan-auth/register', { data: { email: 'not-an-email', password: 'correcthorsebattery' } });
    expect(badEmail.status()).toBe(400);
  });

  test('logs in with correct credentials, rejects wrong password, and logout clears the session', async ({ request }) => {
    const email = `e2e-fan-login-${Date.now()}@example.com`;
    await request.post('/api/fan-auth/register', { data: { email, password: 'correcthorsebattery' } });
    // Registration itself signs the session in — log out first so login
    // below is exercised for real, not riding the register session.
    await request.post('/api/fan-auth/logout');
    expect((await (await request.get('/api/fan-auth/me')).json()).account).toBeNull();

    const wrongPw = await request.post('/api/fan-auth/login', { data: { email, password: 'wrongpassword' } });
    expect(wrongPw.status()).toBe(401);

    const rightPw = await request.post('/api/fan-auth/login', { data: { email, password: 'correcthorsebattery' } });
    expect(rightPw.status()).toBe(200);
    expect((await rightPw.json()).account.email).toBe(email);

    const logoutRes = await request.post('/api/fan-auth/logout');
    expect(logoutRes.ok()).toBe(true);
    expect((await (await request.get('/api/fan-auth/me')).json()).account).toBeNull();
  });

  test('the account page reflects a real signed-in session end to end', async ({ page }) => {
    const email = `e2e-fan-ui-${Date.now()}@example.com`;

    await page.goto('/account.html');
    await page.locator('#register-form input[name="email"]').fill(email);
    await page.locator('#register-form input[name="password"]').fill('correcthorsebattery');
    await page.locator('#register-form button[type="submit"]').click();

    await expect(page.locator('#account-root')).toContainText(email);
    await expect(page.locator('#logout-btn')).toBeVisible();

    await page.locator('#logout-btn').click();
    await expect(page.locator('#login-form')).toBeVisible();
  });
});
