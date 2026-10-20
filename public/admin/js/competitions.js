// Competitions (rebuilt 2026-10-20). One competition at a time, with a tab
// per job — Fixtures, Table, Season, Settings, History — instead of every
// competition's every fixture as editable rows on one page (1.2 million
// pixels tall on a phone, 41,000 inputs, and every save reloaded all of it
// and wiped typing elsewhere). Scores are entered on the Results page.
//
// Deep links: ?competition=<slug>&tab=fixtures|table|season|settings|history
// &fixture=<id> opens that fixture's card (the editor bar and dashboard
// use these).

let allSports = [];
let competitionsList = [];
let classificationOptions = { jurisdictions: [], formats: [], teamTypes: [] };
let current = null; // { competition, seasons, teamNames }
let currentTab = 'fixtures';
let currentRound = null;
let focusFixtureId = null;
const LAST_KEY = 'sc-competitions-last';
const TABS = [['fixtures', 'Fixtures'], ['table', 'Table'], ['season', 'Season'], ['settings', 'Settings'], ['history', 'History']];
const STATUS_LABELS = { SCHEDULED: 'Scheduled', LIVE: 'Live', POSTPONED: 'Postponed', ABANDONED: 'Abandoned', FINISHED: 'Full time' };

const nairobiInput = (iso) => (iso ? new Date(new Date(iso).getTime() + 3 * 3600000).toISOString().slice(0, 16) : '');
const whenText = (iso) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });

function optionLabel(list, key) {
  const found = list.find((o) => o.key === key);
  return found ? found.label : key;
}

// Level / format / teams / tier / governing body — used by "Add a
// competition" (idPrefix, plain ids) and the Settings tab (data attributes).
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

function flash(el, text, isError = false) {
  el.textContent = text;
  el.className = isError ? 'form-error inline-msg' : 'form-success inline-msg';
  el.hidden = false;
}

// ---------- picker ----------

