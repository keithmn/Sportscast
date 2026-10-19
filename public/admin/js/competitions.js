let allSports = [];
// Jurisdiction / format / team-type options, from the /api/competitions
// response (server/lib/competitionClassification.js is the one definition).
let classificationOptions = { jurisdictions: [], formats: [], teamTypes: [] };

function optionLabel(list, key) {
  const found = list.find((o) => o.key === key);
  return found ? found.label : key;
}

// The three selects + governing-body input, used by both the "Add a
// Competition" form (idPrefix set, plain ids) and each competition's
// card (data-field attributes, scoped by data-competition-id).
function classificationFieldsHtml(values, idPrefix) {
  const attr = (field) => (idPrefix ? `id="${idPrefix}-${field}"` : `data-classification="${field}"`);
  const select = (field, label, options) => `
    <div class="form-field">
      <label${idPrefix ? ` for="${idPrefix}-${field}"` : ''}>${label}</label>
      <select ${attr(field)}>
        ${options.map((o) => `<option value="${o.key}" ${o.key === values[field] ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
      </select>
    </div>`;
  return `
    ${select('jurisdiction', 'Level', classificationOptions.jurisdictions)}
    ${select('format', 'Format', classificationOptions.formats)}
    ${select('teamType', 'Teams', classificationOptions.teamTypes)}
    <div class="form-field" style="max-width:6rem;">
      <label${idPrefix ? ` for="${idPrefix}-tier"` : ''}>Tier</label>
      <input type="number" ${attr('tier')} min="1" max="20" placeholder="1" title="1 = top flight within its level; leave empty for cups and tournaments" value="${values.tier == null ? '' : values.tier}">
    </div>
    <div class="form-field">
      <label${idPrefix ? ` for="${idPrefix}-governingBody"` : ''}>Governing body</label>
      <input type="text" ${attr('governingBody')} maxlength="60" placeholder="FKF, CAF, FIFA…" value="${escapeHtml(values.governingBody || '')}">
    </div>`;
}

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
  // Shows whether the two free-text names above resolved to a real Club —
  // re-checked on every Save (server/lib/clubResolution.js). Purely
  // informational: the Club link is a lookup on top of homeTeam/awayTeam,
  // never a replacement for them.
  const clubMatchNote = f.homeClub || f.awayClub
    ? `<div style="font-size:0.72rem; color:var(--gold-text); grid-column:1/-1;">↳ matched: ${f.homeClub ? escapeHtml(f.homeClub.name) : '(unmatched)'} vs ${f.awayClub ? escapeHtml(f.awayClub.name) : '(unmatched)'}</div>`
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
        <button type="button" class="btn-outline-sm canonical-fixture-toggle-btn" style="font-size:0.72rem;">🔗 Canonical</button>
      </span>
      <div class="fixture-details-edit">
        <input type="text" value="${escapeHtml(f.venue?.name || '')}" data-field="venue" placeholder="Venue${f.homeClub?.venue ? ` (usually ${escapeHtml(f.homeClub.venue)})` : ''}" list="venue-options">
        <input type="text" value="${escapeHtml(f.round || '')}" data-field="round" placeholder="Round, e.g. Matchweek 2">
        <input type="text" value="${escapeHtml(f.broadcaster || '')}" data-field="broadcaster" placeholder="Broadcaster, e.g. Azam TV">
      </div>
      ${postponedNote}
      ${clubMatchNote}
      <div class="canonical-fixture-panel" style="display:none; grid-column:1/-1; font-size:0.78rem; margin-top:0.25rem;"></div>
    </div>`;
}

// Wave 9 §8.2 — Fixture has no name to search by, so this browses
// candidates between the fixture's two Clubs' already-linked canonical
// Teams (server/lib/canonicalData.js's listCanonicalFixtureCandidates)
// rather than offering a text-search box. On-demand only (opens on
// click), same "don't eagerly fetch per row" discipline as articles.js's
// canonical-event panel — a competition's fixture list can be long.
function canonicalFixturePanelHtml({ current, candidates }) {
  const currentLine = current
    ? `<p style="margin:0 0 0.35rem;">Linked: <strong>${escapeHtml(current.homeTeamName)} vs ${escapeHtml(current.awayTeamName)}</strong> — ${escapeHtml(current.competitionName || '')} <button type="button" class="btn-outline-sm canonical-fixture-unlink-btn" style="margin-left:0.35rem; padding:0.1rem 0.4rem;">Unlink</button></p>`
    : `<p style="margin:0 0 0.35rem; color:var(--text-secondary);">Not linked.</p>`;
  if (candidates === null) return currentLine;
  const candidateLines = candidates.length
    ? candidates.map((c) => `
        <button type="button" class="canonical-fixture-candidate-btn" data-id="${c.id}" style="display:block; width:100%; text-align:left; padding:0.3rem 0.5rem; border:1px solid var(--border); border-radius:4px; background:none; cursor:pointer; font-size:0.76rem; margin-bottom:0.2rem;">
          ${escapeHtml(c.homeTeamName || '?')} vs ${escapeHtml(c.awayTeamName || '?')} — ${escapeHtml(c.competitionName || '')} (${c.scheduledStart ? new Date(c.scheduledStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'no date'})
        </button>`).join('')
    : `<p style="color:var(--text-secondary);">No candidates found — both this fixture's Clubs need their own canonical Team link first (Clubs admin page).</p>`;
  return `${currentLine}${candidateLines}`;
}

function wireCanonicalFixturePanel(panel, fixtureId) {
  panel.querySelectorAll('.canonical-fixture-candidate-btn').forEach((candidateBtn) => {
    candidateBtn.addEventListener('click', async () => {
      panel.innerHTML = '<p style="color:var(--text-secondary);">Linking…</p>';
      const { canonicalFixture } = await api(`/api/competitions/fixtures/${fixtureId}/canonical-fixture`, {
        method: 'PUT',
        body: JSON.stringify({ canonicalFixtureId: candidateBtn.dataset.id }),
      });
      panel.innerHTML = canonicalFixturePanelHtml({ current: canonicalFixture, candidates: null });
      wireCanonicalFixturePanel(panel, fixtureId);
    });
  });
  const unlinkBtn = panel.querySelector('.canonical-fixture-unlink-btn');
  if (unlinkBtn) {
    unlinkBtn.addEventListener('click', async () => {
      await api(`/api/competitions/fixtures/${fixtureId}/canonical-fixture`, { method: 'DELETE' });
      panel.innerHTML = canonicalFixturePanelHtml({ current: null, candidates: null });
      wireCanonicalFixturePanel(panel, fixtureId);
    });
  }
}

// Read-only history + the one forward action (archive current, start new).
// Standings/fixture entry below this always targets whichever season the
// server resolves as current (see getOrCreateCurrentSeason) — there's no
// "pick a season to edit" control, deliberately: editing history isn't a
// workflow this needs, only recording it and moving forward.
function seasonSectionHtml(competition, seasons) {
  const current = seasons.find((s) => s.isCurrent);
  const past = seasons.filter((s) => !s.isCurrent);
  return `
    <div style="margin-top:1.25rem; padding:0.75rem 1rem; border:1px solid var(--border); border-radius:6px;">
      <span class="section-label" style="font-size:0.68rem;">Season</span>
      <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-top:0.35rem;">
        <span style="font-weight:600;">${current ? escapeHtml(current.label) : '(none yet — set on first fixture or standings entry)'}</span>
        <input type="text" class="new-season-label" data-competition-id="${competition.id}" placeholder="New season label, e.g. 2026/27" style="max-width:220px;">
        <button type="button" class="btn-outline-sm start-season-btn" data-competition-id="${competition.id}">Start New Season</button>
        <span class="form-error start-season-error" data-competition-id="${competition.id}" style="display:none;"></span>
      </div>
      ${past.length ? `<p class="source-note" style="margin-top:0.5rem;">Past seasons (view-only, standings/fixtures preserved): ${past.map((s) => escapeHtml(s.label)).join(', ')}</p>` : ''}
    </div>`;
}

// Match-day results panel: every fixture that has kicked off (or kicks
// off within the next 12 hours) and isn't FINISHED or POSTPONED yet, with
// just two score boxes each — one Save for the whole round instead of one
// per fixture. Rows left blank are simply not submitted.
function dueFixtures(competition) {
  const cutoff = Date.now() + 12 * 60 * 60 * 1000;
  return competition.fixtures
    .filter((f) => !['FINISHED', 'POSTPONED'].includes(f.status) && new Date(f.kickoff).getTime() <= cutoff)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
}

function matchdayPanelHtml(competition) {
  const due = dueFixtures(competition);
  const canRecalculate = competition.tableFromResults;
  const rows = due.map((f) => `
    <div class="matchday-row" data-fixture-id="${f.id}">
      <span class="matchday-team matchday-home">${escapeHtml(f.homeTeam)}</span>
      <input type="number" min="0" max="999" inputmode="numeric" data-score="home" aria-label="${escapeHtml(f.homeTeam)} score">
      <span class="matchday-dash">–</span>
      <input type="number" min="0" max="999" inputmode="numeric" data-score="away" aria-label="${escapeHtml(f.awayTeam)} score">
      <span class="matchday-team">${escapeHtml(f.awayTeam)}</span>
      <span class="matchday-date">${new Date(f.kickoff).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}</span>
    </div>`).join('');
  return `
    <div class="matchday-panel" data-competition-id="${competition.id}">
      <span class="section-label" style="font-size:0.68rem;">Match-day Results</span>
      ${due.length
        ? `<p class="empty-state" style="padding:0 0 0.5rem; font-size:0.8rem;">${due.length} fixture(s) kicked off with no result yet. Fill in what's final, leave the rest blank, save once.</p>${rows}`
        : '<p class="empty-state" style="padding:0 0 0.5rem; font-size:0.8rem;">No fixtures waiting for a result.</p>'}
      <div style="display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:0.75rem;">
        ${due.length ? `<button type="button" class="btn-sm-red save-results-btn" data-competition-id="${competition.id}">Save all results</button>` : ''}
        ${canRecalculate ? `<button type="button" class="btn-outline-sm recalc-table-btn" data-competition-id="${competition.id}">Recalculate table from results</button>` : ''}
      </div>
      <p class="form-error matchday-error" data-competition-id="${competition.id}" style="display:none; margin-top:0.5rem;"></p>
      <p class="matchday-success" data-competition-id="${competition.id}" style="display:none; margin-top:0.5rem; color:var(--gold-text); font-size:0.85rem;"></p>
    </div>`;
}

function competitionBlockHtml(competition, teamNames, seasons) {
  const listId = `teamnames-${competition.id}`;
  return `
    <div class="card" style="margin-bottom:2.5rem; cursor:default;">
      <span class="card-eyebrow">${escapeHtml(competition.sport.name)} · ${escapeHtml(optionLabel(classificationOptions.jurisdictions, competition.jurisdiction))} · ${escapeHtml(competition.source)}${competition.isActive ? '' : ' · HIDDEN'}</span>
      <h3 class="card-title">${escapeHtml(competition.name)}</h3>
      <div class="classification-row" data-competition-id="${competition.id}">
        ${classificationFieldsHtml(competition)}
        <button type="button" class="btn-outline-sm save-classification-btn" data-competition-id="${competition.id}">Save level</button>
        <span class="classification-status" data-competition-id="${competition.id}" role="status"></span>
      </div>
      <label class="checkbox-row" style="margin-top:0.5rem;">
        <input type="checkbox" class="active-toggle" data-competition-id="${competition.id}" ${competition.isActive ? 'checked' : ''}>
        <span style="font-size:0.85rem;">Show on public site (hidden competitions keep their data and stop syncing)</span>
      </label>
      <datalist id="${listId}">
        ${teamNames.map((n) => `<option value="${escapeHtml(n)}">`).join('')}
      </datalist>

      ${seasonSectionHtml(competition, seasons)}

      <label class="checkbox-row" style="margin-top:0.75rem;">
        <input type="checkbox" class="sync-squads-toggle" data-competition-id="${competition.id}" ${competition.syncSquads ? 'checked' : ''}>
        <span style="font-size:0.85rem;">Sync club/player rosters for this competition (Wikidata, once daily — needs standings entered first)</span>
      </label>

      ${canonicalLinkWidgetHtml('competition', competition.id, competition.canonicalCompetition)}

      ${matchdayPanelHtml(competition)}

      <div style="margin-top:1.5rem;">
        <span class="section-label" style="font-size:0.68rem;">Standings</span>
        <div id="standings-rows-${competition.id}">
          ${competition.standings.length ? competition.standings.map((r) => standingRowFormHtml(r, listId)).join('') : standingRowFormHtml({}, listId)}
        </div>
        <div style="display:flex; gap:0.75rem; margin-top:0.75rem;">
          <button type="button" class="btn-outline-sm add-row-btn" data-competition-id="${competition.id}">+ Add Row</button>
          <button type="button" class="btn-sm-red save-standings-btn" data-competition-id="${competition.id}">Save Standings</button>
        </div>
      </div>

      <div style="margin-top:2rem;">
        <span class="section-label" style="font-size:0.68rem;">Fixtures</span>
        <div id="fixtures-rows-${competition.id}">
          ${competition.fixtures.map((f) => fixtureAdminRowHtml(f, listId)).join('') || '<p class="empty-state" style="padding:0.5rem 0;">No fixtures yet.</p>'}
        </div>
        <div class="fixture-admin-row" style="margin-top:0.75rem;">
          <input type="text" placeholder="Home team" data-new-fixture="homeTeam" list="${listId}">
          <input type="text" placeholder="Away team" data-new-fixture="awayTeam" list="${listId}">
          <input type="datetime-local" data-new-fixture="kickoff" title="Kick-off, Nairobi time">
          <span></span>
          <span></span>
          <button type="button" class="btn-outline-sm add-fixture-btn" data-competition-id="${competition.id}">+ Add Fixture</button>
          <div class="fixture-details-edit">
            <input type="text" placeholder="Venue" data-new-fixture="venue" list="venue-options">
            <input type="text" placeholder="Round, e.g. Matchweek 2" data-new-fixture="round">
            <input type="text" placeholder="Broadcaster, e.g. Azam TV" data-new-fixture="broadcaster">
          </div>
        </div>
      </div>

      <div style="margin-top:2rem;">
        <span class="section-label" style="font-size:0.68rem;">Bulk Import a Season's Fixtures</span>
        <p class="empty-state" style="padding:0 0 0.5rem; font-size:0.8rem;">
          One fixture per line, Nairobi time: <code>Home Team vs Away Team | 2026-08-23T15:00</code><br>
          Optionally add venue, round and broadcaster: <code>APS Bomet vs Gor Mahia | 2026-10-17T15:00 | Raila Odinga Stadium | Matchweek 2 | Azam TV</code>. Leave a column empty to skip it, e.g. <code>... | 2026-10-17T15:00 | | Matchweek 2</code>.
        </p>
        <textarea data-bulk-fixtures="${competition.id}" rows="5" style="width:100%; background:var(--bg-surface); border:1px solid var(--border); color:var(--text-primary); padding:0.6rem; font-family:ui-monospace,monospace; font-size:0.82rem;" placeholder="Gor Mahia FC vs Tusker FC | 2026-08-23T15:00
AFC Leopards vs Kakamega Homeboyz | 2026-08-24T15:00"></textarea>
        <button type="button" class="btn-outline-sm bulk-import-btn" data-competition-id="${competition.id}" style="margin-top:0.5rem;">Import Fixtures</button>
        <p class="form-error bulk-import-error" data-competition-id="${competition.id}" style="display:none; margin-top:0.5rem;"></p>
      </div>
    </div>`;
}

function collectStandingsRows(competitionId) {
  const rows = [];
  document.querySelectorAll(`#standings-rows-${competitionId} [data-row]`).forEach((rowEl, i) => {
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
      const [teamsPart, kickoffPart, venue, round, broadcaster] = line.split('|').map((s) => s.trim());
      const [homeTeam, awayTeam] = (teamsPart || '').split(' vs ').map((s) => s.trim());
      return { homeTeam, awayTeam, kickoff: kickoffPart, venue, round, broadcaster };
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
    const { entries } = await api('/api/competitions/changelog');
    root.innerHTML = entries.length
      ? entries.map(changeLogRowHtml).join('')
      : '<p class="empty-state">No changes logged yet.</p>';
  } catch (err) {
    root.innerHTML = `<p class="empty-state">Could not load recent changes: ${escapeHtml(err.message)}</p>`;
  }
}

