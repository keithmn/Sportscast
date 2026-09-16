# Final Refinement Report — Pre-OS Stabilization Sprint

Written 2026-09-16. Canonical copy lives here and as an identical copy in the sibling Sportscast repo.

## 1. Summary

This sprint's one question: *can we now build the Operating System without duplicating, guessing, or correcting the foundations in these two repos?* Both repos were audited against 13 specific gaps (5 Sports Data, 8 Sportscast) found by a prior Command-OS-readiness audit, then those gaps were closed — implementation, tests, and documentation, not just a plan. The full 30-object OS object model (`UNDERDAWGS_OS_OBJECT_MODEL.md`) is the direct, load-bearing output: it's what makes the final decision below possible to make with confidence rather than a guess.

## 2. Repositories inspected

- Underdawgs Sports Data Platform (`Underdawgs Rising Group/Underdawgs Sportscast` — confusingly named directory; this is the Sports Data Platform, not the media site)
- The Sportscast media website (`Underdawgs Rising Group/Sportscast`)

## 3. Changes made

See `SPORTS_DATA_ACCEPTANCE_REPORT.md` and `SPORTCAST_ACCEPTANCE_REPORT.md` for the full per-repo breakdown. Headline items:

**Sports Data**: production evidence-storage fail-fast (reverses a prior "never crash" design), Match API strategy decided and implemented (Option B — no standalone `/v1/matches`), Event DomainEvents (4 new types), a new `GET /v1/operations` work-queue endpoint, stale-docs correction.

**Sportscast**: a real, silently-broken contradiction between documented show strategy and actual seed behavior fixed (niche shows were "removed" per `BLUEPRINT.md` §28 but `seed.js` kept recreating them), canonical Fixture/Match linking built from scratch (the one core entity that never had one), canonical results added to public search, an Event→content-graph view, two new OS-facing dashboard cards, cron/job behavior documented for the first time.

## 4. Files changed

Data Platform: 9 source files, 3 new test files, 3 new docs, 1 migration, `UNDERDAWGS_DOMAIN_CONTRACT.md`/`docs/API.md`/`docs/openapi.yaml`/`DEPLOYMENT.md` updated. Full list: `git show --stat` on the Wave 9 commit.

Sportscast: 12 source files, 5 new e2e spec files, 4 new docs, `BLUEPRINT.md`/`UNDERDAWGS_DOMAIN_CONTRACT.md` updated. Not yet committed as of this report.

## 5. Migrations added

One, Data Platform only, purely additive: `20260916162621_wave9_event_domain_events` (4 new `DomainEventType` enum values). Sportscast: none.

## 6. API changes

Data Platform: `GET /v1/fixtures/:id/events`, `/:id/evidence`, `/v1/health`, `/v1/operations`; `GET /v1/fixtures/:id` gains nested `events` (canonical Events + Assignments).

Sportscast: `GET/PUT/DELETE /api/competitions/fixtures/:id/canonical-fixture`, `GET .../canonical-fixture-candidates`, `GET /api/articles/by-event/:canonicalEventId`, `GET /api/fixtures/missing-reports`, `GET /api/episodes/clips/pending`. `GET /api/search` and `GET /api/fixtures/:id` gain new response fields (additive).

## 7. UI changes

Data Platform admin: operations-summary + storage-health cards on the dashboard.

Sportscast admin: canonical-fixture link picker (fixture rows), "Content for this Event" panel (article editor), two new dashboard cards (missing reports, pending clips). Public: Match Hub prefers canonical score when linked; search page gains a labeled canonical-results section.

## 8. Documentation updated

Shared: `UNDERDAWGS_OS_OBJECT_MODEL.md` (new), `UNDERDAWGS_DOMAIN_CONTRACT.md` (both copies).

Data Platform: `CURRENT_ARCHITECTURE.md`, `DATA_OPERATIONS_MODEL.md`, `OPERATIONS_RUNBOOK.md` (all new), `docs/API.md`, `docs/openapi.yaml`, `DEPLOYMENT.md`.

Sportscast: `CURRENT_ARCHITECTURE.md`, `CONTENT_MODEL.md`, `NEWSROOM_OPERATIONS.md`, `JOB_RUNBOOK.md` (all new), `BLUEPRINT.md` §4/§5 rewritten.

## 9. Tests run

Data Platform: `npx vitest run` (apps/api) — 102 tests / 23 files. `tsc --noEmit` on every workspace, `next build` on `apps/admin`.

Sportscast: `npx playwright test` — 52 tests, all passing on the last two full runs.

## 10. Test results

All green as of this report. See both acceptance reports for exact counts and what's new this sprint.

## 11. Failed tests