function renderPicker() {
  const showHidden = document.getElementById('show-hidden').checked;
  const list = competitionsList.filter((c) => showHidden || c.isActive);
  const bySport = new Map();
  [...list].sort((a, b) => sportRank(a.sport.slug) - sportRank(b.sport.slug) || compareMatchday(a, b)).forEach((c) => {
    if (!bySport.has(c.sport.name)) bySport.set(c.sport.name, []);
    bySport.get(c.sport.name).push(c);
  });
  const select = document.getElementById('comp-select');
  const keep = select.value;
  select.innerHTML = '<option value="">Choose a competition…</option>' + Array.from(bySport, ([sport, items]) => `
    <optgroup label="${escapeHtml(sport)}">${items.map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}${c.isActive ? '' : ' (hidden)'}</option>`).join('')}</optgroup>`).join('');
  if (keep && list.some((c) => c.slug === keep)) select.value = keep;
}

async function loadList() {
  const { competitions, classification } = await api('/api/competitions?includeInactive=1');
  competitionsList = competitions;
  classificationOptions = classification;
  const addFields = document.getElementById('add-competition-classification');
  if (addFields && !addFields.children.length) addFields.innerHTML = classificationFieldsHtml({ jurisdiction: 'NATIONAL', format: 'LEAGUE', teamType: 'CLUB' }, 'competition');
  renderPicker();
}

// ---------- one competition ----------

async function openCompetition(slug, { tab, fixtureId } = {}) {
  const panel = document.getElementById('comp-panel');
  if (!slug) { panel.innerHTML = ''; current = null; return; }
  panel.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const { competition } = await api(`/api/competitions/${encodeURIComponent(slug)}`);
    const [{ teamNames }, { seasons }] = await Promise.all([
      api(`/api/competitions/${competition.id}/team-names`).catch(() => ({ teamNames: [] })),
      api(`/api/competitions/${competition.id}/seasons`).catch(() => ({ seasons: [] })),
    ]);
    current = { competition, seasons, teamNames };
    if (tab) currentTab = tab;
    focusFixtureId = fixtureId || null;
    currentRound = null;
    document.getElementById('team-options').innerHTML = teamNames.map((n) => `<option value="${escapeHtml(n)}">`).join('');
    try { localStorage.setItem(LAST_KEY, slug); } catch { /* private mode */ }
    const url = new URL(window.location.href);
    url.searchParams.set('competition', slug);
    url.searchParams.set('tab', currentTab);
    if (!fixtureId) url.searchParams.delete('fixture');
    history.replaceState(null, '', url);
    renderPanel();
  } catch (err) {
    panel.innerHTML = `<p class="empty-state">Could not load this competition: ${escapeHtml(err.message)}</p>`;
  }
}

function renderPanel() {
  const c = current.competition;
  const panel = document.getElementById('comp-panel');
  panel.innerHTML = `
    <div class="comp-head">
      <span class="card-eyebrow">${escapeHtml(c.sport.name)} · ${escapeHtml(optionLabel(classificationOptions.jurisdictions, c.jurisdiction))}${c.isActive ? '' : ' · HIDDEN from the site'}</span>
      <h2 class="comp-title">${escapeHtml(c.name)}</h2>
      <a class="hint-inline" href="/competition.html?slug=${encodeURIComponent(c.slug)}" target="_blank" rel="noopener">View on site ↗</a>
    </div>
    <div class="comp-tabs" role="tablist">
      ${TABS.map(([key, label]) => `<button type="button" role="tab" data-tab="${key}" class="${key === currentTab ? 'active' : ''}" aria-selected="${key === currentTab}">${label}</button>`).join('')}
    </div>
    <div id="tab-body"></div>`;
  renderTab();
}

function renderTab() {
  const body = document.getElementById('tab-body');
  const url = new URL(window.location.href);
  url.searchParams.set('tab', currentTab);
  history.replaceState(null, '', url);
  ({ fixtures: renderFixturesTab, table: renderTableTab, season: renderSeasonTab, settings: renderSettingsTab, history: renderHistoryTab })[currentTab](body);
}

// ---------- Fixtures tab ----------

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

function defaultRound(rounds, fixtures) {
  if (focusFixtureId) {
    const f = fixtures.find((x) => x.id === focusFixtureId);
    if (f) return f.round || '';
  }
  // The next round still to finish, else the last one.
  const now = Date.now() - 3 * 3600000;
  const upcoming = rounds.find((r) => r.last >= now);
  return (upcoming || rounds[rounds.length - 1] || { key: '' }).key;
}

function fixtureCardHtml(f) {
  const finished = f.status === 'FINISHED';
  const score = finished && f.homeScore != null ? `${f.homeScore}–${f.awayScore}${outcomeText(f) ? ` ${outcomeText(f)}` : ''}` : '';
  const linkNote = !f.homeClubId || !f.awayClubId
    ? `<span class="fx-unlinked" title="Not linked to a club page — fix on Clubs & Players">${!f.homeClubId ? escapeHtml(f.homeTeam) : ''}${!f.homeClubId && !f.awayClubId ? ' and ' : ''}${!f.awayClubId ? escapeHtml(f.awayTeam) : ''} not linked to a club</span>`
    : '';
  return `
    <div class="fx-card ${f.id === focusFixtureId ? 'focus' : ''}" data-fixture-id="${f.id}" id="fx-${f.id}">
      <div class="fx-top">
        <label class="fx-field fx-when">Kick-off (Nairobi)<input type="datetime-local" data-f="kickoff" value="${nairobiInput(f.kickoff)}"></label>
        ${finished
          ? `<span class="fx-final"><strong>${escapeHtml(score)}</strong> · Full time · <a href="/admin/results.html?competition=${encodeURIComponent(current.competition.slug)}">correct on Results</a></span>`
          : `<label class="fx-field">Status<select data-f="status">${['SCHEDULED', 'LIVE', 'POSTPONED', 'ABANDONED'].map((s) => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}</select></label>`}
      </div>
      <div class="fx-teams">
        <input type="text" data-f="homeTeam" value="${escapeHtml(f.homeTeam)}" list="team-options" aria-label="Home team">
        <span>v</span>
        <input type="text" data-f="awayTeam" value="${escapeHtml(f.awayTeam || '')}" list="team-options" aria-label="Away team">
      </div>
      <div class="fx-details">
        <label class="fx-field">Venue<input type="text" data-f="venue" value="${escapeHtml(f.venue?.name || '')}" list="venue-options" placeholder="${f.homeClub?.venue ? `Usually ${escapeHtml(f.homeClub.venue)}` : 'Stadium'}"></label>
        <label class="fx-field">Round<input type="text" data-f="round" value="${escapeHtml(f.round || '')}" placeholder="Matchweek 3"></label>
        <label class="fx-field">Broadcaster<input type="text" data-f="broadcaster" value="${escapeHtml(f.broadcaster || '')}" placeholder="Azam TV"></label>
      </div>
      ${f.originalKickoff ? `<p class="hint-inline">First set for ${escapeHtml(whenText(f.originalKickoff))}.</p>` : ''}
      ${linkNote}
      <div class="fx-actions">
        <button type="button" class="btn-outline-sm fx-save">Save</button>
        <span class="inline-msg" hidden></span>
        <button type="button" class="btn-outline-sm fx-canonical">Data Platform link</button>
        <button type="button" class="btn-outline-sm fx-delete">Delete</button>
      </div>
      <div class="canonical-fixture-panel" hidden></div>
    </div>`;
}

function renderFixturesTab(body) {
  const fixtures = [...current.competition.fixtures].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const rounds = roundsOf(fixtures);
  if (currentRound === null || !rounds.some((r) => r.key === currentRound)) currentRound = defaultRound(rounds, fixtures);
  const inRound = fixtures.filter((f) => (f.round || '') === currentRound);
  body.innerHTML = `
    ${rounds.length ? `<div class="round-chips">${rounds.map((r) => `<button type="button" data-round="${escapeHtml(r.key)}" class="${r.key === currentRound ? 'active' : ''}">${escapeHtml(r.key || 'Other games')}</button>`).join('')}</div>` : ''}
    <div id="fx-list">${inRound.map(fixtureCardHtml).join('') || '<p class="empty-state">No fixtures this season yet — add them below.</p>'}</div>

    <details class="comp-section">
      <summary>Add a fixture</summary>
      <div class="fx-card fx-new">
        <div class="fx-teams">
          <input type="text" data-new="homeTeam" list="team-options" placeholder="Home team">
          <span>v</span>
          <input type="text" data-new="awayTeam" list="team-options" placeholder="Away team">
        </div>
        <div class="fx-details">
          <label class="fx-field">Kick-off (Nairobi)<input type="datetime-local" data-new="kickoff"></label>
          <label class="fx-field">Venue<input type="text" data-new="venue" list="venue-options"></label>
          <label class="fx-field">Round<input type="text" data-new="round" value="${escapeHtml(currentRound || '')}"></label>
          <label class="fx-field">Broadcaster<input type="text" data-new="broadcaster"></label>
        </div>
        <div class="fx-actions"><button type="button" class="btn-red" id="fx-add">Add fixture</button><span class="inline-msg" id="fx-add-msg" hidden></span></div>
      </div>
    </details>

    <details class="comp-section">
      <summary>Import a season's fixtures</summary>
      <p class="hint-inline">One per line, Nairobi time: <code>Home vs Away | 2026-08-23T15:00</code>, optionally <code>| Venue | Round | Broadcaster</code>. Games already in the list are skipped and reported.</p>
      <textarea id="bulk-text" rows="6" class="bulk-text" placeholder="Gor Mahia vs Tusker | 2026-08-23T15:00 | Kasarani | Matchweek 1 | Azam TV"></textarea>
      <div class="fx-actions"><button type="button" class="btn-outline-sm" id="bulk-preview">Check lines</button><button type="button" class="btn-red" id="bulk-import">Import</button></div>
      <p class="inline-msg" id="bulk-msg" hidden></p>
    </details>`;
  if (focusFixtureId) {
    const el = document.getElementById(`fx-${focusFixtureId}`);
    if (el) el.scrollIntoView({ block: 'center' });
  }
}

function parseBulkFixtures(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [teamsPart, kickoffPart, venue, round, broadcaster] = line.split('|').map((s) => s.trim());
    const [homeTeam, awayTeam] = (teamsPart || '').split(/\s+vs?\.?\s+/i).map((s) => s.trim());
    return { homeTeam, awayTeam, kickoff: kickoffPart, venue, round, broadcaster };
  });
}

async function saveFixtureCard(card) {
  const msg = card.querySelector('.inline-msg');
  const get = (f) => { const el = card.querySelector(`[data-f="${f}"]`); return el ? el.value : undefined; };
  const body = { homeTeam: get('homeTeam').trim(), awayTeam: get('awayTeam').trim(), kickoff: get('kickoff'), venue: get('venue'), round: get('round'), broadcaster: get('broadcaster') };
  if (get('status') !== undefined) body.status = get('status');
  if (!body.homeTeam || !body.awayTeam || !body.kickoff) return flash(msg, 'Teams and kick-off are needed', true);
  try {
    const { fixture, createdVenue } = await api(`/api/competitions/fixtures/${card.dataset.fixtureId}`, { method: 'PUT', body: JSON.stringify(body) });
    // Update this fixture in place — other cards keep whatever is typed in them.
    const list = current.competition.fixtures;
    const i = list.findIndex((f) => f.id === fixture.id);
    const venue = body.venue ? { name: body.venue.trim() } : null;
    list[i] = { ...list[i], ...fixture, venue: venue || null };
    card.outerHTML = fixtureCardHtml(list[i]);
    flash(document.querySelector(`#fx-${fixture.id} .inline-msg`), createdVenue ? `Saved — new venue "${createdVenue}" added; check the spelling` : 'Saved');
  } catch (err) {
    flash(msg, err.message, true);
  }
}

