// Results page (2026-10-19) — the quick way to enter scores. Two places to
// type a score: "Waiting for a result" (every overdue Kenyan game, all
// competitions) and one competition's round. One Save covers both, using
// the same round-save route as the Competitions page
// (PUT /api/competitions/:id/fixtures/results), so the ChangeLog and the
// followers' full-time push behave exactly as before. "Add games" creates
// results or fixtures that aren't in the system yet
// (POST /api/competitions/:id/games). Tables are never rebuilt silently:
// a "Rebuild table" button follows a save, because a table can carry
// federation decisions (deductions, awarded games) that scores don't show.

// Sports whose table follows from scores alone — mirrors
// server/lib/pointsRules.js (rugby's bonus points, basketball's 2-1 tables
// are entered by hand on the Competitions page).
const TABLE_FROM_RESULTS = new Set(['football', 'hockey']);
const LAST_COMPETITION_KEY = 'sc-results-last-competition';

let competitions = [];
const competitionById = new Map();
let panelCompetition = null; // detail of the competition open in the panel
let panelRound = null;

function nairobiDay(date) {
  return new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' });
}
function nairobiTime(date) {
  return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
}
function nairobiDateInput(date = new Date()) {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---------- score rows ----------

function scoreRowHtml(f, competitionId) {
  const finished = f.status === 'FINISHED' && f.homeScore != null;
  const status = finished ? 'FINISHED' : f.status === 'POSTPONED' ? 'POSTPONED' : '';
  return `
    <div class="result-row ${finished ? 'done' : ''}" data-fixture-id="${f.id}" data-competition-id="${competitionId}"
         data-orig-home="${finished ? f.homeScore : ''}" data-orig-away="${finished ? f.awayScore : ''}" data-orig-status="${status}">
      <span class="team home">${escapeHtml(f.homeTeam)}</span>
      <input type="number" min="0" max="999" inputmode="numeric" data-score="home" value="${finished ? f.homeScore : ''}" aria-label="${escapeHtml(f.homeTeam)} score">
      <span class="dash">–</span>
      <input type="number" min="0" max="999" inputmode="numeric" data-score="away" value="${finished ? f.awayScore : ''}" aria-label="${escapeHtml(f.awayTeam)} score">
      <span class="team">${escapeHtml(f.awayTeam)}</span>
      <span class="when">${escapeHtml(nairobiDay(f.kickoff))} · ${escapeHtml(nairobiTime(f.kickoff))}${f.round ? ` · ${escapeHtml(f.round)}` : ''}</span>
      <select class="row-status" aria-label="Status of ${escapeHtml(f.homeTeam)} v ${escapeHtml(f.awayTeam)}">
        <option value="" ${status === '' ? 'selected' : ''}>Not played yet</option>
        <option value="FINISHED" ${status === 'FINISHED' ? 'selected' : ''}>Full time</option>
        <option value="POSTPONED" ${status === 'POSTPONED' ? 'selected' : ''}>Postponed</option>
      </select>
    </div>`;
}

function rowState(row) {
  const home = row.querySelector('[data-score="home"]').value.trim();
  const away = row.querySelector('[data-score="away"]').value.trim();
  const status = row.querySelector('.row-status').value;
  const changed = status === 'POSTPONED'
    ? row.dataset.origStatus !== 'POSTPONED'
    : (home !== '' || away !== '') && (home !== row.dataset.origHome || away !== row.dataset.origAway || row.dataset.origStatus !== 'FINISHED');
  return { home, away, status, changed };
}

function refreshSavebar() {
  const ids = new Set();
  document.querySelectorAll('.result-row').forEach((row) => {
    const { changed } = rowState(row);
    row.classList.toggle('changed', changed);
    if (changed) ids.add(row.dataset.fixtureId);
  });
  const bar = document.getElementById('savebar');
  bar.hidden = !ids.size;
  document.getElementById('savebar-count').textContent = `${ids.size} result${ids.size === 1 ? '' : 's'} to save`;
}

// One fixture can be on screen twice (waiting list and its round) — keep
// both copies in step so a save never sends two different scores.
function syncCopies(source) {
  const id = source.dataset.fixtureId;
  document.querySelectorAll(`.result-row[data-fixture-id="${id}"]`).forEach((row) => {
    if (row === source) return;
    row.querySelector('[data-score="home"]').value = source.querySelector('[data-score="home"]').value;
    row.querySelector('[data-score="away"]').value = source.querySelector('[data-score="away"]').value;
    row.querySelector('.row-status').value = source.querySelector('.row-status').value;
  });
}

function onRowInput(e) {
  const row = e.target.closest('.result-row');
  if (!row) return;
  if (e.target.matches('[data-score]')) {
    const { home, away } = rowState(row);
    const select = row.querySelector('.row-status');
    if (home !== '' && away !== '') select.value = 'FINISHED';
  }
  if (e.target.matches('.row-status') && e.target.value === 'POSTPONED') {
    row.querySelector('[data-score="home"]').value = '';
    row.querySelector('[data-score="away"]').value = '';
  }
  syncCopies(row);
  refreshSavebar();
}

async function saveAll() {
  const btn = document.getElementById('savebar-btn');
  const problems = [];
  const byCompetition = new Map();
  const seen = new Set();
  document.querySelectorAll('.result-row').forEach((row) => {
    const { home, away, status, changed } = rowState(row);
    if (!changed || seen.has(row.dataset.fixtureId)) return;
    seen.add(row.dataset.fixtureId);
    const teams = `${row.querySelector('.team.home').textContent} v ${row.querySelectorAll('.team')[1].textContent}`;
    let result;
    if (status === 'POSTPONED') {
      result = { fixtureId: row.dataset.fixtureId, status: 'POSTPONED' };
    } else if (home === '' || away === '') {
      problems.push(`${teams}: enter both scores`);
      return;
    } else {
      result = { fixtureId: row.dataset.fixtureId, homeScore: Number(home), awayScore: Number(away) };
    }
    if (!byCompetition.has(row.dataset.competitionId)) byCompetition.set(row.dataset.competitionId, []);
    byCompetition.get(row.dataset.competitionId).push(result);
  });
  if (problems.length) { alert(problems.join('\n')); return; }

  const sourceUrl = document.getElementById('source-url').value.trim();
  btn.disabled = true;
  btn.textContent = 'Saving…';
  const saved = [];
  const failed = [];
  for (const [competitionId, results] of byCompetition) {
    const name = competitionById.get(competitionId)?.name || 'Competition';
    try {
      await api(`/api/competitions/${competitionId}/fixtures/results`, { method: 'PUT', body: JSON.stringify({ results, sourceUrl }) });
      saved.push({ competitionId, name, count: results.length });
    } catch (err) {
      failed.push(`${name}: ${err.message}`);
    }
  }
  btn.disabled = false;
  btn.textContent = 'Save results';
  if (failed.length) alert(`Not saved:\n${failed.join('\n')}`);
  await Promise.all([loadWaiting(), panelCompetition ? openCompetition(panelCompetition.slug, panelRound) : null]);
  showSavedNote(saved);
}

// After a save: what was saved, and the one-tap table rebuild where the
// table follows from scores.
function showSavedNote(saved) {
  if (!saved.length) return;
  const el = document.getElementById('saved-note') || (() => {
    const div = document.createElement('div');
    div.id = 'saved-note';
    document.getElementById('results-app').prepend(div);
    return div;
  })();
  el.innerHTML = `
    <div class="results-note ok" role="status">
      Saved: ${saved.map((s) => `${escapeHtml(s.name)} (${s.count})`).join(', ')}.
    </div>
    <div class="panel-actions">
      ${saved.filter((s) => TABLE_FROM_RESULTS.has(competitionById.get(s.competitionId)?.sport?.slug)).map((s) => `
        <button type="button" class="btn-outline-sm rebuild-btn" data-competition-id="${s.competitionId}">Rebuild ${escapeHtml(s.name)} table</button>`).join('')}
    </div>`;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function rebuildTable(competitionId, button) {
  const name = competitionById.get(competitionId)?.name || 'this competition';
  if (!confirm(`Rebuild the ${name} table from this season's results?\n\nIt replaces the current table. Points deductions or awarded games the league has announced aren't in the results, so check the table afterwards.`)) return;
  button.disabled = true;
  try {
    const out = await api(`/api/competitions/${competitionId}/standings/recalculate`, { method: 'POST' });
    button.textContent = `${name} table rebuilt from ${out.fromResults} results`;
  } catch (err) {
    button.disabled = false;
    alert(err.message);
  }
}

// ---------- waiting for a result ----------

async function loadWaiting() {
  const el = document.getElementById('waiting-list');
  try {
    const { fixtures } = await api('/api/fixtures/overdue');
    if (!fixtures.length) {
      el.innerHTML = '<p class="empty-state">Nothing waiting — every Kenyan game that has kicked off has a result.</p>';
      return;
    }
    const groups = new Map();
    fixtures.forEach((f) => {
      if (!groups.has(f.competition.id)) groups.set(f.competition.id, { competition: f.competition, fixtures: [] });
      groups.get(f.competition.id).fixtures.push(f);
    });
    const ordered = Array.from(groups.values()).sort((a, b) => {
      const ca = competitionById.get(a.competition.id);
      const cb = competitionById.get(b.competition.id);
      return ca && cb ? compareMatchday(ca, cb) : a.competition.name.localeCompare(b.competition.name);
    });
    el.innerHTML = ordered.map((g) => `
      <span class="results-comp-label">${escapeHtml(g.competition.name)} · ${g.fixtures.length}</span>
      ${g.fixtures.map((f) => scoreRowHtml(f, g.competition.id)).join('')}`).join('');
  } catch (err) {
    el.innerHTML = `<p class="empty-state">Could not load: ${escapeHtml(err.message)}</p>`;
  }
  refreshSavebar();
}

// ---------- one competition ----------

function roundsOf(fixtures) {
  const rounds = new Map();
  fixtures.forEach((f) => {
    const key = f.round || '';
    const t = new Date(f.kickoff).getTime();
    if (!rounds.has(key)) rounds.set(key, { key, first: t, last: t });
    const r = rounds.get(key);
    r.first = Math.min(r.first, t);
    r.last = Math.max(r.last, t);
  });
  return Array.from(rounds.values()).sort((a, b) => a.first - b.first);
}

// The round an editor most likely wants: the latest one that has started,
// else the next one.
function defaultRound(rounds) {
  const now = Date.now();
  const started = rounds.filter((r) => r.first <= now);
  return (started.length ? started[started.length - 1] : rounds[0])?.key ?? '';
}

function addGameRowHtml(round) {
  return `
    <div class="add-game-row">
      <div class="wide"><label>Home team</label><input type="text" data-add="homeTeam" list="team-options" autocomplete="off"></div>
      <div><label>Score</label><input type="number" min="0" max="999" inputmode="numeric" data-add="homeScore" placeholder="–"></div>
      <div><label>Score</label><input type="number" min="0" max="999" inputmode="numeric" data-add="awayScore" placeholder="–"></div>
      <div class="wide"><label>Away team</label><input type="text" data-add="awayTeam" list="team-options" autocomplete="off"></div>
      <div><label>Date</label><input type="date" data-add="date" value="${nairobiDateInput()}"></div>
      <div><label>Kick-off</label><input type="time" data-add="time" value="15:00"></div>
      <div><label>Round</label><input type="text" data-add="round" value="${escapeHtml(round || '')}" placeholder="Matchweek 3"></div>
      <div><label>Venue</label><input type="text" data-add="venue" list="venue-options" autocomplete="off"></div>
    </div>`;
}

function renderPanel() {
  const c = panelCompetition;
  const panel = document.getElementById('competition-panel');
  const rounds = roundsOf(c.fixtures);
  if (panelRound === null || !rounds.some((r) => r.key === panelRound)) panelRound = defaultRound(rounds);
  const inRound = c.fixtures
    .filter((f) => (f.round || '') === panelRound)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const tableNote = TABLE_FROM_RESULTS.has(c.sport.slug)
    ? `<button type="button" class="btn-outline-sm rebuild-btn" data-competition-id="${c.id}">Rebuild table from results</button>`
    : `<span class="results-help">${escapeHtml(c.sport.name)} tables aren't worked out from scores alone — update the table on the <a href="/admin/competitions.html">Competitions</a> page.</span>`;

  panel.innerHTML = `
    <p class="results-help" style="margin-top:0.75rem;">${escapeHtml(c.sport.name)} · ${c.fixtures.length} game${c.fixtures.length === 1 ? '' : 's'} this season · <a href="/competition.html?slug=${encodeURIComponent(c.slug)}" target="_blank" rel="noopener">Public page</a></p>
    ${rounds.length ? `
      <div class="round-chips" role="tablist" aria-label="Rounds">
        ${rounds.map((r) => `<button type="button" role="tab" data-round="${escapeHtml(r.key)}" class="${r.key === panelRound ? 'active' : ''}" aria-selected="${r.key === panelRound}">${escapeHtml(r.key || 'Other games')}</button>`).join('')}
      </div>
      <div id="round-rows">${inRound.map((f) => scoreRowHtml(f, c.id)).join('')}</div>` : '<p class="empty-state">No games entered for this season yet — add them below.</p>'}
    <div class="panel-actions">${tableNote}</div>

    <div class="add-games">
      <span class="section-label">Add games</span>
      <p class="results-help">A result or fixture that isn't listed above — fill in both scores for a result, leave them empty for a fixture. Times are Nairobi time.</p>
      <div id="add-rows">${addGameRowHtml(panelRound)}</div>
      <div class="panel-actions">
        <button type="button" class="btn-outline-sm" id="add-row-btn">+ Another game</button>
        <button type="button" class="btn-red" id="add-games-btn">Add to ${escapeHtml(c.name)}</button>
      </div>
      <p class="form-error" id="add-error" style="display:none;"></p>
    </div>`;
  refreshSavebar();
}

async function openCompetition(slug, keepRound = null) {
  const panel = document.getElementById('competition-panel');
  if (!slug) { panel.innerHTML = ''; panelCompetition = null; return; }
  panel.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const { competition } = await api(`/api/competitions/${encodeURIComponent(slug)}`);
    const { teamNames } = await api(`/api/competitions/${competition.id}/team-names`).catch(() => ({ teamNames: [] }));
    document.getElementById('team-options').innerHTML = (teamNames || []).map((n) => `<option value="${escapeHtml(n)}">`).join('');
    panelCompetition = competition;
    panelRound = keepRound;
    renderPanel();
    try { localStorage.setItem(LAST_COMPETITION_KEY, slug); } catch { /* private mode */ }
  } catch (err) {
    panel.innerHTML = `<p class="empty-state">Could not load this competition: ${escapeHtml(err.message)}</p>`;
  }
}

async function addGames() {
  const c = panelCompetition;
  const errorEl = document.getElementById('add-error');
  errorEl.style.display = 'none';
  const games = [];
  document.querySelectorAll('#add-rows .add-game-row').forEach((row) => {
    const v = (k) => row.querySelector(`[data-add="${k}"]`).value.trim();
    if (!v('homeTeam') && !v('awayTeam')) return; // an untouched spare row
    games.push({
      homeTeam: v('homeTeam'),
      awayTeam: v('awayTeam'),
      kickoff: `${v('date')}T${v('time') || '15:00'}`,
      homeScore: v('homeScore'),
      awayScore: v('awayScore'),
      round: v('round'),
      venue: v('venue'),
    });
  });
  if (!games.length) { errorEl.textContent = 'Fill in at least one game.'; errorEl.style.display = 'block'; return; }
  const btn = document.getElementById('add-games-btn');
  btn.disabled = true;
  try {
    const { created } = await api(`/api/competitions/${c.id}/games`, {
      method: 'POST',
      body: JSON.stringify({ games, sourceUrl: document.getElementById('source-url').value.trim() }),
    });
    const round = games[0].round || panelRound;
    await Promise.all([openCompetition(c.slug, round), loadWaiting()]);
    showSavedNote([{ competitionId: c.id, name: c.name, count: created }]);
  } catch (err) {
    btn.disabled = false;
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
}

// ---------- page ----------

function competitionOptionsHtml(waitingCounts) {
  const bySport = new Map();
  [...competitions]
    .sort((a, b) => sportRank(a.sport.slug) - sportRank(b.sport.slug) || compareMatchday(a, b))
    .forEach((c) => {
      if (!bySport.has(c.sport.name)) bySport.set(c.sport.name, []);
      bySport.get(c.sport.name).push(c);
    });
  return '<option value="">Choose a competition…</option>' + Array.from(bySport, ([sport, list]) => `
    <optgroup label="${escapeHtml(sport)}">
      ${list.map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}${waitingCounts.get(c.id) ? ` — ${waitingCounts.get(c.id)} waiting` : ''}</option>`).join('')}
    </optgroup>`).join('');
}

async function initResultsPage() {
  const user = await requireLogin();
  if (!user) return;
  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('results-app').style.display = 'block';
  ['team-options', 'venue-options'].forEach((id) => {
    const list = document.createElement('datalist');
    list.id = id;
    document.body.appendChild(list);
  });

  const [{ competitions: all }, { venues }, { fixtures: overdue }] = await Promise.all([
    api('/api/competitions'),
    api('/api/venues').catch(() => ({ venues: [] })),
    api('/api/fixtures/overdue').catch(() => ({ fixtures: [] })),
  ]);
  // Every competition on the site, Kenyan ones first within each sport.
  competitions = all;
  competitions.forEach((c) => competitionById.set(c.id, c));
  document.getElementById('venue-options').innerHTML = venues.map((v) => `<option value="${escapeHtml(v.name)}">`).join('');
  const waitingCounts = new Map();
  overdue.forEach((f) => waitingCounts.set(f.competition.id, (waitingCounts.get(f.competition.id) || 0) + 1));
  const select = document.getElementById('competition-select');
  select.innerHTML = competitionOptionsHtml(waitingCounts);

  const app = document.getElementById('results-app');
  app.addEventListener('input', onRowInput);
  app.addEventListener('change', onRowInput);
  app.addEventListener('click', (e) => {
    const chip = e.target.closest('.round-chips button');
    if (chip) { panelRound = chip.dataset.round; renderPanel(); return; }
    const rebuild = e.target.closest('.rebuild-btn');
    if (rebuild) { rebuildTable(rebuild.dataset.competitionId, rebuild); return; }
    if (e.target.closest('#add-row-btn')) {
      document.getElementById('add-rows').insertAdjacentHTML('beforeend', addGameRowHtml(panelRound));
      return;
    }
    if (e.target.closest('#add-games-btn')) addGames();
  });
  select.addEventListener('change', () => openCompetition(select.value));
  document.getElementById('savebar-btn').addEventListener('click', saveAll);
  window.addEventListener('beforeunload', (e) => {
    if (!document.getElementById('savebar').hidden) { e.preventDefault(); e.returnValue = ''; }
  });

  await loadWaiting();
  // Open the competition from ?competition=slug, else the last one used, else the one with most waiting.
  let start = new URLSearchParams(location.search).get('competition');
  if (!start) { try { start = localStorage.getItem(LAST_COMPETITION_KEY); } catch { start = null; } }
  if (!start && waitingCounts.size) {
    const [topId] = [...waitingCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    start = competitionById.get(topId)?.slug;
  }
  if (start && competitions.some((c) => c.slug === start)) {
    select.value = start;
    openCompetition(start);
  }
}

initResultsPage();
