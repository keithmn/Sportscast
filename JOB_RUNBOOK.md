# Job Runbook

Every scheduled job this app runs, in one place. All 10 are `node-cron` schedules registered directly in `server/index.js` (search for `cron.schedule`) — **there is no separate worker/scheduler process**. This is a real, deliberate constraint, documented explicitly here per Wave 9 (pre-OS refinement) §8.7, not previously written down anywhere.

## The jobs

| Job | Cadence (env override) | What it does | Failure behavior |
|---|---|---|---|
| `syncLeagues` | `*/30 * * * *` (`SYNC_INTERVAL_CRON`) | Pulls global-league (API-sourced) standings/fixtures from football-data.org. No-ops with a warning if `FOOTBALL_DATA_API_KEY` is unset — safe to leave scheduled regardless. | Caught, logged (`console.error`), never crashes the process. Next run retries from scratch. |
| `syncSquads` | `0 3 * * *` daily | Wikidata squad-roster sync. Once daily to stay clear of Wikidata's soft rate limits. | Same as above. |
| `syncKenyaCup` | `0 4 * * *` daily | Scrapes kenyacup.co.ke for real Kenya Cup standings (no official API exists). | Same. |
| `syncTheSportsDB` | `30 4 * * *` daily | International fixtures (Six Nations, EuroLeague, boxing, darts) via TheSportsDB's free tier. | Same. |
| `syncBallDontLie` | `35 4 * * *` daily | NBA fixtures via balldontlie.io. Offset 5 min from TheSportsDB so they never overlap on a shared host. No-ops if `BALLDONTLIE_API_KEY` unset. | Same. |
| `runMonitoringFetch` | `*/20 * * * *` | Fetches new items from monitoring Sources (RSS/HTML/YouTube). Cheap, runs often. | Same. |
| `runMonitoringEnrich` | `*/10 * * * *` | LLM enrichment of fetched items (calls a paid Claude API). Runs less often than fetch — enrichment is the expensive step, fetch just queues work for it. | Same. |
| `publishScheduled` | `*/2 * * * *` | Flips `SCHEDULED` articles past their `scheduledAt` to `PUBLISHED`, fires the publish-notification path (Wave 7). 2-minute granularity is plenty for editorial use. | Same. |
| `backupDatabase` | `30 23 * * *` (`BACKUP_CRON`) — 02:30 Nairobi | Snapshot of the whole SQLite database (`VACUUM INTO`, safe while running) into `BACKUP_DIR` (default `backups/` next to the database), keeping the newest `BACKUP_KEEP` (14); uploads off-site when `BACKUP_S3_*` is set; prunes JobRun rows older than 30 days. See "Backups, alerts and uptime" below. | Recorded as a failed JobRun and alerted. |
| `cleanupRawRecordings` | `15 * * * *` hourly | Force-deletes raw show recordings older than 48h from the persistent volume — the safety net if an editor forgets to delete one manually after approving clips. | Try/catch, logged, never crashes. |

Since 2026-10-19 every job runs through `server/lib/jobRuns.js`: each run is a `JobRun` row (started, finished, OK/ERROR, error, duration), a second run of a job that is still running is skipped, and a failure is alerted (below). The admin dashboard's **System** card shows the latest run of each job and anything that failed in the last 24 hours.

## Idempotency

- **The 5 sync jobs** (`syncLeagues`/`syncSquads`/`syncKenyaCup`/`syncTheSportsDB`/`syncBallDontLie`) all upsert against a real unique key (same two teams don't play each other twice at the same kickoff, per `Fixture`'s own schema comment) — re-running them, whether on schedule or after a crash, never creates duplicates.
- **`publishScheduled`** only touches rows where `status: 'SCHEDULED'` AND `scheduledAt` has passed — re-running it mid-window is a no-op for anything it already flipped to `PUBLISHED`.
- **`cleanupRawRecordings`** deletes by file age, not by a "have I processed this" flag — inherently idempotent, a second run just finds nothing new to delete.
- **Monitoring fetch/enrich** operate on queued `MonitoredItem` rows by status — fetch won't re-queue an item it already has, enrich only picks up unenriched items.

None of these jobs write append-only audit logs of their own runs (no `JobRun` table, no "last succeeded at" timestamp stored anywhere) — a genuine, accepted gap: there is currently no way to answer "when did `syncLeagues` last actually run" except by reading Railway's own log retention.

## Multi-replica safety — the real risk