// ---------- Table tab ----------

function tableSourceNote(c) {
  if (c.source === 'SCRAPED' && c.externalProvider === 'kenyacup.co.ke') return `This table is replaced every morning from ${escapeHtml(c.externalProvider)}. Changes made here last until the next sync — correct it at the source if it's wrong there.`;
  if (c.source === 'API') return `Synced from ${escapeHtml(c.externalProvider || 'an outside feed')} — changes here are replaced on the next sync.`;
  if (c.canonicalCompetition) return 'Linked to the Data Platform, which supplies the public table; saving here edits this site\'s own copy.';
  return 'Entered by the newsroom.';
}

function standingRowHtml(r = {}) {
  const num = (field, label) => `<input type="number" min="0" inputmode="numeric" data-s="${field}" value="${r[field] ?? ''}" aria-label="${label}">`;
  return `
    <div class="st-row">
      <input type="text" data-s="teamName" value="${escapeHtml(r.teamName || '')}" list="team-options" aria-label="Team" class="st-team">
      ${num('played', 'Played')}${num('won', 'Won')}${num('drawn', 'Drawn')}${num('lost', 'Lost')}${num('goalsFor', 'For')}${num('goalsAgainst', 'Against')}${num('points', 'Points')}
      <button type="button" class="st-remove" aria-label="Remove row">✕</button>
    </div>`;
}

