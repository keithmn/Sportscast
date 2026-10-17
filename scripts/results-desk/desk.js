#!/usr/bin/env node
// Results desk — the deterministic half of the sportscast-results-desk
// skill (.claude/skills/sportscast-results-desk/SKILL.md). The skill does
// the research (reading official pages, cross-checking outlets) and writes
// a changeset; this script plans it against the live data, reconciles the
// resulting table with the official one, and applies it through the same
// admin API editors use — so every change is logged and notifies followers
// exactly like a hand-entered result.
//
//   node scripts/results-desk/desk.js plan      <changeset.json>
//   node scripts/results-desk/desk.js reconcile <changeset.json> --official <table.json>
//   node scripts/results-desk/desk.js apply     <changeset.json> --official <table.json>
//
// Env: DESK_BASE_URL (default http://localhost:3010), DESK_EMAIL,
// DESK_PASSWORD. A non-localhost DESK_BASE_URL also needs --confirm-remote.
// apply refuses to run unless reconcile passes; competitions with no
// official table pass --skip-reconcile "<reason>" instead, and the reason
// is printed in the report.

const fs = require('fs');
const { normalizeVenueName } = require('../../server/lib/venueResolution');
const { pointsRuleFor, computeTable } = require('../../server/lib/pointsRules');

const BASE = (process.env.DESK_BASE_URL || 'http://localhost:3010').replace(/\/$/, '');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function readJson(path, what) {
  if (!path || !fs.existsSync(path)) fail(`${what} file not found: ${path}`);
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch (err) { fail(`${what} isn't valid JSON: ${err.message}`); }
}

// The Standard publishes on standardmedia.co.ke and thestandard.ke — same
// outlet, so fold them; likewise Capital FM's two domains.
const SAME_OUTLET = { 'thestandard.ke': 'standardmedia.co.ke', 'capitalfm.co.ke': 'capitalfm.africa' };
function isWebUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

function outletOf(url) {
  const host = new URL(url).hostname.toLowerCase();
  const site = host.replace(/^(www|amp|m|test|farmers|farmkenya)\./, '');
  return SAME_OUTLET[site] || site;
}

// ---- changeset validation: catch research mistakes before touching data ----
function validateChangeset(cs) {
  const problems = [];
  if (!cs.competition) problems.push('missing "competition" (slug, e.g. kenyan-premier-league)');
  if (!Array.isArray(cs.fixtures) || !cs.fixtures.length) problems.push('"fixtures" must be a non-empty array');
  (cs.fixtures || []).forEach((f, i) => {
    const at = `fixtures[${i}] (${f.home} v ${f.away})`;
    if (!f.home || !f.away) problems.push(`${at}: home and away are required`);
    if (f.kickoff && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(f.kickoff)) problems.push(`${at}: kickoff must be "YYYY-MM-DDTHH:MM" Nairobi time`);
    const hasScore = f.homeScore !== undefined || f.awayScore !== undefined;
    if (hasScore) {
      const ok = (n) => Number.isInteger(n) && n >= 0 && n <= 999;
      if (!ok(f.homeScore) || !ok(f.awayScore)) problems.push(`${at}: both scores must be whole numbers 0–999 (basketball and rugby regularly pass 100)`);
      // The skill's cross-check rule, enforced: a score needs the official
      // source, or two independent outlets.
      // Two *outlets*, not two links: two articles from the same paper are
      // one source, so count distinct sites (www./amp. variants folded).
      // Real web addresses only — plain text like "The Standard" can't be
      // checked, and two such strings would otherwise count as two outlets.
      const links = Array.isArray(f.confirmedBy) ? f.confirmedBy.filter(Boolean) : [];
      const notUrls = links.filter((u) => !isWebUrl(u));
      if (notUrls.length) problems.push(`${at}: confirmedBy entries must be web addresses (http/https): ${notUrls.join(', ')}`);
      const outlets = new Set(links.filter(isWebUrl).map(outletOf));
      if (!f.official && outlets.size < 2) problems.push(`${at}: a score needs "official": true or links from 2+ different outlets in "confirmedBy"`);
    }
    if (!f.sourceUrl) problems.push(`${at}: sourceUrl is required (where these details came from)`);
    else if (!isWebUrl(f.sourceUrl)) problems.push(`${at}: sourceUrl must be a web address (http/https)`);
  });
  // A fixture is its two teams *and* its date: in a playoff series, or a
  // league meeting then a semi-final, the same pair plays more than once.
  const seen = new Set();
  for (const f of cs.fixtures || []) {
    const key = `${f.home}|${f.away}|${(f.kickoff || '').slice(0, 10)}`;
    if (seen.has(key)) problems.push(`duplicate fixture in changeset: ${f.home} v ${f.away}${f.kickoff ? ` on ${f.kickoff.slice(0, 10)}` : ''}`);
    seen.add(key);
  }
  if (problems.length) fail(`Changeset has problems:\n  - ${problems.join('\n  - ')}`);
}

