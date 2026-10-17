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
      const ok = (n) => Number.isInteger(n) && n >= 0 && n <= 99;
      if (!ok(f.homeScore) || !ok(f.awayScore)) problems.push(`${at}: both scores must be whole numbers 0–99`);
      // The skill's cross-check rule, enforced: a score needs the official
      // source, or two independent outlets.
      const confirmed = Array.isArray(f.confirmedBy) ? f.confirmedBy.filter(Boolean) : [];
      if (!f.official && confirmed.length < 2) problems.push(`${at}: a score needs "official": true or 2+ URLs in "confirmedBy"`);
    }
    if (!f.sourceUrl) problems.push(`${at}: sourceUrl is required (where these details came from)`);
  });
  const pairs = new Set();
  for (const f of cs.fixtures || []) {
    const key = `${f.home}|${f.away}`;
    if (pairs.has(key)) problems.push(`duplicate fixture in changeset: ${f.home} v ${f.away}`);
    pairs.add(key);
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

function planChanges(competition, cs) {
  const existing = new Map(competition.fixtures.map((f) => [`${f.homeTeam}|${f.awayTeam}`, f]));
  const steps = [];
  for (const f of cs.fixtures) {
    const cur = existing.get(`${f.home}|${f.away}`);
    const label = `${f.home} v ${f.away}`;
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
    if (!sameNairobiMinute(cur.kickoff, f.kickoff)) changes.push(`kickoff: ${cur.kickoff} → ${f.kickoff} (Nairobi)`);
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
function computeTable(competition, cs) {
  const results = new Map();
  for (const f of competition.fixtures) {
    if (f.status === 'FINISHED' && f.homeScore != null && f.awayScore != null) results.set(`${f.homeTeam}|${f.awayTeam}`, [f.homeTeam, f.awayTeam, f.homeScore, f.awayScore]);
  }
  for (const f of cs.fixtures) {
    if (f.homeScore !== undefined) results.set(`${f.home}|${f.away}`, [f.home, f.away, f.homeScore, f.awayScore]);
  }
  const t = new Map();
  const row = (n) => { if (!t.has(n)) t.set(n, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }); return t.get(n); };
  for (const [h, a, hs, as] of results.values()) {
    const H = row(h); const A = row(a);
    H.played++; A.played++; H.goalsFor += hs; H.goalsAgainst += as; A.goalsFor += as; A.goalsAgainst += hs;
    if (hs > as) { H.won++; A.lost++; H.points += 3; } else if (hs < as) { A.won++; H.lost++; A.points += 3; } else { H.drawn++; A.drawn++; H.points++; A.points++; }
  }
  return t;
}

function reconcile(competition, cs, official) {
  if (competition.sport?.slug !== 'football') {
    return { ok: false, lines: [`${competition.sport?.name} tables can't be reconciled from scores alone (bonus points etc.) — use --skip-reconcile "<reason>"`] };
  }
  const ours = computeTable(competition, cs);
  const lines = [];
  const keys = ['played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'points'];
  const officialNames = new Set();
  for (const o of official) {
    officialNames.add(o.team);
    const u = ours.get(o.team);
    if (!u) {
      if (o.played === 0) continue;
      lines.push(`${o.team}: on the official table but no results here (name mismatch, or a missing result?)`);
      continue;
    }
    for (const k of keys) if (u[k] !== o[k]) lines.push(`${o.team} ${k}: official ${o[k]}, ours ${u[k]}`);
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
    const ids = new Map(fresh.fixtures.map((f) => [`${f.homeTeam}|${f.awayTeam}`, f.id]));
    const results = scored.map(({ f }) => ({ fixtureId: ids.get(`${f.home}|${f.away}`), homeScore: f.homeScore, awayScore: f.awayScore }));
    const { saved } = await api(`/api/competitions/${competition.id}/fixtures/results`, { method: 'PUT', body: JSON.stringify({ results }) });
    console.log(`  saved ${saved} result(s)`);
    if (competition.sport?.slug === 'football') {
      const r = await api(`/api/competitions/${competition.id}/standings/recalculate`, { method: 'POST', body: '{}' });
      console.log(`  table rebuilt: ${r.standings} teams from ${r.fromResults} result(s)`);
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
