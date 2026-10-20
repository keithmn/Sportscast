// Nightly database backup (2026-10-19). Everything the site knows lives in
// one SQLite file on one Railway volume — this keeps dated copies:
//
// 1. A consistent snapshot with SQLite's own VACUUM INTO (safe while the
//    server is running and writing), into BACKUP_DIR (default: a
//    "backups" folder next to the database).
// 2. The newest BACKUP_KEEP snapshots are kept (default 14); older ones
//    are removed.
// 3. When BACKUP_S3_* is set (Cloudflare R2, S3, B2…), the snapshot is
//    also uploaded off-site — a copy on the same volume doesn't survive
//    losing the volume. See DEPLOYMENT notes in JOB_RUNBOOK.md.
//
// Also prunes JobRun rows older than 30 days. Restore with
// scripts/restore-backup.js. Run by hand: node server/jobs/backupDatabase.js

const fs = require('fs');
const path = require('path');
const prisma = require('../db');
const { s3ConfigFromEnv, putObject } = require('../lib/s3Upload');

function databasePath() {
  const raw = (process.env.DATABASE_URL || 'file:./dev.db').replace(/^file:/, '');
  // Prisma resolves a relative SQLite path against the schema's folder.
  return path.isAbsolute(raw) ? raw : path.join(__dirname, '..', '..', 'prisma', raw);
}

function backupDir() {
  return process.env.BACKUP_DIR || path.join(path.dirname(databasePath()), 'backups');
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-'); // 20261019-223000
}

async function backupDatabase() {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `sportscast-${stamp()}.db`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  // VACUUM INTO takes a string literal; the path is ours, but quote it safely anyway.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const size = fs.statSync(file).size;

  const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
  const old = fs.readdirSync(dir).filter((f) => /^sportscast-\d{8}-\d{6}\.db$/.test(f)).sort().reverse().slice(keep);
  old.forEach((f) => fs.unlinkSync(path.join(dir, f)));

  let offsite = 'no off-site copy (BACKUP_S3_* not set)';
  const s3 = s3ConfigFromEnv();
  if (s3) {
    const where = await putObject(s3, path.basename(file), fs.readFileSync(file));
    offsite = `uploaded to ${where}`;
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.jobRun.deleteMany({ where: { startedAt: { lt: cutoff } } });

  return `${path.basename(file)} · ${(size / 1024 / 1024).toFixed(1)} MB · ${offsite}${old.length ? ` · removed ${old.length} old` : ''}`;
}

module.exports = { backupDatabase, backupDir, databasePath };

if (require.main === module) {
  backupDatabase()
    .then((detail) => { console.log(`[backupDatabase] ${detail}`); return prisma.$disconnect(); })
    .catch((err) => { console.error('[backupDatabase] failed:', err); process.exit(1); });
}