function renderTableTab(body) {
  const c = current.competition;
  body.innerHTML = `
    <p class="table-source">${tableSourceNote(c)}</p>
    <div class="st-grid">
      <div class="st-row st-head"><span>Team</span><span>P</span><span>W</span><span>D</span><span>L</span><span>For</span><span>Agst</span><span>Pts</span><span></span></div>
      <div id="st-rows">${(c.standings.length ? c.standings : [{}]).map(standingRowHtml).join('')}</div>
    </div>
    <div class="fx-actions">
      <button type="button" class="btn-outline-sm" id="st-add">+ Add team</button>
      <button type="button" class="btn-red" id="st-save">Save table</button>
      ${c.tableFromResults ? '<button type="button" class="btn-outline-sm" id="st-rebuild">Rebuild from results</button>' : ''}
      <span class="inline-msg" id="st-msg" hidden></span>
    </div>
    <p class="hint-inline">Rows are saved in the order shown — first row is first place. Points deductions: enter the points the league publishes; the public table explains the difference.</p>`;
}

function collectStandings() {
  const rows = [];
  document.querySelectorAll('#st-rows .st-row').forEach((rowEl) => {
    const teamName = rowEl.querySelector('[data-s="teamName"]').value.trim();
    if (!teamName) return;
    const get = (f) => parseInt(rowEl.querySelector(`[data-s="${f}"]`).value, 10) || 0;
    rows.push({ position: rows.length + 1, teamName, played: get('played'), won: get('won'), drawn: get('drawn'), lost: get('lost'), goalsFor: get('goalsFor'), goalsAgainst: get('goalsAgainst'), points: get('points') });
  });
  return rows;
}

// ---------- Season tab ----------

