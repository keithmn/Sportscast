---
name: sportscast-results-desk
description: Update a Kenyan competition on The Sportscast after a round — research fixtures, results, venues and broadcasters from official and public sources, cross-check them, reconcile against the official table, and apply only with the user's approval. Use for requests like "update KPL Matchweek 2", "enter this weekend's results", "add next round's fixtures".
---

# Sportscast results desk

You are the research half of the results desk. You read official and public pages, build a **changeset**, and run `scripts/results-desk/desk.js`, which plans it, reconciles the resulting table against the official table, and applies it through the admin API. **Never write to the database any other way.**

## Ground rules (non-negotiable)

- **Normal page reads only.** Use WebFetch / WebSearch. Respect robots.txt and site terms. If a site blocks automated reading (403, Cloudflare challenge, login wall), **stop using that site and say so** — never retry with other user agents, headless browsers, proxies or any other way around it.
- **Never use the KPL lawsuit defendants as sources** (Sofascore, FotMob, LiveScore, OneFootball, ESPN, Superport — Milestone Games, June 2026). See `scripts/results-desk/sources.json`.
- **Never invent a fact.** A score needs the official source, or two independent outlets that agree. A venue, kick-off time or broadcaster needs at least one named source. Anything unconfirmed stays out of the changeset and goes in your report as an open item.
- **Nothing is applied without the user's explicit go-ahead**, after they've seen the plan. Production (any non-localhost `DESK_BASE_URL`) needs a second, separate confirmation.
- Publishing real KPL data on the public site is still a legal question for Underdawgs (Milestone lawsuit). Don't argue it either way — just mention it if the target is production.

## Steps

1. **Pin the scope.** Competition (slug), season, round(s), and target: `DESK_BASE_URL` (default `http://localhost:3010`, the demo). Ask only if genuinely unclear.

2. **Read the sources** listed for the competition in `scripts/results-desk/sources.json`, official first.
   - KPL: FKF's `table` page (results are implied by it), `fixtures` page (upcoming rounds with venue, time, broadcaster), and `overview` page.
   - Ask WebFetch to reproduce tables **verbatim, without reordering or fixing anything** — summaries garble columns.
   - For each played match, find the score in a match report or results round-up. Cross-check against the official table: every team's played/won/drawn/lost/goals must be explainable by the scores you have.

3. **Write the changeset** to the session scratchpad (not the repo), e.g. `kpl-mw2.json`:

   ```json
   {
     "competition": "kenyan-premier-league",
     "season": "2026/27",
     "round": "Matchweek 2",
     "fixtures": [
       {
         "home": "APS Bomet", "away": "Gor Mahia",
         "kickoff": "2026-10-17T15:00",
         "venue": "Raila Odinga Stadium", "round": "Matchweek 2", "broadcaster": "Azam TV",
         "homeScore": 0, "awayScore": 1,
         "official": true,
         "confirmedBy": ["https://capitalfm.africa/..."],
         "sourceUrl": "https://footballkenya.org/sportpesa-league/fixtures"
       }
     ]
   }
   ```

   - `home`/`away`: exactly as the official table spells them (the database uses FKF's names).
   - `kickoff`: Nairobi time, `YYYY-MM-DDTHH:MM`. Omit if unconfirmed (an existing fixture keeps its date).
   - Omit `homeScore`/`awayScore` for unplayed or unconfirmed matches. With scores, set `"official": true` only if the official table/page confirms it; otherwise list 2+ independent URLs in `confirmedBy`.
   - Omit a detail field you couldn't confirm; use `""` only to deliberately clear a wrong value.
   - Venue names: reuse existing ones (`curl -s $DESK_BASE_URL/api/venues`) — "Nyayo National Stadium", not a new spelling. A venue is a ground's name only: never a bare town ("Kakamega"), a guess, or a note ("Kakamega (per The Standard)") — leave it out instead. `apply` lists any venue it had to create; check every one.
   - The same two teams can meet more than once (playoff series, a league game then a semi-final): always give `kickoff` for those so each row matches the right fixture.
   - A row's `kickoff` finds the fixture on that date. If there's none, and exactly one *unplayed* fixture between the pair exists, the row is that match **rescheduled** — `plan` shows `RESCHEDULED kickoff: … → …`; check it really was moved. For a genuinely extra meeting (the next game of a series while an earlier one is unplayed) add `"new": true`.
   - `confirmedBy` and `sourceUrl` must be real web addresses; "two outlets" means two different sites.

4. **Write the official table** next to it, e.g. `kpl-table.json` — an array of `{ "team", "played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "points" }`, copied from the official table as it stands **after** the round.

5. **Plan, then reconcile** (needs `DESK_EMAIL` / `DESK_PASSWORD` for an ADMIN or EDITOR account):

   ```bash
   node scripts/results-desk/desk.js plan      $SCRATCH/kpl-mw2.json
   node scripts/results-desk/desk.js reconcile $SCRATCH/kpl-mw2.json --official $SCRATCH/kpl-table.json
   ```

   - `plan` lists every create / detail change / result, and flags `! CORRECT` where an already-published score would change — treat those as serious and double-check them.
   - `reconcile` recomputes the table from all results plus your changeset and compares it with the official one. **Any difference means the research is incomplete or wrong** — a missing match, a wrong score, a mismatched team name. Fix the research; never edit the official table to fit.
   - Each sport's points rule lives in `server/lib/pointsRules.js` (football and hockey, 3/1/0). Sports not listed there can't have their table rebuilt from scores: rugby (bonus points) and basketball (no official table; playoffs share the competition). For those use `--skip-reconcile "reason"`, enter the official/best-available table in admin, and say so in the report. Per-sport sources and quirks are in `sources.json` — read the competition's `notes` before starting.

6. **Report to the user and ask for approval**: the plan, the reconcile result, sources used, and open items (unconfirmed scores, TBC venues, source conflicts). Keep it short.

7. **On approval only:**

   ```bash
   node scripts/results-desk/desk.js apply $SCRATCH/kpl-mw2.json --official $SCRATCH/kpl-table.json
   ```

   It re-runs the reconcile and refuses to apply if it fails. Add `--confirm-remote` only after the user has separately confirmed a production target. Then spot-check the public competition page.

8. **Finish with**: what changed, what's still open, and the sources (as links).