**This is not safe to run on more than one Railway replica today.** Every job is registered in the same process that serves HTTP traffic; scaling to N replicas means N independent copies of every cron schedule firing on their own clocks, each doing the full sync/cleanup/notification work independently. Concretely: `publishScheduled` firing on 3 replicas at once would each try to flip the same article and could each fire the publish-notification push, meaning followers get triple-notified for one story. The sync jobs' upsert-based idempotency protects the *data* from corruption in this scenario, but not followers/staff from duplicate side effects (notifications, LLM API spend on `runMonitoringEnrich` triple-billing the same batch).

**This is an accepted constraint for a single-instance launch, not an oversight** — documented here explicitly so it's a known, deliberate trade-off if/when this service is ever scaled horizontally.

**Migration trigger**: if/when this app moves to more than one Railway replica, jobs need to move to either (a) a single dedicated worker service (not the web-serving instances) or (b) a distributed-lock mechanism (e.g., an advisory lock held in the database, or a Railway cron-triggered one-off job instead of an in-process schedule) before that happens — not after.

## How to disable/enable a job

Every cadence is an env var with a sensible default (`SYNC_INTERVAL_CRON`, `PUBLISH_SCHEDULED_CRON`, etc. — see the table above). There is no "disabled" state built in; setting a cron expression that never fires (e.g., `0 0 31 2 *`, Feb 31st) is the only current way to effectively disable one without a code change. A real enable/disable flag is not built — small enough to add if it becomes a real operational need.


## Backups, alerts and uptime (2026-10-19)

**Backups.** `backupDatabase` runs nightly. To take one by hand: `npm run backup`. To see what exists: `npm run restore -- --list`.

**Off-site copy.** A backup on the same Railway volume doesn't survive losing the volume. Set these four variables (Cloudflare R2 shown; any S3-compatible service works) and each nightly backup is also uploaded:

| Variable | Example |
|---|---|
| `BACKUP_S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `BACKUP_S3_BUCKET` | `sportscast-backups` |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | an R2 API token with write access to that bucket only |
| `BACKUP_S3_REGION` (optional) | `auto` for R2 (the default) |

**Restoring.** Stop the server, then:

```sh
node scripts/restore-backup.js <backup-file> --to <database-file>
```

It checks the backup is a sound SQLite database with the site's tables before touching anything, and keeps the database it replaces as `<database-file>.before-restore-<time>`. `e2e/reliability.spec.js` runs a full backup and restore on every CI run, so a backup that wouldn't restore is caught.

**Failure alerts.** Set `ALERT_WEBHOOK_URL` to a Slack incoming webhook, or a Discord webhook URL with `/slack` on the end, and every job failure is posted there (the same failure at most once an hour). Without it, failures still show on the dashboard.

**Uptime.** `.github/workflows/uptime.yml` checks `/api/health` every 15 minutes and fails, so GitHub emails you, when the site or its database doesn't answer. Turn it on once the site is live by adding the repository variable `UPTIME_URL` (Settings → Secrets and variables → Actions → Variables). `/api/health` is public and only says ok or not; `/api/health/details` (editors only) has the job and backup detail.

## Signing in on production for the first time

The repo is public, so the demo password (`underdoggs2026`) is too. Production refuses it outright: it never signs anyone in, not even to change it (that would give the account to whoever tried it first). The same applies wherever `NODE_ENV=production`, `RAILWAY_ENVIRONMENT` or `REFUSE_DEMO_PASSWORD=1` is set.

To get in — and whenever the only admin is locked out — make a one-time link on the server:

```
railway ssh --service sportscast --environment production
npm run reset-link -- admin@underdoggs.co.ke
```

Open the link it prints (it works once, for 24 hours) and choose a password. Then add everyone else from Account → Team, each with their own login, and switch off the demo `editor@underdoggs.co.ke` account. The link uses `SITE_URL` for the address; pass `--base https://…` to use another.

## Deploying: tests first, staging before production

- `npm run deploy` runs the whole e2e suite first and deploys to production only if it passes (npm runs `predeploy` automatically). Don't call `railway up` directly.
- **Staging** is a second Railway environment with its own volume, so changes and migrations are tried against real-looking data before production:
  1. `railway environment new staging` (once), add a volume and the same variables as production, with its own `SESSION_SECRET` and `DATABASE_URL`.
  2. Copy production's latest backup into it (`npm run restore` against the staging volume) so migrations run against real data.
  3. `npm run deploy:staging`, check the site, then `npm run deploy`.
- CI (`.github/workflows/ci.yml`) runs on Node 24, the same as production (it ran Node 20 until 2026-10-19).
