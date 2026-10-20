const { test, expect } = require('@playwright/test');
const { execFileSync, execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

// Reliability (2026-10-19): health checks, job-run records with failure
// alerts, and nightly backups that really restore. Runs the real scripts
// against the e2e database, the same way production runs them.
const ROOT = path.join(__dirname, '..');
const DB_PATH = process.env.E2E_DB_PATH || path.join(ROOT, 'prisma', '.e2e-test.db');
const nodeEnv = (extra) => ({ ...process.env, DATABASE_URL: `file:${DB_PATH}`, NODE_NO_WARNINGS: '1', ...extra });

async function signIn(page) {
  await page.goto('/admin/index.html');
  await page.fill('#email', 'admin@underdoggs.co.ke');
  await page.fill('#password', 'underdoggs2026');
  await page.click('button:has-text("Sign In")');
  await page.waitForURL('**/admin/dashboard.html');
}

test.describe('Reliability', () => {
  test('the public health check answers, and the details are for editors only', async ({ request, page }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect((await request.get('/api/health/details')).status()).toBe(401);
    await signIn(page);
    const details = await page.request.get('/api/health/details').then((r) => r.json());
    expect(details).toHaveProperty('jobs');
    expect(details).toHaveProperty('backupOverdue');
  });

  test('a nightly backup is a real copy that restores, and keeps the database it replaces', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-backup-'));
    const out = execFileSync('node', ['server/jobs/backupDatabase.js'], { cwd: ROOT, env: nodeEnv({ BACKUP_DIR: dir }), encoding: 'utf8' });
    expect(out).toMatch(/sportscast-\d{8}-\d{6}\.db · [\d.]+ MB · no off-site copy/);
    const [backup] = fs.readdirSync(dir).filter((f) => f.endsWith('.db'));
    const target = path.join(dir, 'restored.db');
    fs.writeFileSync(target, 'not a database'); // something to be kept aside
    const restored = execFileSync('node', ['scripts/restore-backup.js', path.join(dir, backup), '--to', target], { cwd: ROOT, env: nodeEnv({}), encoding: 'utf8' });
    expect(restored).toMatch(/Backup OK: \d+ competitions, \d+ fixtures, \d+ articles/);
    expect(fs.readdirSync(dir).some((f) => f.startsWith('restored.db.before-restore-'))).toBe(true);
    const { DatabaseSync } = require('node:sqlite');
    const count = (file) => { const db = new DatabaseSync(file, { readOnly: true }); const n = db.prepare('SELECT count(*) AS n FROM Competition').get().n; db.close(); return n; };
    expect(count(target)).toBe(count(path.join(dir, backup)));
    expect(count(target)).toBeGreaterThan(10);
    // A broken file is refused before anything is overwritten.
    fs.writeFileSync(path.join(dir, 'bad.db'), 'garbage');
    expect(() => execFileSync('node', ['scripts/restore-backup.js', path.join(dir, 'bad.db'), '--to', target], { cwd: ROOT, env: nodeEnv({}), stdio: 'pipe' })).toThrow();
    expect(count(target)).toBeGreaterThan(10);
  });

  test('the off-site upload signs requests exactly as AWS documents (SigV4 test vector)', () => {
    const { signRequest, sha256Hex } = require('../server/lib/s3Upload');
    const auth = signRequest({
      method: 'GET', path: '/', headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
      payloadHash: sha256Hex(''), region: 'us-east-1', service: 'service',
      accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    });
    expect(auth).toBe('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
  });

  test('a failing job is recorded, alerts the webhook, and shows on the dashboard', async ({ page }) => {
    const received = [];
    const hook = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { received.push(JSON.parse(body)); res.end('ok'); });
    });
    await new Promise((r) => hook.listen(0, r));
    const job = `e2eFailingJob${Date.now()}`;
    try {
      // Not execFileSync: that would freeze this process, and with it the
      // webhook server the job is trying to reach.
      await promisify(execFile)('node', ['-e', `require('./server/lib/jobRuns').runJob('${job}', async () => { throw new Error('boom from e2e'); }).then(() => require('./server/db').$disconnect())`], {
        cwd: ROOT, env: nodeEnv({ ALERT_WEBHOOK_URL: `http://127.0.0.1:${hook.address().port}/hook` }),
      });
    } finally {
      hook.close();
    }
    expect(received).toHaveLength(1);
    expect(received[0].text).toContain(`"${job}" failed: boom from e2e`);

    await signIn(page);
    const details = await page.request.get('/api/health/details').then((r) => r.json());
    expect(details.failures.map((f) => f.job)).toContain(job);
    await page.goto('/admin/dashboard.html');
    await expect(page.locator('.system-card')).toContainText(`${job} failed`);
  });
});