function renderSeasonTab(body) {
  const { competition, seasons } = current;
  const current_ = seasons.find((s) => s.isCurrent);
  const now = Date.now();
  const planned = seasons.filter((s) => !s.isCurrent && s.startsOn && new Date(s.startsOn).getTime() > now);
  const past = seasons.filter((s) => !s.isCurrent && !planned.includes(s));
  const day = (d) => (d ? new Date(new Date(d).getTime() + 3 * 3600000).toISOString().slice(0, 10) : '');
  const row = (season, tag) => `
    <div class="season-edit-row" data-season-id="${season.id}">
      <span class="season-tag">${tag}</span>
      <input type="text" class="season-label" value="${escapeHtml(season.label)}" aria-label="Season name">
      <label class="hint-inline">Starts <input type="date" class="season-starts" value="${day(season.startsOn)}"></label>
      <label class="hint-inline">Ends <input type="date" class="season-ends" value="${day(season.endsOn)}"></label>
      <button type="button" class="btn-outline-sm save-season-btn">Save</button>
      <span class="inline-msg" hidden></span>
    </div>`;
  body.innerHTML = `
    <div class="season-box">
      ${current_ ? row(current_, 'Current') : '<p class="hint-inline">No season yet — one is created with the first fixture or table entry.</p>'}
      ${planned.map((p) => row(p, 'Planned')).join('')}
      <div class="season-new">
        <input type="text" id="new-season-label" placeholder="Next season, e.g. 2026/27">
        <label class="hint-inline">Starts <input type="date" id="new-season-starts"></label>
        <button type="button" class="btn-outline-sm" id="start-season-btn">Plan next season</button>
        <span class="inline-msg" id="season-msg" hidden></span>
      </div>
      <p class="hint-inline">With a start date in the future, the new season switches on by itself that day and the site keeps showing the current one until then. With no start date it starts now, and ${escapeHtml(competition.name)}'s public table empties until results come in.</p>
      ${past.length ? `<p class="source-note">Past seasons (kept and viewable on the site): ${past.map((p) => escapeHtml(p.label)).join(', ')}</p>` : ''}
    </div>`;
}

// ---------- Settings tab ----------

function renderSettingsTab(body) {
  const c = current.competition;
  body.innerHTML = `
    <div class="comp-settings">
      <div class="form-row">
        <div class="form-field"><label for="set-name">Name</label><input type="text" id="set-name" value="${escapeHtml(c.name)}"></div>
        <div class="form-field"><label for="set-region">Coverage</label>
          <select id="set-region"><option value="KENYA" ${c.region === 'KENYA' ? 'selected' : ''}>Kenyan — shown first, always listed</option><option value="GLOBAL" ${c.region !== 'KENYA' ? 'selected' : ''}>International — collapsed, listed once it has data</option></select>
        </div>
      </div>
      <div class="form-row classification-row">${classificationFieldsHtml(c)}</div>
      <div class="fx-actions"><button type="button" class="btn-red" id="set-save">Save settings</button><span class="inline-msg" id="set-msg" hidden></span></div>

      <div class="comp-section-box">
        <strong>On the public site</strong>
        <p class="hint-inline">${c.isActive ? 'Shown. Hiding keeps every result and table, and stops any sync.' : 'Hidden from readers (editors can still open it).'}</p>
        <button type="button" class="btn-outline-sm" id="set-visibility">${c.isActive ? 'Hide from the site' : 'Show on the site'}</button>
      </div>

      ${c.source === 'API' ? `
        <div class="comp-section-box">
          <strong>Squads</strong>
          <label class="checkbox-row"><input type="checkbox" id="set-squads" ${c.syncSquads ? 'checked' : ''}> <span>Sync club and player rosters from Wikidata once a day</span></label>
        </div>` : ''}

      <div class="comp-section-box">
        <strong>Data Platform</strong>
        ${canonicalLinkWidgetHtml('competition', c.id, c.canonicalCompetition)}
      </div>
    </div>`;
  wireCanonicalLinkWidgets(body, { endpointFor: (kind, localId) => `/api/competitions/${localId}/canonical-competition`, onChange: () => openCompetition(c.slug, { tab: 'settings' }) });
}

// ---------- History tab ----------

async function renderHistoryTab(body) {
  body.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const { entries } = await api(`/api/competitions/changelog?competition=${current.competition.id}`);
    body.innerHTML = entries.length
      ? `<div class="history-list">${entries.map((e) => `<div class="history-row"><span>${escapeHtml(e.summary)}</span><span class="hint-inline">${escapeHtml(e.userName)} · ${relativeTime(e.createdAt)}</span></div>`).join('')}</div>`
      : '<p class="empty-state">No changes recorded for this competition yet.</p>';
  } catch (err) {
    body.innerHTML = `<p class="empty-state">Could not load: ${escapeHtml(err.message)}</p>`;
  }
}

// ---------- events ----------

