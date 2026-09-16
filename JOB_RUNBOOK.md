# Job Runbook

Every scheduled job this app runs, in one place. All 9 are `node-cron` schedules registered directly in `server/index.js` (search for `cron.schedule`) — **there is no separate worker/scheduler process**. This is a real, deliberate constraint, documented explicitly here per Wave 9 (pre-OS refinement) §8.7, not previously written down anywhere.

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
| `cleanupRawRecordings` | `15 * * * *` hourly | Force-deletes raw show recordings older than 48h from the persistent volume — the safety net if an editor forgets to delete one manually after approving clips. | Try/catch, logged, never crashes. |

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
