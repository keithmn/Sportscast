let allSports = [];

function standingRowFormHtml(r = {}, listId) {
  return `
    <div class="row-grid" data-row>
      <input type="text" placeholder="Team name" value="${escapeHtml(r.teamName || '')}" data-field="teamName" list="${listId}">
      <input type="number" placeholder="P" value="${r.played ?? ''}" data-field="played">
      <input type="number" placeholder="W" value="${r.won ?? ''}" data-field="won">
      <input type="number" placeholder="D" value="${r.drawn ?? ''}" data-field="drawn">
      <input type="number" placeholder="L" value="${r.lost ?? ''}" data-field="lost">
      <input type="number" placeholder="GF" value="${r.goalsFor ?? ''}" data-field="goalsFor">
      <input type="number" placeholder="GA" value="${r.goalsAgainst ?? ''}" data-field="goalsAgainst">
      <input type="number" placeholder="Pts" value="${r.points ?? ''}" data-field="points">
      <span class="remove-row" title="Remove row">✕</span>
    </div>`;
}

function fixtureAdminRowHtml(f, listId) {
  const postponedNote = f.originalKickoff
    ? `<div style="font-size:0.72rem; color:var(--text-secondary); grid-column:1/-1;">Originally ${new Date(f.originalKickoff).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>`
    : '';
  return `
    <div class="fixture-admin-row" data-fixture-id="${f.id}">
      <input type="text" value="${escapeHtml(f.homeTeam)}" data-field="homeTeam" placeholder="Home team" list="${listId}">
      <input type="text" value="${escapeHtml(f.awayTeam)}" data-field="awayTeam" placeholder="Away team" list="${listId}">
      <input type="number" value="${f.homeScore ?? ''}" data-field="homeScore" placeholder="H score">
      <input type="number" value="${f.awayScore ?? ''}" data-field="awayScore" placeholder="A score">
      <select data-field="status">
        ${['SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED'].map((s) => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <span>
        <button type="button" class="btn-outline-sm save-fixture-btn">Save</button>
        <button type="button" class="btn-outline-sm delete-fixture-btn" style="color:var(--danger); border-color:var(--danger);">✕</button>
      </span>
      ${postponedNote}
    </div>`;
}

function leagueBlockHtml(league, teamNames) {
  const listId = `teamnames-${league.id}`;
  return `
    <div class="card" style="margin-bottom:2.5rem; cursor:default;">
      <span class="card-eyebrow">${escapeHtml(league.sport.name)} · ${escapeHtml(league.source)}</span>
      <h3 class="card-title">${escapeHtml(league.name)}</h3>
      <datalist id="${listId}">
        ${teamNames.map((n) => `<option value="${escapeHtml(n)}">`).join('')}
      </datalist>

      <div style="margin-top:1.5rem;">
        <span class="section-label" style="font-size:0.68rem;">Standings</span>
        <div id="standings-rows-${league.id}">
          ${league.standings.length ? league.standings.map((r) => standingRowFormHtml(r, listId)).join('') : standingRowFormHtml({}, listId)}
        </div>
        <div style="display:flex; gap:0.75rem; margin-top:0.75rem;">
          <button type="button" class="btn-outline-sm add-row-btn" data-league-id="${league.id}">+ Add Row</button>
          <button type="button" class="btn-sm-red save-standings-btn" data-league-id="${league.id}">Save Standings</button>
        </div>
      </div>

      <div style="margin-top:2rem;">
        <span class="section-label" style="font-size:0.68rem;">Fixtures</span>
        <div id="fixtures-rows-${league.id}">
          ${league.fixtures.map((f) => fixtureAdminRowHtml(f, listId)).join('') || '<p class="empty-state" style="padding:0.5rem 0;">No fixtures yet.</p>'}
        </div>
        <div class="fixture-admin-row" style="margin-top:0.75rem;">
          <input type="text" placeholder="Home team" data-new-fixture="homeTeam" list="${listId}">
          <input type="text" placeholder="Away team" data-new-fixture="awayTeam" list="${listId}">
          <input type="datetime-local" data-new-fixture="kickoff">
          <span></span>
          <span></span>
          <button type="button" class="btn-outline-sm add-fixture-btn" data-league-id="${league.id}">+ Add Fixture</button>
        </div>
      </div>

      <div style="margin-top:2rem;">
        <span class="section-label" style="font-size:0.68rem;">Bulk Import a Season's Fixtures</span>
        <p class="empty-state" style="padding:0 0 0.5rem; font-size:0.8rem;">
          One fixture per line: <code>Home Team vs Away Team | 2026-08-23T15:00</code>
        </p>
        <textarea data-bulk-fixtures="${league.id}" rows="5" style="width:100%; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); padding:0.6rem; font-family:ui-monospace,monospace; font-size:0.82rem;" placeholder="Gor Mahia FC vs Tusker FC | 2026-08-23T15:00
AFC Leopards vs Kakamega Homeboyz | 2026-08-24T15:00"></textarea>
        <button type="button" class="btn-outline-sm bulk-import-btn" data-league-id="${league.id}" style="margin-top:0.5rem;">Import Fixtures</button>
        <p class="form-error bulk-import-error" data-league-id="${league.id}" style="display:none; margin-top:0.5rem;"></p>
      </div>
    </div>`;
}