function wirePanelEvents() {
  const panel = document.getElementById('comp-panel');

  panel.addEventListener('click', async (e) => {
    const c = current && current.competition;
    const tab = e.target.closest('.comp-tabs button');
    if (tab) { currentTab = tab.dataset.tab; renderPanel(); return; }
    const chip = e.target.closest('.round-chips button');
    if (chip) { currentRound = chip.dataset.round; focusFixtureId = null; renderTab(); return; }

    const card = e.target.closest('.fx-card[data-fixture-id]');
    if (e.target.closest('.fx-save') && card) { saveFixtureCard(card); return; }
    if (e.target.closest('.fx-delete') && card) {
      if (!confirm('Delete this fixture? Any match report linked to it loses the link.')) return;
      try {
        await api(`/api/competitions/fixtures/${card.dataset.fixtureId}`, { method: 'DELETE' });
        current.competition.fixtures = current.competition.fixtures.filter((f) => f.id !== card.dataset.fixtureId);
        card.remove();
      } catch (err) { flash(card.querySelector('.inline-msg'), err.message, true); }
      return;
    }
    if (e.target.closest('.fx-canonical') && card) {
      const box = card.querySelector('.canonical-fixture-panel');
      box.hidden = !box.hidden;
      if (box.hidden) return;
      box.innerHTML = '<p class="hint-inline">Loading…</p>';
      const [{ canonicalFixture }, { candidates }] = await Promise.all([
        api(`/api/competitions/fixtures/${card.dataset.fixtureId}/canonical-fixture`),
        api(`/api/competitions/fixtures/${card.dataset.fixtureId}/canonical-fixture-candidates`),
      ]);
      box.innerHTML = canonicalFixturePanelHtml({ current: canonicalFixture, candidates });
      wireCanonicalFixturePanel(box, card.dataset.fixtureId);
      return;
    }

    if (e.target.id === 'fx-add') {
      const box = e.target.closest('.fx-new');
      const v = (k) => box.querySelector(`[data-new="${k}"]`).value.trim();
      const msg = document.getElementById('fx-add-msg');
      if (!v('homeTeam') || !v('awayTeam') || !v('kickoff')) { flash(msg, 'Both teams and the kick-off are needed', true); return; }
      e.target.disabled = true;
      try {
        const { fixture } = await api(`/api/competitions/${c.id}/fixtures`, { method: 'POST', body: JSON.stringify({ homeTeam: v('homeTeam'), awayTeam: v('awayTeam'), kickoff: v('kickoff'), venue: v('venue'), round: v('round'), broadcaster: v('broadcaster') }) });
        await openCompetition(c.slug, { tab: 'fixtures', fixtureId: fixture.id });
      } catch (err) { e.target.disabled = false; flash(msg, err.message, true); }
      return;
    }
    if (e.target.id === 'bulk-preview' || e.target.id === 'bulk-import') {
      const lines = parseBulkFixtures(document.getElementById('bulk-text').value);
      const msg = document.getElementById('bulk-msg');
      const bad = lines.filter((l) => !l.homeTeam || !l.awayTeam || !l.kickoff);
      if (e.target.id === 'bulk-preview') {
        flash(msg, `${lines.length} line(s): ${lines.length - bad.length} look right${bad.length ? `, ${bad.length} need "Home vs Away | date"` : ''}.`, bad.length > 0);
        return;
      }
      if (!lines.length) return;
      try {
        const result = await api(`/api/competitions/${c.id}/fixtures/bulk`, { method: 'POST', body: JSON.stringify({ fixtures: lines }) });
        await openCompetition(c.slug, { tab: 'fixtures' });
        const notes = [`Imported ${result.created}.`];
        if (result.errors.length) notes.push(`Skipped: ${result.errors.join('; ')}`);
        if (result.createdVenues?.length) notes.push(`New venues — check the spelling: ${[...new Set(result.createdVenues)].join(', ')}`);
        alert(notes.join('\n\n'));
      } catch (err) { flash(msg, err.message, true); }
      return;
    }

    if (e.target.id === 'st-add') { document.getElementById('st-rows').insertAdjacentHTML('beforeend', standingRowHtml()); return; }
    if (e.target.closest('.st-remove')) { e.target.closest('.st-row').remove(); return; }
    if (e.target.id === 'st-save') {
      const msg = document.getElementById('st-msg');
      try {
        await api(`/api/competitions/${c.id}/standings`, { method: 'PUT', body: JSON.stringify({ rows: collectStandings() }) });
        flash(msg, 'Table saved');
      } catch (err) { flash(msg, err.message, true); }
      return;
    }
    if (e.target.id === 'st-rebuild') {
      if (!confirm(`Rebuild the ${c.name} table from this season's confirmed results? It replaces the table shown here — points deductions or awarded games the league announced aren't in the results, so check it afterwards.`)) return;
      try {
        const out = await api(`/api/competitions/${c.id}/standings/recalculate`, { method: 'POST', body: '{}' });
        await openCompetition(c.slug, { tab: 'table' });
        flash(document.getElementById('st-msg'), `Rebuilt: ${out.standings} teams from ${out.fromResults} results`);
      } catch (err) { flash(document.getElementById('st-msg'), err.message, true); }
      return;
    }

    if (e.target.classList.contains('save-season-btn')) {
      const row = e.target.closest('.season-edit-row');
      try {
        await api(`/api/competitions/seasons/${row.dataset.seasonId}`, { method: 'PUT', body: JSON.stringify({ label: row.querySelector('.season-label').value, startsOn: row.querySelector('.season-starts').value || null, endsOn: row.querySelector('.season-ends').value || null }) });
        flash(row.querySelector('.inline-msg'), 'Saved');
      } catch (err) { flash(row.querySelector('.inline-msg'), err.message, true); }
      return;
    }
    if (e.target.id === 'start-season-btn') {
      const label = document.getElementById('new-season-label').value.trim();
      const startsOn = document.getElementById('new-season-starts').value;
      const msg = document.getElementById('season-msg');
      if (!label) { flash(msg, 'Give the season a name, e.g. 2026/27', true); return; }
      const future = startsOn && new Date(`${startsOn}T00:00:00+03:00`).getTime() > Date.now();
      if (!confirm(future
        ? `Plan "${label}" to start on ${startsOn}? It switches on by itself that day; until then the site keeps showing the current season.`
        : `Start "${label}" now? It becomes the current season immediately and the public table is empty until results come in. The previous season stays viewable.`)) return;
      try {
        await api(`/api/competitions/${c.id}/seasons`, { method: 'POST', body: JSON.stringify({ label, startsOn: startsOn || undefined }) });
        await openCompetition(c.slug, { tab: 'season' });
      } catch (err) { flash(msg, err.message, true); }
      return;
    }

    if (e.target.id === 'set-save') {
      const msg = document.getElementById('set-msg');
      const classification = {};
      e.target.closest('.comp-settings').querySelectorAll('[data-classification]').forEach((el) => { classification[el.dataset.classification] = el.value; });
      try {
        await api(`/api/competitions/${c.id}/details`, { method: 'PUT', body: JSON.stringify({ name: document.getElementById('set-name').value, region: document.getElementById('set-region').value }) });
        await api(`/api/competitions/${c.id}/classification`, { method: 'PUT', body: JSON.stringify(classification) });
        await loadList();
        await openCompetition(c.slug, { tab: 'settings' });
        flash(document.getElementById('set-msg'), 'Settings saved');
      } catch (err) { flash(msg, err.message, true); }
      return;
    }
    if (e.target.id === 'set-visibility') {
      const show = !c.isActive;
      if (!confirm(show ? `Show ${c.name} on the public site?` : `Hide ${c.name} from the public site? Its results and tables are kept, and any sync stops.`)) return;
      try {
        await api(`/api/competitions/${c.id}/active`, { method: 'PUT', body: JSON.stringify({ isActive: show }) });
        await loadList();
        await openCompetition(c.slug, { tab: 'settings' });
      } catch (err) { alert(err.message); }
    }
  });

  panel.addEventListener('change', async (e) => {
    if (e.target.id === 'set-squads') {
      try {
        await api(`/api/competitions/${current.competition.id}/sync-squads`, { method: 'PUT', body: JSON.stringify({ syncSquads: e.target.checked }) });
      } catch (err) { e.target.checked = !e.target.checked; alert(err.message); }
    }
  });
}