async function loadCompetitions() {
  const { competitions: all, classification } = await api('/api/competitions?includeInactive=1');
  classificationOptions = classification;
  const addFields = document.getElementById('add-competition-classification');
  if (addFields && !addFields.children.length) {
    addFields.innerHTML = classificationFieldsHtml({ jurisdiction: 'NATIONAL', format: 'LEAGUE', teamType: 'CLUB' }, 'competition');
  }
  // Active competitions first, hidden ones (foreign club leagues, switched
  // off for Kenyan-first coverage) collected at the bottom.
  const competitions = [...all.filter((c) => c.isActive), ...all.filter((c) => !c.isActive)];
  const root = document.getElementById('competitions-root');
  // One shared venue list for every venue input's autocomplete, so editors
  // pick an existing ground ("Nyayo National Stadium") instead of typing a
  // second spelling of it.
  const { venues } = await api('/api/venues');
  let venueList = document.getElementById('venue-options');
  if (!venueList) {
    venueList = document.createElement('datalist');
    venueList.id = 'venue-options';
    document.body.appendChild(venueList);
  }
  venueList.innerHTML = venues.map((v) => `<option value="${escapeHtml(v.name)}">`).join('');
  if (!competitions.length) {
    root.innerHTML = '<p class="empty-state">No competitions added yet — add one above to start entering standings and fixtures.</p>';
    return;
  }

  const fullCompetitions = await Promise.all(competitions.map(async (c) => {
    const [{ competition }, { teamNames }, { seasons }] = await Promise.all([
      api(`/api/competitions/${c.slug}`),
      api(`/api/competitions/${c.id}/team-names`),
      api(`/api/competitions/${c.id}/seasons`),
    ]);
    return { competition, teamNames, seasons };
  }));
  root.innerHTML = fullCompetitions.map(({ competition, teamNames, seasons }) => competitionBlockHtml(competition, teamNames, seasons)).join('');

  wireCanonicalLinkWidgets(root, {
    endpointFor: (kind, localId) => `/api/competitions/${localId}/canonical-competition`,
    onChange: loadCompetitions,
  });

  root.querySelectorAll('.save-classification-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.competitionId;
      const row = root.querySelector(`.classification-row[data-competition-id="${id}"]`);
      const status = row.querySelector('.classification-status');
      const body = {};
      row.querySelectorAll('[data-classification]').forEach((el) => { body[el.dataset.classification] = el.value; });
      btn.disabled = true;
      try {
        await api(`/api/competitions/${id}/classification`, { method: 'PUT', body: JSON.stringify(body) });
        status.textContent = 'Saved';
        loadChangeLog();
      } catch (err) {
        status.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  });

  root.querySelectorAll('.active-toggle').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      await api(`/api/competitions/${checkbox.dataset.competitionId}/active`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: checkbox.checked }),
      });
      loadCompetitions();
      loadChangeLog();
    });
  });

  root.querySelectorAll('.sync-squads-toggle').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      await api(`/api/competitions/${checkbox.dataset.competitionId}/sync-squads`, {
        method: 'PUT',
        body: JSON.stringify({ syncSquads: checkbox.checked }),
      });
      loadChangeLog();
    });
  });

  root.querySelectorAll('.start-season-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const competitionId = btn.dataset.competitionId;
      const input = root.querySelector(`.new-season-label[data-competition-id="${competitionId}"]`);
      const errorEl = root.querySelector(`.start-season-error[data-competition-id="${competitionId}"]`);
      errorEl.style.display = 'none';
      const label = input.value.trim();
      if (!label) return;
      if (!confirm(`Start "${label}" as the new current season? Standings/fixture entry will switch to it immediately; the previous season's data stays intact and viewable.`)) return;
      try {
        await api(`/api/competitions/${competitionId}/seasons`, { method: 'POST', body: JSON.stringify({ label }) });
        loadCompetitions();
        loadChangeLog();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    });
  });

  root.querySelectorAll('.add-row-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const listId = `teamnames-${btn.dataset.competitionId}`;
      document.getElementById(`standings-rows-${btn.dataset.competitionId}`).insertAdjacentHTML('beforeend', standingRowFormHtml({}, listId));
    });
  });

  root.querySelectorAll('[data-row] .remove-row').forEach((el) => {
    el.addEventListener('click', () => el.closest('[data-row]').remove());
  });

  root.querySelectorAll('.save-standings-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rows = collectStandingsRows(btn.dataset.competitionId);
      await api(`/api/competitions/${btn.dataset.competitionId}/standings`, { method: 'PUT', body: JSON.stringify({ rows }) });
      loadCompetitions();
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
      const detail = (k) => row.querySelector(`[data-new-fixture="${k}"]`).value.trim();
      await api(`/api/competitions/${btn.dataset.competitionId}/fixtures`, {
        method: 'POST',
        body: JSON.stringify({ homeTeam, awayTeam, kickoff, venue: detail('venue'), round: detail('round'), broadcaster: detail('broadcaster') }),
      });
      loadCompetitions();
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
      await api(`/api/competitions/fixtures/${fixtureId}`, {
        method: 'PUT',
        body: JSON.stringify({
          homeTeam: get('homeTeam'),
          awayTeam: get('awayTeam'),
          homeScore: homeScoreVal === '' ? null : parseInt(homeScoreVal, 10),
          awayScore: awayScoreVal === '' ? null : parseInt(awayScoreVal, 10),
          status: get('status'),
          venue: get('venue'),
          round: get('round'),
          broadcaster: get('broadcaster'),
        }),
      });
      loadCompetitions();
      loadChangeLog();
    });
  });

  root.querySelectorAll('.delete-fixture-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fixtureId = btn.closest('.fixture-admin-row').dataset.fixtureId;
      if (!confirm('Delete this fixture?')) return;
      await api(`/api/competitions/fixtures/${fixtureId}`, { method: 'DELETE' });
      loadCompetitions();
      loadChangeLog();
    });
  });

  root.querySelectorAll('.canonical-fixture-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.fixture-admin-row');
      const fixtureId = row.dataset.fixtureId;
      const panel = row.querySelector('.canonical-fixture-panel');
      const isOpen = panel.style.display !== 'none';
      if (isOpen) {
        panel.style.display = 'none';
        return;
      }
      panel.style.display = 'block';
      panel.innerHTML = '<p style="color:var(--text-secondary);">Loading…</p>';
      const [{ canonicalFixture }, { candidates }] = await Promise.all([
        api(`/api/competitions/fixtures/${fixtureId}/canonical-fixture`),
        api(`/api/competitions/fixtures/${fixtureId}/canonical-fixture-candidates`),
      ]);
      panel.innerHTML = canonicalFixturePanelHtml({ current: canonicalFixture, candidates });
      wireCanonicalFixturePanel(panel, fixtureId);
    });
  });

  const showMatchdayMessage = (competitionId, { error, success }) => {
    const errorEl = root.querySelector(`.matchday-error[data-competition-id="${competitionId}"]`);
    const okEl = root.querySelector(`.matchday-success[data-competition-id="${competitionId}"]`);
    errorEl.style.display = error ? 'block' : 'none';
    errorEl.textContent = error || '';
    okEl.style.display = success ? 'block' : 'none';
    okEl.textContent = success || '';
  };

  root.querySelectorAll('.save-results-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const competitionId = btn.dataset.competitionId;
      const panel = root.querySelector(`.matchday-panel[data-competition-id="${competitionId}"]`);
      const results = [];
      const problems = [];
      panel.querySelectorAll('.matchday-row').forEach((row) => {
        const h = row.querySelector('[data-score="home"]').value.trim();
        const a = row.querySelector('[data-score="away"]').value.trim();
        if (h === '' && a === '') return;
        if (h === '' || a === '') {
          problems.push(`${row.querySelector('.matchday-home').textContent}: enter both scores or neither`);
          return;
        }
        results.push({ fixtureId: row.dataset.fixtureId, homeScore: parseInt(h, 10), awayScore: parseInt(a, 10) });
      });
      if (problems.length) return showMatchdayMessage(competitionId, { error: problems.join('; ') });
      if (!results.length) return showMatchdayMessage(competitionId, { error: 'No scores entered yet.' });
      btn.disabled = true;
      try {
        const { saved } = await api(`/api/competitions/${competitionId}/fixtures/results`, { method: 'PUT', body: JSON.stringify({ results }) });
        await loadCompetitions();
        loadChangeLog();
        showMatchdayMessage(competitionId, { success: `Saved ${saved} result(s).` });
      } catch (err) {
        btn.disabled = false;
        showMatchdayMessage(competitionId, { error: err.message });
      }
    });
  });

  root.querySelectorAll('.recalc-table-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const competitionId = btn.dataset.competitionId;
      if (!confirm('Rebuild this season\'s table from its finished results? Any hand-entered standings for the current season (e.g. points deductions) will be replaced.')) return;
      btn.disabled = true;
      try {
        const { standings, fromResults } = await api(`/api/competitions/${competitionId}/standings/recalculate`, { method: 'POST', body: '{}' });
        await loadCompetitions();
        loadChangeLog();
        showMatchdayMessage(competitionId, { success: `Table rebuilt: ${standings} teams from ${fromResults} result(s).` });
      } catch (err) {
        btn.disabled = false;
        showMatchdayMessage(competitionId, { error: err.message });
      }
    });
  });

  root.querySelectorAll('.bulk-import-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const competitionId = btn.dataset.competitionId;
      const textarea = root.querySelector(`[data-bulk-fixtures="${competitionId}"]`);
      const errorEl = root.querySelector(`.bulk-import-error[data-competition-id="${competitionId}"]`);
      errorEl.style.display = 'none';
      const fixtures = parseBulkFixtures(textarea.value);
      if (!fixtures.length) return;
      try {
        const result = await api(`/api/competitions/${competitionId}/fixtures/bulk`, {
          method: 'POST',
          body: JSON.stringify({ fixtures }),
        });
        const notes = [];
        if (result.errors.length) notes.push(`Imported ${result.created}. Skipped: ${result.errors.join('; ')}`);
        if (result.createdVenues?.length) notes.push(`New venue(s) added to the list — check the spelling: ${[...new Set(result.createdVenues)].join(', ')}`);
        if (notes.length) {
          errorEl.textContent = notes.join(' — ');
          errorEl.style.display = 'block';
        }
        loadCompetitions();
        loadChangeLog();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
      }
    });
  });
}

async function initCompetitionsPage() {
  const user = await requireLogin();
  if (!user) return;

  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('competitions-app').style.display = 'block';

  initCanonicalLinkOutsideClickHandler();

  const { sports } = await api('/api/sports');
  allSports = sports;
  document.getElementById('competition-sport').innerHTML = sports.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  document.getElementById('add-competition-btn').addEventListener('click', async () => {
    const name = document.getElementById('competition-name').value.trim();
    const sportId = document.getElementById('competition-sport').value;
    if (!name || !sportId) return;
    const classification = {};
    ['jurisdiction', 'format', 'teamType', 'tier', 'governingBody'].forEach((field) => {
      classification[field] = document.getElementById(`competition-${field}`).value;
    });
    await api('/api/competitions', { method: 'POST', body: JSON.stringify({ name, sportId, ...classification }) });
    document.getElementById('competition-governingBody').value = '';
    document.getElementById('competition-tier').value = '';
    document.getElementById('competition-name').value = '';
    loadCompetitions();
    loadChangeLog();
  });

  loadCompetitions();
  loadChangeLog();
}

initCompetitionsPage();