function collectStandingsRows(leagueId) {
  const rows = [];
  document.querySelectorAll(`#standings-rows-${leagueId} [data-row]`).forEach((rowEl, i) => {
    const teamName = rowEl.querySelector('[data-field="teamName"]').value.trim();
    if (!teamName) return;
    const get = (f) => parseInt(rowEl.querySelector(`[data-field="${f}"]`).value, 10) || 0;
    rows.push({
      position: i + 1, teamName,
      played: get('played'), won: get('won'), drawn: get('drawn'), lost: get('lost'),
      goalsFor: get('goalsFor'), goalsAgainst: get('goalsAgainst'), points: get('points'),
    });
  });
  return rows;
}

// Parses the bulk-import textarea: one fixture per line, "Home vs Away |
// datetime". Blank lines are skipped; anything that doesn't match the
// format is passed through as-is so the server's own validation (and its
// per-line error reporting) is the single source of truth for what's valid.
function parseBulkFixtures(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [teamsPart, kickoffPart] = line.split('|').map((s) => s.trim());
      const [homeTeam, awayTeam] = (teamsPart || '').split(' vs ').map((s) => s.trim());
      return { homeTeam, awayTeam, kickoff: kickoffPart };
    });
}

function changeLogRowHtml(entry) {
  return `
    <div class="fixture-row">
      <span class="fixture-teams" style="font-size:0.88rem; font-weight:600;">${escapeHtml(entry.summary)}</span>
      <span class="fixture-meta">${escapeHtml(entry.userName)} · ${relativeTime(entry.createdAt)}</span>
    </div>`;
}

async function loadChangeLog() {
  const root = document.getElementById('changelog-root');
  if (!root) return;
  try {
    const { entries } = await api('/api/leagues/changelog');
    root.innerHTML = entries.length
      ? entries.map(changeLogRowHtml).join('')
      : '<p class="empty-state">No changes logged yet.</p>';
  } catch (err) {
    root.innerHTML = `<p class="empty-state">Could not load recent changes: ${escapeHtml(err.message)}</p>`;
  }
}