// Data Platform fixture link — browses candidates between the two clubs'
// linked Teams (unchanged from the previous page).
function canonicalFixturePanelHtml({ current: linked, candidates }) {
  const currentLine = linked
    ? `<p>Linked: <strong>${escapeHtml(linked.homeTeamName)} vs ${escapeHtml(linked.awayTeamName)}</strong> — ${escapeHtml(linked.competitionName || '')} <button type="button" class="btn-outline-sm canonical-fixture-unlink-btn">Unlink</button></p>`
    : '<p class="hint-inline">Not linked.</p>';
  if (candidates === null) return currentLine;
  const lines = candidates.length
    ? candidates.map((c) => `<button type="button" class="canonical-fixture-candidate-btn" data-id="${c.id}">${escapeHtml(c.homeTeamName || '?')} vs ${escapeHtml(c.awayTeamName || '?')} — ${escapeHtml(c.competitionName || '')} (${c.scheduledStart ? new Date(c.scheduledStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'no date'})</button>`).join('')
    : '<p class="hint-inline">No candidates — both clubs need their own Data Platform link first (Clubs & Players).</p>';
  return `${currentLine}${lines}`;
}

function wireCanonicalFixturePanel(box, fixtureId) {
  box.querySelectorAll('.canonical-fixture-candidate-btn').forEach((btn) => btn.addEventListener('click', async () => {
    box.innerHTML = '<p class="hint-inline">Linking…</p>';
    const { canonicalFixture } = await api(`/api/competitions/fixtures/${fixtureId}/canonical-fixture`, { method: 'PUT', body: JSON.stringify({ canonicalFixtureId: btn.dataset.id }) });
    box.innerHTML = canonicalFixturePanelHtml({ current: canonicalFixture, candidates: null });
    wireCanonicalFixturePanel(box, fixtureId);
  }));
  const unlink = box.querySelector('.canonical-fixture-unlink-btn');
  if (unlink) unlink.addEventListener('click', async () => {
    await api(`/api/competitions/fixtures/${fixtureId}/canonical-fixture`, { method: 'DELETE' });
    box.innerHTML = canonicalFixturePanelHtml({ current: null, candidates: null });
    wireCanonicalFixturePanel(box, fixtureId);
  });
}

