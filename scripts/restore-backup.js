#!/usr/bin/env node
// Restores the database from a backup made by server/jobs/backupDatabase.js.
//
//   node scripts/restore-backup.js --list
//   node scripts/restore-backup.js <backup-file> --to <database-file>
//
// Stop the server first. Before overwriting anything it checks the backup
// opens as a real SQLite database with the site's tables, and it keeps the
// database it replaces as <database-file>.before-restore-<time> — so a
// restore can itself be undone.

const fs = require('fs');
const path = require('path');
const { backupDir, databasePath } = require('../server/jobs/backupDatabase');

const args = process.argv.slice(2);

// Node 24's built-in SQLite — no sqlite3 binary needed on the server.
const { DatabaseSync } = require('node:sqlite');

function check(file) {
  // A real backup has the site's core tables and passes SQLite's own check.
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    const result = Object.values(integrity)[0];
    if (result !== 'ok') throw new Error(`${file} failed SQLite's integrity check: ${result}`);
    const count = (table) => db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n;
    return { competitions: count('Competition'), fixtures: count('Fixture'), articles: count('Article') };
  } finally {
    db.close();
  }
}

if (args.includes('--list') || !args.length) {
  const dir = backupDir();
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort().reverse() : [];
  console.log(files.length ? `Backups in ${dir} (newest first):\n${files.map((f) => `  ${f}  ${(fs.statSync(path.join(dir, f)).size / 1024 / 1024).toFixed(1)} MB`).join('\n')}` : `No backups in ${dir}`);
  if (!args.length) console.log('\nRestore with: node scripts/restore-backup.js <backup-file> --to <database-file>');
  process.exit(0);
}

const source = path.resolve(args[0]);
const toIndex = args.indexOf('--to');
const target = path.resolve(toIndex > -1 ? args[toIndex + 1] : databasePath());
if (!fs.existsSync(source)) { console.error(`No such backup: ${source}`); process.exit(1); }

const counts = check(source);
console.log(`Backup OK: ${counts.competitions} competitions, ${counts.fixtures} fixtures, ${counts.articles} articles.`);
if (fs.existsSync(target)) {
  const keepAs = `${target}.before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(target, keepAs);
  console.log(`Kept the current database as ${keepAs}`);
}
for (const extra of ['-wal', '-shm', '-journal']) if (fs.existsSync(target + extra)) fs.unlinkSync(target + extra);
fs.copyFileSync(source, target);
check(target);
console.log(`Restored ${path.basename(source)} to ${target}. Start the server again.`);