// ---- API client (session cookie) ----
let cookie = '';
async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) },
  });
  const set = res.headers.getSetCookie?.() || [];
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status}: ${body.error || text.slice(0, 200)}`);
  return body;
}

async function login() {
  const email = process.env.DESK_EMAIL;
  const password = process.env.DESK_PASSWORD;
  if (!email || !password) fail('Set DESK_EMAIL and DESK_PASSWORD (an ADMIN or EDITOR account).');
  await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

function guardRemote() {
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
  if (!local && !process.argv.includes('--confirm-remote')) {
    fail(`${BASE} isn't localhost. Re-run with --confirm-remote once you're sure this should touch that site.`);
  }
}

// ---- plan: match the changeset to existing fixtures, show the diff ----
async function loadCompetition(slug) {
  const { competition } = await api(`/api/competitions/${encodeURIComponent(slug)}`);
  return competition;
}

function sameNairobiMinute(isoUtc, local) {
  if (!local) return true;
  return new Date(`${local}+03:00`).getTime() === new Date(isoUtc).getTime();
}

// Nairobi calendar date of a stored (UTC) kickoff, as "YYYY-MM-DD".
function nairobiDate(isoUtc) {
  return new Date(new Date(isoUtc).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Which existing fixture a changeset row means. Same teams, and:
//  - with a kickoff: the fixture on that Nairobi date. If there's none,
//    a single *unplayed* fixture between the pair is that match moved to a
//    new date (a reschedule) — two or more unplayed ones is ambiguous. A
//    row marked "new": true is always a new fixture (e.g. the next game of
//    a playoff series while an earlier one is still to be played).
//  - without a kickoff: the pair's only fixture this season; with several,
//    the row is ambiguous and must give its kickoff.
function matchFixture(fixtures, f) {
  const pair = fixtures.filter((x) => x.homeTeam === f.home && x.awayTeam === f.away);
  if (!f.kickoff) {
    if (pair.length > 1) return { ambiguous: pair.length };
    return { fixture: pair[0] || null };
  }
  const sameDay = pair.find((x) => nairobiDate(x.kickoff) === f.kickoff.slice(0, 10));
  if (sameDay || f.new) return { fixture: sameDay || null };
  const unplayed = pair.filter((x) => x.status !== 'FINISHED');
  if (unplayed.length > 1) return { ambiguous: unplayed.length, unplayed: true };
  return { fixture: unplayed[0] || null, rescheduled: Boolean(unplayed[0]) };
}

function planChanges(competition, cs) {
  const steps = [];
  for (const f of cs.fixtures) {
    const label = `${f.home} v ${f.away}${f.kickoff ? ` (${f.kickoff.slice(0, 10)})` : ''}`;
    const { fixture: cur, ambiguous, unplayed, rescheduled } = matchFixture(competition.fixtures, f);
    if (ambiguous) {
      const note = unplayed
        ? `no fixture on that date, and ${ambiguous} unplayed fixtures between these teams — give the kickoff of the one being moved, or mark the row "new": true`
        : `${ambiguous} fixtures between these teams this season — add "kickoff" to say which one`;
      steps.push({ kind: 'error', label, note });
      continue;
    }
    if (!cur) {
      if (!f.kickoff) { steps.push({ kind: 'error', label, note: 'not in the database and no kickoff given — cannot create it' }); continue; }
      steps.push({ kind: 'create', label, f });
      if (f.homeScore !== undefined) steps.push({ kind: 'result', label, f, from: 'new fixture' });
      continue;
    }
    const changes = [];
    // Same matching rule the server uses, so "nyayo national stadium" isn't
    // reported as a change from "Nyayo National Stadium".
    if (f.venue !== undefined && normalizeVenueName(cur.venue?.name) !== normalizeVenueName(f.venue)) changes.push(`venue: "${cur.venue?.name || '—'}" → "${f.venue || '—'}"`);
    if (f.round !== undefined && (cur.round || '') !== f.round) changes.push(`round: "${cur.round || '—'}" → "${f.round}"`);
    if (f.broadcaster !== undefined && (cur.broadcaster || '') !== f.broadcaster) changes.push(`broadcaster: "${cur.broadcaster || '—'}" → "${f.broadcaster || '—'}"`);
    if (!sameNairobiMinute(cur.kickoff, f.kickoff)) changes.push(`${rescheduled ? 'RESCHEDULED ' : ''}kickoff: ${cur.kickoff} → ${f.kickoff} (Nairobi)`);
    if (changes.length || (f.sourceUrl && f.sourceUrl !== cur.sourceUrl)) steps.push({ kind: 'details', label, f, cur, changes });
    if (f.homeScore !== undefined) {
      const same = cur.status === 'FINISHED' && cur.homeScore === f.homeScore && cur.awayScore === f.awayScore;
      if (!same) {
        const was = cur.status === 'FINISHED' ? `${cur.homeScore}-${cur.awayScore}` : 'no result';
        steps.push({ kind: cur.status === 'FINISHED' ? 'correction' : 'result', label, f, cur, from: was });
      }
    }
  }
  return steps;
}

function printPlan(steps) {
  if (!steps.length) { console.log('No changes — the database already matches this changeset.'); return; }
  for (const s of steps) {
    if (s.kind === 'create') console.log(`+ create   ${s.label} · ${s.f.kickoff} · ${s.f.venue || 'venue TBC'}${s.f.round ? ` · ${s.f.round}` : ''}`);
    if (s.kind === 'details') console.log(`~ details  ${s.label}${s.changes.length ? `: ${s.changes.join('; ')}` : ' (source link only)'}`);
    if (s.kind === 'result') console.log(`= result   ${s.label}: ${s.f.homeScore}-${s.f.awayScore} (was ${s.from})`);
    if (s.kind === 'correction') console.log(`! CORRECT  ${s.label}: ${s.from} → ${s.f.homeScore}-${s.f.awayScore}  ← changes an already-published score`);
    if (s.kind === 'error') console.log(`✗ error    ${s.label}: ${s.note}`);
  }
}

// ---- reconcile: table from (current results + changeset) vs official ----
function currentResults(competition, cs) {
  const results = new Map();
  for (const f of competition.fixtures) {
    if (f.status === 'FINISHED' && f.homeScore != null && f.awayScore != null) {
      results.set(f.id, { home: f.homeTeam, away: f.awayTeam, homeScore: f.homeScore, awayScore: f.awayScore });
    }
  }
  cs.fixtures.forEach((f, i) => {
    if (f.homeScore === undefined) return;
    const { fixture } = matchFixture(competition.fixtures, f);
    results.set(fixture ? fixture.id : `new-${i}`, { home: f.home, away: f.away, homeScore: f.homeScore, awayScore: f.awayScore });
  });
  return [...results.values()];
}

// Official tables publish different columns: HockeyKE shows goal
// difference but not goals for/against, basketball tables say "points
// for/against". Accept those names, and compare only the columns the
// official row actually has — a missing column isn't a mismatch.
const COLUMN_ALIASES = { pointsFor: 'goalsFor', pointsAgainst: 'goalsAgainst', gf: 'goalsFor', ga: 'goalsAgainst', gd: 'goalDifference' };
const COMPARABLE = ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'goalDifference', 'points'];

function normalizeOfficialRow(o) {
  const out = { team: o.team };
  for (const [k, v] of Object.entries(o)) {
    const key = COLUMN_ALIASES[k] || k;
    if (COMPARABLE.includes(key) && v !== null && v !== undefined) out[key] = Number(v);
  }
  return out;
}

function reconcile(competition, cs, official) {
  const rule = pointsRuleFor(competition.sport?.slug);
  if (!rule) {
    return { ok: false, lines: [`${competition.sport?.name} tables can't be rebuilt from scores alone (e.g. bonus points) — use --skip-reconcile "<reason>"`] };
  }
  const ours = new Map(computeTable(currentResults(competition, cs), rule).map((r) => [r.teamName, { ...r, goalDifference: r.goalsFor - r.goalsAgainst }]));
  const lines = [];
  const officialNames = new Set();
  for (const raw of official) {
    const o = normalizeOfficialRow(raw);
    officialNames.add(o.team);
    const u = ours.get(o.team);
    if (!u) {
      if (o.played === 0) continue;
      lines.push(`${o.team}: on the official table but no results here (name mismatch, or a missing result?)`);
      continue;
    }
    for (const k of COMPARABLE) if (k in o && u[k] !== o[k]) lines.push(`${o.team} ${k}: official ${o[k]}, ours ${u[k]}`);
  }
  for (const name of ours.keys()) if (!officialNames.has(name)) lines.push(`${name}: in our results but not on the official table (name mismatch?)`);
  return { ok: lines.length === 0, lines, teams: official.length };
}

