# Decision Log

Major decisions made during the Greatest Form continuous-improvement
build, and why — append-only, newest entries at the bottom of each
section. See `UNDERDAWGS_GREATEST_FORM_BUILD_REPORT.md` for the overall
build status; this file is the reasoning behind specific calls.

## Wave 0 — Baseline audit

**Fresh-seed Show/Episode gap folded into `prisma/seed.js` rather than
automating `backfill-show-episodes.js`.** A clean install never created
the flagship Show/Episode rows — only a manual, undocumented second
script did, so `/api/shows/the-sportscast` 404'd on any fresh setup.
Chose to move the actual logic into `seed.js` itself (the real setup
path going forward) rather than, say, having `postinstall` or `start`
auto-run the backfill script — fewer moving parts, and it's exactly what
a "fresh seed creates a working install" acceptance test expects.
`backfill-show-episodes.js` stays on disk as a retrofit for the one real
remaining use case: a database (e.g. production) seeded before this fix.

**`seed.js` refuses to run with `NODE_ENV=production` unless
`ALLOW_PROD_SEED=true` is set explicitly.** The seed creates well-known
demo credentials (`admin@underdoggs.co.ke` / `underdoggs2026`). The
production `start` script never ran seed automatically (`prisma migrate
deploy && node server/index.js`), so this wasn't a live exposure by
default — but nothing stopped someone from running `npm run seed`
against production by hand, and if that ever happened historically,
that credential should be rotated. This guard prevents it from happening
again; it doesn't retroactively prove it never did.

## Wave 1 — Security & production safety

**Helmet's CSP configured explicitly, not left at the library default or
disabled.** The default CSP would have broken real, existing behavior:
`script-src-attr` defaults to `'none'` and overrides `script-src`
specifically for inline event-handler attributes (this app's own
onerror-based image-fallback pattern, used across most page scripts),
and `style-src` without an explicit Google Fonts allowance blocks the
font `<link>` every page loads. Both were found by actually loading real
pages through a Playwright-driven browser and reading the console's CSP
violation reports — not assumed from reading helmet's docs. The
resulting policy still meaningfully restricts against loading a script
or stylesheet from an arbitrary external host; it doesn't attempt to
remove `'unsafe-inline'` from script-src, which would require migrating
every inline handler to `addEventListener` first — a larger, separate
pass, not part of this wave.

**CSRF: no token-based defense added, left as a documented gap rather
than fixed.** This app is a single Express service serving both public
and admin pages from the same origin — its session cookie is
`sameSite: 'lax'`, which (unlike the Data Platform's genuinely
cross-origin `SameSite=None` admin) already blocks the great majority of
real cross-site POST-with-cookie attacks in modern browsers. Adding real
CSRF tokens to every admin mutation route would be a meaningfully larger
change (every admin form, not just the security-relevant surface) for a
narrower remaining exposure window than the Data Platform's CORS issue
was. Tracked as a P2, not silently ignored.

**Monitoring Source SSRF guard checks at both creation time and fetch
time, not just one.** Creation-time validation alone doesn't catch DNS
rebinding (a hostname resolving to a public IP when the admin adds it,
a private one later); fetch-time validation alone gives an admin no
immediate feedback that a URL was rejected. Both were cheap enough to do
that skipping either would have been the shortcut, not the right call.
Explicitly does **not** re-validate redirect hops (would require
disabling `fetch`'s automatic redirect-following) — stated as a known
residual gap in `server/lib/assertPublicUrl.js` rather than claimed as
full SSRF immunity.

## Wave 7 — API / app readiness

**Fan accounts ship without a password-reset flow, by explicit choice,
not an oversight.** This stack has no email-sending service configured
anywhere (confirmed via grep before building anything) — a "forgot
password" link with nowhere real to send the reset email would be worse
than not offering one at all: it would create the expectation of a
working flow and then silently fail it. `FanAccount` ships as email +
password only; adding reset is real future work gated on an actual email
provider being wired up, not a code change alone.

**Registering doesn't move or copy any Follow/PushSubscription data —
it claims the device's existing `anonymousId` onto the new account
instead.** Both models are already keyed on `anonymousId`, not a user
id; giving `FanAccount` its own `anonymousId` column that can equal the
device's existing one means every follow/subscription made before
registering keeps working identically afterward, with zero rows
touched. Genuine cross-device sync (the SAME account inheriting a
SECOND device's separate anonymousId) is deliberately not built here —
it would need `public/js/follows.js` itself to stop trusting
`localStorage` as the source of truth once signed in, a real client-side
redesign, not a natural extension of this pass.

**The new notification/event mechanism (`server/lib/events.js`) doesn't
introduce a new stored event log.** The Data Platform sibling repo has
one (`DomainEvent`) because nothing there reads it yet and it's meant to
outlive any one consumer. Here, the only real consumer is
`sendPushToFollowers` (already generic, already exists), and Follow's
own `entityType` set (sport/club/competition/player) already defines
what's actually followable — adding a second, parallel event-log table
that nothing else reads would be a speculative abstraction the directive
itself warns against ("complexity must earn its place"), not a genuine
need.

**Sort-direction (`order=asc|desc`) was added on the Data Platform's
list routes; a full `?sort=<field>` selector was not.** Every route
already sorts by the one field that's actually meaningful for it (name,
createdAt, rank); no consumer has asked for a different field, and
accepting an arbitrary field name would mean validating it per-route
against a real Prisma field allowlist — real surface for a need that
doesn't exist yet. `order` alone (flip the existing default) closes the
actual gap: "give me the other direction," not "let me pick anything."