async function loadLeagues() {
  const { leagues } = await api('/api/leagues');
  const root = document.getElementById('leagues-root');
  if (!leagues.length) {
    root.innerHTML = '<p class="empty-state">No leagues added yet — add one above to start entering standings and fixtures.</p>';
    return;
  }

  const fullLeagues = await Promise.all(leagues.map(async (l) => {
    const [{ league }, { teamNames }] = await Promise.all([
      api(`/api/leagues/${l.slug}`),
      api(`/api/leagues/${l.id}/team-names`),
    ]);
    return { league, teamNames };
  }));
  root.innerHTML = fullLeagues.map(({ league, teamNames }) => leagueBlockHtml(league, teamNames)).join('');

  root.querySelectorAll('.add-row-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const listId = `teamnames-${btn.dataset.leagueId}`;
      document.getElementById(`standings-rows-${btn.dataset.leagueId}`).insertAdjacentHTML('beforeend', standingRowFormHtml({}, listId));
    });
  });

  root.querySelectorAll('[data-row] .remove-row').forEach((el) => {
    el.addEventListener('click', () => el.closest('[data-row]').remove());
  });

  root.querySelectorAll('.save-standings-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rows = collectStandingsRows(btn.dataset.leagueId);
      await api(`/api/leagues/${btn.dataset.leagueId}/standings`, { method: 'PUT', body: JSON.stringify({ rows }) });
      loadLeagues();
      loadChangeLog();
    });
  });

  root.querySelectorAll('.add-fixture-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.fixture-admin-row');
      const homeTeam = row.querySelector('[data-new-fixture="homeTeam"]').value.trim();
      const awayTeam = row.querySelector('[data-new-fixture="awayTeam"]').value.trim();
      const kickoff = row.querySelector('[data-new-fixture="kickoff"]').value;
      if (!homeTeam || !awayTeam || !kickoff) return;
      await api(`/api/leagues/${btn.dataset.leagueId}/fixtures`, { method: 'POST', body: JSON.stringify({ homeTeam, awayTeam, kickoff }) });
      loadLeagues();
      loadChangeLog();
    });
  });

  root.querySelectorAll('.save-fixture-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.fixture-admin-row');
      const fixtureId = row.dataset.fixtureId;
      const get = (f) => row.querySelector(`[data-field="${f}"]`).value;
      const homeScoreVal = get('homeScore');
      const awayScoreVal = get('awayScore');
      await api(`/api/leagues/fixtures/${fixtureId}`, {
        method: 'PUT',
        body: JSON.stringify({
          homeTeam: get('homeTeam'),
          awayTeam: get('awayTeam'),
          homeScore: homeScoreVal === '' ? null : parseInt(homeScoreVal, 10),
          awayScore: awayScoreVal === '' ? null : parseInt(awayScoreVal, 10),
          status: get('status'),
        }),
      });
      loadLeagues();
      loadChangeLog();
    });
  });

  root.querySelectorAll('.delete-fixture-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fixtureId = btn.closest('.fixture-admin-row').dataset.fixtureId;
      if (!confirm('Delete this fixture?')) return;
      await api(`/api/leagues/fixtures/${fixtureId}`, { method: 'DELETE' });
      loadLeagues();
      loadChangeLog();
    });
  });

  root.querySelectorAll('.bulk-import-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const leagueId = btn.dataset.leagueId;
      const textarea = root.querySelector(`[data-bulk-fixtures="${leagueId}"]`);
      const errorEl = root.querySelector(`.bulk-import-error[data-league-id="${leagueId}"]`);
      errorEl.style.display = 'none';
      const fixtures = parseBulkFixtures(textarea.value);
      if (!fixtures.length) return;
      try {
        const result = await api(`/api/leagues/${leagueId}/fixtures/bulk`, {
          method: 'POST',
          body: JSON.stringify({ fixtures }),
        });
        if (result.errors.length) {
          errorEl.textContent = `Imported ${result.created}. Skipped: ${result.errors.join('; ')}`;
          errorEl.style.display = 'block';
        }
        loadLeagues();
        loadChangeLog();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    });
  });
}

async function initScoresPage() {
  const user = await requireLogin();
  if (!user) return;

  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('scores-app').style.display = 'block';

  const { sports } = await api('/api/sports');
  allSports = sports;
  document.getElementById('league-sport').innerHTML = sports.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  document.getElementById('add-league-btn').addEventListener('click', async () => {
    const name = document.getElementById('league-name').value.trim();
    const sportId = document.getElementById('league-sport').value;
    if (!name || !sportId) return;
    await api('/api/leagues', { method: 'POST', body: JSON.stringify({ name, sportId }) });
    document.getElementById('league-name').value = '';
    loadLeagues();
    loadChangeLog();
  });

  loadLeagues();
  loadChangeLog();
}

initScoresPage();