function runReconcile(competition, cs) {
  const skip = argValue('--skip-reconcile');
  if (skip !== undefined) {
    if (!skip.trim()) fail('--skip-reconcile needs a reason, e.g. --skip-reconcile "KBF publishes no table"');
    console.log(`⚠ reconcile skipped: ${skip}`);
    return true;
  }
  const official = readJson(argValue('--official'), 'Official table (--official)');
  if (!Array.isArray(official) || !official.length) fail('Official table must be a non-empty array of {team, played, won, drawn, lost, goalsFor, goalsAgainst, points}');
  const r = reconcile(competition, cs, official);
  if (r.ok) console.log(`✓ reconcile: our table matches the official table on all ${r.teams} teams`);
  else console.log(`✗ reconcile FAILED — ${r.lines.length} difference(s):\n  - ${r.lines.join('\n  - ')}`);
  return r.ok;
}

// ---- apply: through the admin API, then recalc ----
async function apply(competition, cs, steps) {
  const errors = steps.filter((s) => s.kind === 'error');
  if (errors.length) fail(`Plan has errors — fix the changeset first (${errors.map((e) => e.label).join(', ')})`);

  const created = steps.filter((s) => s.kind === 'create');
  if (created.length) {
    const { created: n, errors: errs, createdVenues } = await api(`/api/competitions/${competition.id}/fixtures/bulk`, {
      method: 'POST',
      body: JSON.stringify({ fixtures: created.map(({ f }) => ({ homeTeam: f.home, awayTeam: f.away, kickoff: f.kickoff, venue: f.venue, round: f.round, broadcaster: f.broadcaster, sourceUrl: f.sourceUrl })) }),
    });
    if (errs?.length) fail(`Creating fixtures failed: ${errs.join('; ')}`);
    console.log(`  created ${n} fixture(s)${createdVenues?.length ? ` · new venue(s): ${[...new Set(createdVenues)].join(', ')}` : ''}`);
  }

  for (const s of steps.filter((x) => x.kind === 'details')) {
    const body = { sourceUrl: s.f.sourceUrl };
    for (const k of ['venue', 'round', 'broadcaster', 'kickoff']) if (s.f[k] !== undefined) body[k] = s.f[k];
    const { createdVenue } = await api(`/api/competitions/fixtures/${s.cur.id}`, { method: 'PUT', body: JSON.stringify(body) });
    console.log(`  updated ${s.label}${createdVenue ? ` · new venue: ${createdVenue}` : ''}`);
  }

  const scored = steps.filter((s) => s.kind === 'result' || s.kind === 'correction');
  if (scored.length) {
    const fresh = await loadCompetition(competition.slug);
    const results = scored.map(({ f, label }) => {
      const { fixture } = matchFixture(fresh.fixtures, f);
      if (!fixture) fail(`Couldn't find ${label} after creating it — nothing was scored; re-run plan`);
      return { fixtureId: fixture.id, homeScore: f.homeScore, awayScore: f.awayScore };
    });
    const { saved } = await api(`/api/competitions/${competition.id}/fixtures/results`, { method: 'PUT', body: JSON.stringify({ results }) });
    console.log(`  saved ${saved} result(s)`);
    if (competition.tableFromResults) {
      const r = await api(`/api/competitions/${competition.id}/standings/recalculate`, { method: 'POST', body: '{}' });
      console.log(`  table rebuilt: ${r.standings} teams from ${r.fromResults} result(s)`);
    } else {
      console.log(`  ${competition.sport?.name} table not rebuilt from scores — enter the official standings in admin`);
    }
  }
}

async function main() {
  const [cmd, csPath] = process.argv.slice(2);
  if (!['plan', 'reconcile', 'apply'].includes(cmd)) fail('Usage: desk.js plan|reconcile|apply <changeset.json> [--official table.json | --skip-reconcile "reason"]');
  const cs = readJson(csPath, 'Changeset');
  validateChangeset(cs);
  guardRemote();
  await login();
  const competition = await loadCompetition(cs.competition);
  console.log(`${competition.name} @ ${BASE}${cs.round ? ` — ${cs.round}` : ''}`);
  const steps = planChanges(competition, cs);
  printPlan(steps);
  if (cmd === 'plan') return;
  const ok = runReconcile(competition, cs);
  if (cmd === 'reconcile') { process.exitCode = ok ? 0 : 1; return; }
  if (!ok) fail('Not applying: fix the differences above (or the research behind them) first.');
  if (!steps.length) { console.log('Nothing to apply.'); return; }
  await apply(competition, cs, steps);
  console.log('✓ applied');
}

main().catch((err) => fail(err.message));
