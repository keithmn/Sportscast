// e2e acceptance suite (gap #11, 2026-09 remediation audit: "no automated
// browser/UI acceptance suite"). Runs against a throwaway, freshly
// migrated + seeded SQLite database (never the developer's real dev.db or
// production) — see the webServer command below.
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_PORT || 3100;
const BASE_URL = `http://localhost:${PORT}`;
// Under prisma/ so it's covered by the existing prisma/*.db(-journal)
// gitignore entry, and so server/index.js's session-store path derivation
// (same directory as the DB file) lands in the already-ignored
// prisma/sessions/ rather than a stray repo-root sessions/ dir.
const DB_PATH = process.env.E2E_DB_PATH || `${__dirname}/prisma/.e2e-test.db`;

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false, // shared SQLite file — parallel workers would race on it
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // VAPID pair here is a throwaway test keypair (generated for this
    // suite, not the real dev/production one) — needed so push.spec.js can
    // exercise the real subscribe/unsubscribe flow instead of hitting the
    // "not configured" no-op path.
    command: `rm -f "${DB_PATH}" && DATABASE_URL="file:${DB_PATH}" npx prisma migrate deploy && DATABASE_URL="file:${DB_PATH}" node prisma/seed.js && DATABASE_URL="file:${DB_PATH}" SESSION_SECRET=e2e-test-secret-not-used-in-production E2E_TEST_MODE=true VAPID_PUBLIC_KEY=BGwBFVaSwc28kqev2-JCaFxTESWJ7C_f0pDfUo7V7Yp49Nr96iKJoWZLAMiA1oy5cVdG3Gw75BBhDofdZzX8hLg VAPID_PRIVATE_KEY=LqmkzXfAmwx2A9nKsUsqpKsfDyFod_hBxaDjL6Duaaw VAPID_SUBJECT=mailto:test@example.com PORT=${PORT} node server/index.js`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
