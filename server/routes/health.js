// Health checks (2026-10-19).
// - GET /api/health — public and tiny, for the uptime check
//   (.github/workflows/uptime.yml): 200 { ok: true } when the server can
//   read the database, 503 otherwise. No internals in it.
// - GET /api/health/details — editors: the latest run of every scheduled
//   job, failures in the last 24 hours and the last backup, for the
//   dashboard's System card.

const express = require('express');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const started = new Date();
// Older than this and the dashboard calls the backup overdue.
const BACKUP_STALE_HOURS = 36;

router.get('/', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.set('Cache-Control', 'no-store').json({ ok: true, time: new Date().toISOString() });
  } catch (err) {
    res.status(503).set('Cache-Control', 'no-store').json({ ok: false, error: 'database unavailable' });
  }
});

router.get('/details', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [latest, failures, lastBackup] = await Promise.all([
    prisma.$queryRaw`SELECT job, status, startedAt, finishedAt, durationMs, error, detail FROM JobRun r
      WHERE startedAt = (SELECT MAX(startedAt) FROM JobRun WHERE job = r.job) ORDER BY job`,
    prisma.jobRun.findMany({ where: { status: 'ERROR', startedAt: { gte: since } }, orderBy: { startedAt: 'desc' }, take: 20 }),
    prisma.jobRun.findFirst({ where: { job: 'backupDatabase', status: 'OK' }, orderBy: { startedAt: 'desc' } }),
  ]);
  const backupAgeHours = lastBackup ? (Date.now() - new Date(lastBackup.startedAt).getTime()) / 3600000 : null;
  res.json({
    serverStartedAt: started,
    version: process.env.RAILWAY_GIT_COMMIT_SHA || null,
    alertsConfigured: Boolean(process.env.ALERT_WEBHOOK_URL),
    offsiteBackupConfigured: Boolean(process.env.BACKUP_S3_ENDPOINT && process.env.BACKUP_S3_BUCKET),
    jobs: latest.map((j) => ({ ...j, startedAt: new Date(j.startedAt), finishedAt: j.finishedAt ? new Date(j.finishedAt) : null })),
    failures,
    lastBackup,
    backupOverdue: backupAgeHours === null || backupAgeHours > BACKUP_STALE_HOURS,
  });
});

module.exports = router;
