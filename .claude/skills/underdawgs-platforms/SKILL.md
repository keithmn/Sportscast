---
name: underdawgs-platforms
description: Accumulated decisions, gotchas, and quick-reference facts for the two Underdawgs Rising Group production repos — the Sports Data Platform and the Sportscast media site — so you don't re-derive or contradict them
---

Use this whenever you're touching either of the two Underdawgs repos, coordinating work across both, or reasoning about the eventual "Command OS" that will sit on top of them. Identical copy lives in both repos — if you update one, update the other (same convention already used for `UNDERDAWGS_DOMAIN_CONTRACT.md`/`UNDERDAWGS_OS_OBJECT_MODEL.md`).

## The two repos — don't confuse them

- **`Underdawgs Rising Group/Underdawgs Sportscast`** — confusingly named directory. This is the **Sports Data Platform** (canonical sports data: Sports/Competitions/Fixtures/Events/Officials/Evidence), *not* the media site. npm-workspaces monorepo: `packages/validation`, `packages/database` (Prisma), `packages/sports-core`, `apps/api` (Express), `apps/admin` (Next.js).
- **`Underdawgs Rising Group/Sportscast`** — the actual media site (articles, shows/episodes, Match Hub, fan accounts). Node/Express + Prisma, no build/lint scripts (plain JS), 9 in-process `node-cron` jobs (see `JOB_RUNBOOK.md`) — **not safe on more than one Railway replica**, single-instance only today.

Sportscast pushes via the `keithmn` remote, not `origin` — `origin` exists but isn't the one that's actually kept current.

## Railway — live services and the CLI-only deploy gotcha

| Repo | Railway project | Services |
|---|---|---|
| Sports Data Platform | `underdawgs-sports-data-platform` | `api` → api-production-cb69.up.railway.app · `admin` → admin-production-ca35.up.railway.app · `web` → web-production-b15f4.up.railway.app |
| Sportscast | `sportscast` | `sportscast` → sportscast-production-c267.up.railway.app |

**The Sports Data Platform's GitHub App connection is broken/missing** (`No GitHub installation found for repo: keithmn/underdawgs-sports-data-platform`) — `railway redeploy --from-source` fails outright, and plain `railway redeploy` (no flag) just **restarts the existing image**, silently *not* picking up new commits even though it looks like a normal deploy. Confirmed the hard way: a plain redeploy after pushing Wave 9 kept serving pre-Wave-9 code with no error. **Always use `railway up --service <name> --detach` instead** (builds+deploys from local working directory) when the repo state should actually change what's live — and verify with a live endpoint fingerprint (see below), not just "the deploy succeeded."

**Deployed state and git state can diverge silently in either direction** — don't trust a repo's own acceptance-report doc about what's live. Verify directly:
- Sports Data: `curl https://api-production-cb69.up.railway.app/v1/health` — reports `{"storage":{"backend":"r2"|"local-disk","productionSafe":bool}}`.
- Sportscast: check for a field/route that only exists in the version you think is live (e.g. Wave 9 added `"canonical"` to `/api/search`'s response, and `/api/fixtures/missing-reports` — 401 means the route exists and is auth-gated, 404 means it isn't deployed yet).

`railway ssh --service <name> -- <cmd>` is the only way to reach a service's Postgres (`*.railway.internal`, private network only) from outside a deployed container — `railway run` injects env vars but still executes *locally*, so it can't resolve `.railway.internal` hosts at all.

## Cloudflare R2 (Sports Data Platform evidence storage)

`apps/api/src/lib/storage.ts` fails fast (refuses to boot) in production unless all five vars are set: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`. `R2_PUBLIC_URL` is **not** the S3 API endpoint (`https://<account-id>.r2.cloudflarestorage.com`, which the code derives itself from `R2_ACCOUNT_ID`) — it's the separate public-read URL from the bucket's Settings → Public Access (`pub-<hash>.r2.dev` or a custom domain). Getting this wrong (pointing `R2_PUBLIC_URL` at the private endpoint) won't crash the boot check but will produce broken public evidence links.

Bucket in use: `underdawgs-evidence`.

## Known outstanding issue: demo password is the only production ADMIN account

`packages/database/prisma/seed.ts`'s `DEMO_PASSWORD = 'DemoPass123!'` was seeded into the **live production** Sports Data Platform database (confirmed via `railway ssh` querying `User` where `role: 'ADMIN'` — only account is `admin@demo.underdawgs.dev`), despite the seed file's own comment saying to rotate/remove it before any non-local deployment. This is a real, live credential-in-source-control problem, not a hypothetical — fix by rotating the password or creating a real admin user and demoting the demo one, don't just note it and move on if asked to do a security pass.

## The OS object model — the actual hard problem

`UNDERDAWGS_OS_OBJECT_MODEL.md` (identical copy in both repos): of 30 named cross-product objects, 19 already have a real owning API, 5 are genuinely new work (Task, Decision, Owner, persisted Alert history, cross-product Notification consumption), 1 (Distribution Record) has no home and shouldn't be fabricated. **The single hardest problem isn't a missing object — the two repos' `User` tables share no identity.** Any "who is this staff member across both products" question is unanswerable today; treat this as the load-bearing open question before designing real cross-product OS features, not a detail to defer.

## Verification discipline for this pair of repos specifically

Given the git/deploy divergence risk above, treat "tests pass locally" and "it's live" as two separate claims that both need checking, every time:
1. Local: test suite for the repo you touched (`npx vitest run` for Sports Data's `apps/api`; `npx playwright test` for Sportscast) + typecheck/build where applicable.
2. Deployed: hit the actual production URL for a field/route/behavior that only exists in the version you believe is live. Don't infer deploy status from `git log`/`git status` alone — Railway's connection to GitHub for the Sports Data Platform is unreliable (see above), so pushed ≠ deployed there, and the inverse gap (deployed ahead of what a written report claims) has also happened for Sportscast.