One transient failure observed in a single full Sportscast Playwright run (`canonical-fixture.spec.js`'s second test), not reproduced on two subsequent full re-runs. Recorded, not chased further — environment-timing, not a product defect, based on the evidence available.

## 12. Known limitations

See both acceptance reports' "Known limitations" sections in full. Headline items: Sports Data's `/v1/operations` caps `unassignedEvents` at 50 (stated, not silent); Sportscast has no persisted job-run log, no canonical-link-failure tracking, no notification-delivery history, and is not safe to run on more than one Railway replica (cron jobs are in-process, documented explicitly for the first time this sprint).

## 13. Remaining P0 issues

**One, Sports Data only**: R2 credentials have never been provisioned in the live production environment. The evidence-storage fail-fast change is correct and will protect production once R2 exists — but deploying it as-is, today, will crash the live `api` service on its next boot. This requires a founder/operator decision (provision R2 first, or accept the outage and fix immediately after) before that specific deploy proceeds. Everything else this sprint produced is deploy-ready independent of this decision, but is bundled in the same commit as the storage change and is therefore held pending it (see §15 for why splitting the deploy was judged riskier than holding it).

## 14. Remaining P1 issues

Sportscast's multi-replica cron-safety gap (real, newly documented, not fixed). Both repos: no cross-repo shared identity for staff who work across both products (`UNDERDAWGS_OS_OBJECT_MODEL.md` object #24, "Owner" — the single most consequential open question for the actual OS build).

## 15. Accepted technical debt

Explicitly accepted, not silently dropped, in both acceptance reports: Sportscast's four un-built dashboard-alert categories (canonical-link issues, failed-canonical-API-calls, notification-delivery issues, persisted job health) — each would need new logging infrastructure or expensive live checks, real future work rather than something to fake for this sprint. Sports Data's lack of scoped API-key permissions (pre-existing, restated as still-accepted).

## 16. OS object model summary

Full detail: `UNDERDAWGS_OS_OBJECT_MODEL.md`. Headline finding: **19 of 30 named objects already have a real, working owner** — the OS's job for those is "call the existing API, store the id," not new schema design. **Five are genuinely new** (Task, Decision, Owner, persisted Alert history, and cross-product Notification Event consumption) — this is the actual net-new build surface, and it's small. **One (Distribution Record) has no home anywhere and shouldn't be fabricated** into existence pre-emptively. The single hardest problem is not a missing object at all — it's that the two repos' `User` tables share no identity, which is the one gap that actually blocks genuine cross-product operations.

## 17. Final gate table

See `SPORTS_DATA_ACCEPTANCE_REPORT.md` (8 gates, all PASS) and `SPORTCAST_ACCEPTANCE_REPORT.md` (10 gates, all PASS) for the full per-gate evidence.

Combined gates:

| Gate | Verdict |
|---|---|
| Shared domain contract current | PASS — both copies updated this sprint |
| OS object model complete | PASS — `UNDERDAWGS_OS_OBJECT_MODEL.md`, all 30 named objects addressed |
| No duplicate ownership confusion | PASS — the object model's explicit "do not duplicate" column exists specifically to prevent this |
| Event/Fixture/Match/Assignment/Content chain understandable | PASS — `DATA_OPERATIONS_MODEL.md` + `CONTENT_MODEL.md` document the full chain end to end |
| Remaining issues are not OS blockers | **PARTIAL** — see §18 |
| Final OS readiness decision made | See §18 |

## 18. Final decision

**B. READY FOR OS BLUEPRINT ONLY, NOT CODE.**

Not A, and here's the honest reasoning rather than a reflexive caution: every design-level condition is genuinely met — the object model is complete, both repos' contracts are documented and match their actual code, the Match/Fixture strategy and show strategy are both settled (not just planned), and Event/content relationships are real and tested. A blueprint for Command OS could be written today with real confidence, not guesswork.

What's not met is narrower and purely operational: **this sprint's own Sports Data changes are committed but not deployed**, and the specific reason is a real, live P0 (§13) — deploying the evidence-storage fix today would crash production because R2 was never provisioned. Sportscast's changes aren't deployed yet either (pending this same combined decision). Building actual OS *code* against API contracts that exist in a repo but not in the running production services would be building against a promise, not a fact — exactly the kind of premature step the directive's own §44 warns against ("do not create the full internal OS before understanding the workflow"). The workflow is understood. The production surface it would integrate against isn't live yet.

**What unblocks A**: resolve the R2 decision (provision credentials, or explicitly accept the deploy risk), deploy both repos' Wave 9 changes, confirm `GET /v1/health` reports `productionSafe: true` live. At that point every one of the eight required conditions is met in fact, not just in the repository, and this decision should be revisited — not re-litigated from scratch, just confirmed against the same gate table above with "deployed" now true.
