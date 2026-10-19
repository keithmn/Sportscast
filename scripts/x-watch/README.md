# X watch

An internal dashboard of the match updates posted by the journalists we
follow on X (Kevin Teya and others), checked against our own fixtures.
It answers one question fast: **is a score out there that our site doesn't
have yet, or has differently?**

- **Admin page:** `/admin/watch.html` (sidebar → X Watch). It lists one row
  per score found, with what our database says: *Matches*, *Differs from
  ours*, *Not entered yet* or *No such fixture*.
- **The watcher:** `scripts/x-watch/watch.js`, which runs on a newsroom Mac
  in its own Chrome profile, logged into X by hand.

## A post is a lead, not a source

Nothing on the X Watch page is public, and the results desk does not accept
a post as confirmation. Use a post to know *where to look*. Before a score
goes on the site, confirm it with the federation or a second outlet, as
`.claude/skills/sportscast-results-desk/SKILL.md` requires.

## The risk you're accepting

X's terms don't allow automated reading of the site. The watcher keeps the
footprint to what a person checking a few profiles would do, but **the X
account it's logged in with could still be restricted or suspended.** Use an
account you can afford to lose access to, and never your main brand account.
The paid X API, or simply asking the journalist to share updates with us
directly, avoids the risk entirely.

What the watcher does to stay polite:

- It opens one profile page at a time and reads only the posts already on
  the page, plus one scroll.
- It pauses about 12 seconds between accounts and runs at most every 15
  minutes (the default is 20), only during watch hours (default 09:00–23:00
  Nairobi).
- **It never works around X.** If X shows a login page, a challenge, a rate
  limit or "Something went wrong", the watcher reports **BLOCKED** to the
  dashboard and **stops**. It doesn't retry, and it doesn't switch browser or
  account. Sort it out by hand in the watcher's Chrome window, then start
  the watcher again.
- It only reads. It never likes, posts, follows or opens messages.

## Setup (once)

1. **Pick a token** of 24 or more random characters, and set it on the server
   as `WATCH_INGEST_TOKEN` (for example in `.env` for the local server, or
   in the Railway variables in production):

   ```sh
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```

2. **Add the accounts** in the admin: X Watch → *Accounts we watch* → enter
   the handle (for example `@handle`) and a name.

3. **Log into X in the watcher's own Chrome profile.** A window opens: log
   in, then close it.

   ```sh
   node scripts/x-watch/watch.js --login
   ```

   The profile lives in `~/.sportscast-x-watch`, outside the repo, so the
   login is never committed.

## Running it

```sh
WATCH_BASE_URL=http://localhost:3000 WATCH_INGEST_TOKEN=<token> \
  node scripts/x-watch/watch.js
```

| Option | Meaning |
|---|---|
| `--once` | Check every account once, then exit (good for a test). |
| `--interval=30` | Minutes between rounds (minimum 15, default 20). |
| `--hours=12-22` | Nairobi hours to watch (default 9-23). |
| `--show` | Show the browser window instead of running in the background. |

Keep it running in a terminal on match days. The dashboard warns when an
account hasn't been checked for two hours.

## How a post becomes a row

1. `server/lib/postParser.js` reads scores out of the text with plain
   patterns: "FT: Gor Mahia 2-1 AFC Leopards", "HT | Tusker 0-0 Bandari",
   "67' Shabana 1–0 Posta Rangers", a roundup with one result per line, and
   "(4-3 pens)". It also tags line-ups, fixtures, transfers and injuries.
2. `server/lib/watchMatching.js` finds our fixture: Kenyan, within two days
   of the post, with the same two teams. It handles nicknames and spellings
   (KCB / Kenya Commercial Bank, Gor Mahia / K'Ogalo, @GorMahia). It then
   compares the score with ours. A "score" with no FT/HT/minute marker only
   counts when one of the teams is one we know.
3. **Ask Claude** (a button on each row) has Claude Haiku read a post the
   patterns couldn't. It only runs when an editor clicks, costs a fraction
   of a cent, and needs `ANTHROPIC_API_KEY` on the server.

To add a nickname, extend `ALIAS_GROUPS` in `server/lib/watchMatching.js`.