// ---------- page ----------

async function initCompetitionsPage() {
  const user = await requireLogin();
  if (!user) return;
  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('competitions-app').style.display = 'block';
  initCanonicalLinkOutsideClickHandler();
  ['team-options', 'venue-options'].forEach((id) => {
    const list = document.createElement('datalist');
    list.id = id;
    document.body.appendChild(list);
  });

  const [{ sports }, { venues }] = await Promise.all([api('/api/sports'), api('/api/venues').catch(() => ({ venues: [] }))]);
  allSports = sports;
  document.getElementById('competition-sport').innerHTML = sports.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  document.getElementById('venue-options').innerHTML = venues.map((v) => `<option value="${escapeHtml(v.name)}">`).join('');
  await loadList();
  wirePanelEvents();

  document.getElementById('comp-select').addEventListener('change', (e) => openCompetition(e.target.value, { tab: 'fixtures' }));
  document.getElementById('show-hidden').addEventListener('change', renderPicker);

  document.getElementById('add-competition-btn').addEventListener('click', async () => {
    const name = document.getElementById('competition-name').value.trim();
    const sportId = document.getElementById('competition-sport').value;
    if (!name || !sportId) return;
    const classification = {};
    ['jurisdiction', 'format', 'teamType', 'tier', 'governingBody'].forEach((field) => {
      classification[field] = document.getElementById(`competition-${field}`).value;
    });
    // A near-identical name ("Kenya Premier league" beside "Kenyan Premier
    // League") is refused once; the editor confirms if it really is new.
    let created;
    try {
      ({ competition: created } = await api('/api/competitions', { method: 'POST', body: JSON.stringify({ name, sportId, ...classification }) }));
    } catch (err) {
      if (!/^Already on the site/.test(err.message)) { alert(err.message); return; }
      if (!confirm(`${err.message}\n\nTo enter results, use the Results page instead.\n\nAdd "${name}" as a new competition anyway?`)) return;
      ({ competition: created } = await api('/api/competitions', { method: 'POST', body: JSON.stringify({ name, sportId, ...classification, confirmNew: true }) }));
    }
    document.getElementById('competition-name').value = '';
    document.getElementById('new-competition-form').open = false;
    await loadList();
    document.getElementById('comp-select').value = created.slug;
    openCompetition(created.slug, { tab: 'settings' });
  });

  const params = new URLSearchParams(window.location.search);
  let start = params.get('competition');
  if (!start) { try { start = localStorage.getItem(LAST_KEY); } catch { start = null; } }
  if (start && competitionsList.some((c) => c.slug === start)) {
    const comp = competitionsList.find((c) => c.slug === start);
    if (!comp.isActive) { document.getElementById('show-hidden').checked = true; renderPicker(); }
    document.getElementById('comp-select').value = start;
    openCompetition(start, { tab: params.get('tab') || 'fixtures', fixtureId: params.get('fixture') });
  }
}

initCompetitionsPage();
