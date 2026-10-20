// Clubs & Players (rebuilt 2026-10-20). Pick a competition, then a club,
// and edit everything about it in one place: name, crest, home ground,
// owner, other names, moving divisions, merging a duplicate, squad (with
// transfers), staff, sponsors. "Names to link" at the top is the work list
// for one identity per club — team names in fixtures that no club owns yet.
// Before this, all 53 clubs loaded at once, the page scrolled sideways on a
// phone, and a club's crest, name and ground couldn't be edited at all.
//
// Deep link: ?club=<slug> (the editor bar uses it).

let competitionsList = [];
let clubsInCompetition = [];
let currentClub = null;
let me = null;
const LAST_KEY = 'sc-clubs-last-competition';

function flash(el, text, isError = false) {
  if (!el) return;
  el.textContent = text;
  el.className = `inline-msg ${isError ? 'form-error' : 'form-success'}`;
  el.hidden = false;
}

// ---------- names to link ----------

async function loadUnlinked() {
  const box = document.getElementById('unlinked-list');
  const { unlinked } = await api('/api/clubs/admin/unlinked').catch(() => ({ unlinked: [] }));
  document.getElementById('unlinked-count').textContent = unlinked.length ? `${unlinked.length}` : '0';
  document.getElementById('unlinked-section').hidden = !unlinked.length;
  box.innerHTML = unlinked.slice(0, 40).map((u) => `
    <div class="unlinked-row" data-team="${escapeHtml(u.team)}" data-competition-id="${u.competition.id}">
      <div><strong>${escapeHtml(u.team)}</strong> <span class="hint-inline">${escapeHtml(u.competition.name)} · ${u.games} game${u.games === 1 ? '' : 's'}</span></div>
      <div class="unlinked-actions">
        ${u.suggestions.map((sg) => `<button type="button" class="btn-outline-sm link-alias-btn" data-club-id="${sg.id}">It's ${escapeHtml(sg.name)}</button>`).join('')}
        <button type="button" class="btn-outline-sm new-club-from-name-btn">Add as a new club</button>
      </div>
    </div>`).join('') + (unlinked.length > 40 ? `<p class="hint-inline">…and ${unlinked.length - 40} more.</p>` : '');
}

// ---------- pickers ----------

function renderCompetitionPicker() {
  const select = document.getElementById('club-comp-select');
  const bySport = new Map();
  [...competitionsList].sort((a, b) => sportRank(a.sport.slug) - sportRank(b.sport.slug) || compareMatchday(a, b)).forEach((c) => {
    if (!bySport.has(c.sport.name)) bySport.set(c.sport.name, []);
    bySport.get(c.sport.name).push(c);
  });
  const options = Array.from(bySport, ([sport, items]) => `<optgroup label="${escapeHtml(sport)}">${items.map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('')}</optgroup>`).join('');
  select.innerHTML = `<option value="">Choose a competition…</option>${options}`;
  document.getElementById('club-competition').innerHTML = competitionsList.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

async function openCompetitionClubs(slug, openClubSlug) {
  const list = document.getElementById('club-list');
  document.getElementById('club-panel').innerHTML = '';
  if (!slug) { list.innerHTML = ''; return; }
  try { localStorage.setItem(LAST_KEY, slug); } catch { /* private mode */ }
  list.innerHTML = '<p class="empty-state">Loading…</p>';
  const { clubs } = await api(`/api/clubs?competition=${encodeURIComponent(slug)}`);
  clubsInCompetition = clubs.sort((a, b) => a.name.localeCompare(b.name));
  list.innerHTML = clubs.length
    ? clubs.map((c) => `
      <button type="button" class="club-chip" data-slug="${escapeHtml(c.slug)}">
        ${crestHtml(c.name, c.crestUrl, 28)}
        <span>${escapeHtml(c.name)}</span>
        ${c.crestUrl ? '' : '<span class="chip-note">no crest</span>'}
      </button>`).join('')
    : '<p class="empty-state">No clubs in this competition yet — add one below.</p>';
  if (openClubSlug) openClub(openClubSlug);
}

// ---------- one club ----------

function personRowHtml(kind, p) {
  const fields = {
    player: [['name', 'Name'], ['position', 'Position'], ['nationality', 'Nationality'], ['age', 'Age', 'number'], ['photoUrl', 'Photo link']],
    staff: [['name', 'Name'], ['role', 'Role (Head Coach…)'], ['nationality', 'Nationality'], ['photoUrl', 'Photo link']],
    sponsor: [['name', 'Name'], ['logoUrl', 'Logo link'], ['website', 'Website']],
  }[kind];
  return `
    <details class="person-row" data-kind="${kind}" data-id="${p.id || ''}">
      <summary>${escapeHtml(p.name || `New ${kind}`)}${p.position ? ` · ${escapeHtml(p.position)}` : ''}${p.role ? ` · ${escapeHtml(p.role)}` : ''}</summary>
      <div class="person-fields">
        ${fields.map(([f, label, type]) => `<label class="fx-field">${label}<input type="${type || 'text'}" data-p="${f}" value="${escapeHtml(p[f] ?? '')}"></label>`).join('')}
        ${kind === 'player' && p.id ? `<label class="fx-field">Transfer to<select data-p="clubId"><option value="">— stays at this club —</option>${otherClubOptions()}</select></label>` : ''}
      </div>
      ${kind === 'player' && p.id ? canonicalLinkWidgetHtml('athlete', p.id, p.canonicalAthlete) : ''}
      <div class="fx-actions">
        <button type="button" class="btn-outline-sm person-save">${p.id ? 'Save' : 'Add'}</button>
        ${p.id ? '<button type="button" class="btn-outline-sm person-delete">Remove</button>' : ''}
        <span class="inline-msg" hidden></span>
      </div>
    </details>`;
}

let sportClubsCache = [];
function otherClubOptions() {
  return sportClubsCache.filter((c) => c.id !== currentClub.id).map((c) => `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.competition.name)}</option>`).join('');
}

async function openClub(slug, { scroll = true } = {}) {
  const panel = document.getElementById('club-panel');
  panel.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const { club } = await api(`/api/clubs/${encodeURIComponent(slug)}`);
    const [{ aliases }, { clubs: all }] = await Promise.all([
      api(`/api/clubs/${club.id}/aliases`),
      api('/api/clubs'),
    ]);
    currentClub = club;
    sportClubsCache = all.filter((c) => c.competition.sport.slug === club.competition.sport.slug).sort((a, b) => a.name.localeCompare(b.name));
    const url = new URL(window.location.href);
    url.searchParams.set('club', club.slug);
    history.replaceState(null, '', url);
    document.querySelectorAll('.club-chip').forEach((b) => b.classList.toggle('active', b.dataset.slug === club.slug));
    const locked = club.source === 'API';
    panel.innerHTML = `
      <div class="club-editor" data-club-id="${club.id}">
        <div class="club-head">
          ${crestHtml(club.name, club.crestUrl, 56)}
          <div><h2 class="comp-title">${escapeHtml(club.name)}</h2>
          <span class="hint-inline">${escapeHtml(club.competition.name)} · <a href="/club.html?slug=${encodeURIComponent(club.slug)}" target="_blank" rel="noopener">View on site ↗</a></span></div>
        </div>
        ${locked ? `<p class="table-source">Synced from Wikidata (last ${club.lastSyncedAt ? formatDate(club.lastSyncedAt) : 'never'}) — squad edits are replaced on the next sync.</p>` : ''}

        <section class="club-section">
          <h3>Details</h3>
          <div class="form-row">
            <label class="fx-field">Name<input type="text" id="cl-name" value="${escapeHtml(club.name)}"></label>
            <label class="fx-field">Home ground<input type="text" id="cl-venue" value="${escapeHtml(club.venue || '')}" list="venue-options" placeholder="Raila Odinga Stadium"></label>
            <label class="fx-field">Owner<input type="text" id="cl-owner" value="${escapeHtml(club.owner || '')}"></label>
          </div>
          <div class="form-row crest-row">
            <label class="fx-field">Crest link<input type="text" id="cl-crest" value="${escapeHtml(club.crestUrl || '')}" placeholder="https://… or upload"></label>
            <label class="fx-field">…or upload<input type="file" id="cl-crest-file" accept="image/png,image/webp,image/jpeg"></label>
            <span id="cl-crest-preview">${crestHtml(club.name, club.crestUrl, 48)}</span>
          </div>
          <p class="hint-inline">Use the club's own crest only — from the club or with its permission. A transparent PNG looks best.</p>
          <div class="fx-actions"><button type="button" class="btn-red" id="cl-save">Save details</button><span class="inline-msg" id="cl-msg" hidden></span></div>
        </section>

        <section class="club-section">
          <h3>Other names</h3>
          <p class="hint-inline">Names this club appears under in fixtures, tables and posts (e.g. "KCB" for Kenya Commercial Bank). Fixtures written any of these ways link to this club.</p>
          <div class="alias-list">${aliases.map((a) => `<span class="alias-chip">${escapeHtml(a.name)} <button type="button" class="alias-remove" data-alias-id="${a.id}" aria-label="Remove ${escapeHtml(a.name)}">✕</button></span>`).join('') || '<span class="hint-inline">None yet.</span>'}</div>
          <div class="fx-actions"><input type="text" id="cl-alias" placeholder="Another name"><button type="button" class="btn-outline-sm" id="cl-alias-add">Add</button><span class="inline-msg" id="cl-alias-msg" hidden></span></div>
        </section>

        <section class="club-section" data-section="squad">
          <h3>Squad · ${club.players.length}</h3>
          <div class="people">${club.players.map((p) => personRowHtml('player', p)).join('')}</div>
          ${locked ? '' : personRowHtml('player', {})}
        </section>

        <section class="club-section" data-section="staff">
          <h3>Staff · ${club.staff.length}</h3>
          <div class="people">${club.staff.map((s) => personRowHtml('staff', s)).join('')}</div>
          ${personRowHtml('staff', {})}
        </section>

        <section class="club-section" data-section="sponsors">
          <h3>Sponsors · ${(club.sponsors || []).length}</h3>
          <div class="people">${(club.sponsors || []).map((s) => personRowHtml('sponsor', s)).join('')}</div>
          ${personRowHtml('sponsor', {})}
        </section>

        <section class="club-section">
          <h3>Promotion, relegation and duplicates</h3>
          <div class="form-row">
            <label class="fx-field">Move to competition<select id="cl-move">${competitionsList.filter((c) => c.sport.slug === club.competition.sport.slug).map((c) => `<option value="${c.id}" ${c.id === club.competition.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></label>
            <button type="button" class="btn-outline-sm" id="cl-move-btn">Move club</button>
          </div>
          <div class="form-row">
            <label class="fx-field">Merge this club into<select id="cl-merge"><option value="">Choose the club to keep…</option>${otherClubOptions()}</select></label>
            <button type="button" class="btn-outline-sm" id="cl-merge-btn">Merge</button>
          </div>
          <p class="hint-inline">Moving keeps the squad, follows and story tags. Merging moves everything from this club to the one you keep and makes this name another name for it.</p>
          <span class="inline-msg" id="cl-move-msg" hidden></span>
        </section>

        <section class="club-section">
          <h3>Data Platform</h3>
          ${canonicalLinkWidgetHtml('team', club.id, club.canonicalTeam)}
        </section>

        ${me.role === 'ADMIN' ? '<p><button type="button" class="btn-outline-sm danger" id="cl-delete">Delete this club and its squad</button></p>' : ''}
      </div>`;
    wireCanonicalLinkWidgets(panel, { endpointFor: (kind, localId) => (kind === 'team' ? `/api/clubs/${localId}/canonical-team` : `/api/clubs/players/${localId}/canonical-athlete`), onChange: () => openClub(club.slug) });
    if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    panel.innerHTML = `<p class="empty-state">Could not load this club: ${escapeHtml(err.message)}</p>`;
  }
}

// Re-reads the lists and the club, then resolves — so a "Saved" message
// shown afterwards isn't wiped by the redraw.
async function refreshAfterChange(slug) {
  await Promise.all([loadUnlinked(), openCompetitionClubs(document.getElementById('club-comp-select').value)]);
  if (slug) await openClub(slug, { scroll: false });
}

function wireEvents() {
  document.getElementById('club-list').addEventListener('click', (e) => {
    const chip = e.target.closest('.club-chip');
    if (chip) openClub(chip.dataset.slug);
  });

  document.getElementById('unlinked-list').addEventListener('click', async (e) => {
    const row = e.target.closest('.unlinked-row');
    if (!row) return;
    try {
      if (e.target.closest('.link-alias-btn')) {
        const { linked } = await api(`/api/clubs/${e.target.dataset.clubId}/aliases`, { method: 'POST', body: JSON.stringify({ name: row.dataset.team }) });
        row.innerHTML = `<span class="form-success">Linked — ${linked} game side${linked === 1 ? '' : 's'} now point to the club.</span>`;
      } else if (e.target.closest('.new-club-from-name-btn')) {
        if (!confirm(`Add "${row.dataset.team}" as a new club? Only do this if it isn't another name for an existing club.`)) return;
        const { linked } = await api('/api/clubs', { method: 'POST', body: JSON.stringify({ name: row.dataset.team, competitionId: row.dataset.competitionId }) });
        row.innerHTML = `<span class="form-success">Club added — ${linked} game side${linked === 1 ? '' : 's'} linked.</span>`;
      }
      setTimeout(loadUnlinked, 1500);
    } catch (err) { alert(err.message); }
  });

  const panel = document.getElementById('club-panel');
  panel.addEventListener('change', async (e) => {
    if (e.target.id !== 'cl-crest-file' || !e.target.files[0]) return;
    const form = new FormData();
    form.append('image', e.target.files[0]);
    const msg = document.getElementById('cl-msg');
    flash(msg, 'Uploading…');
    try {
      const res = await fetch('/api/uploads/image?keep=transparent', { method: 'POST', body: form, credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      document.getElementById('cl-crest').value = data.url;
      document.getElementById('cl-crest-preview').innerHTML = crestHtml(currentClub.name, data.url, 48);
      flash(msg, 'Uploaded — press Save details to use it');
    } catch (err) { flash(msg, err.message, true); }
  });

  panel.addEventListener('click', async (e) => {
    const club = currentClub;
    try {
      if (e.target.id === 'cl-save') {
        const { linked } = await api(`/api/clubs/${club.id}`, { method: 'PUT', body: JSON.stringify({ name: document.getElementById('cl-name').value, crestUrl: document.getElementById('cl-crest').value, venue: document.getElementById('cl-venue').value, owner: document.getElementById('cl-owner').value }) });
        await refreshAfterChange(club.slug);
        flash(document.getElementById('cl-msg'), `Saved${linked ? ` — ${linked} more game sides linked` : ''}`);
      } else if (e.target.id === 'cl-alias-add') {
        const name = document.getElementById('cl-alias').value.trim();
        if (!name) return;
        const { linked } = await api(`/api/clubs/${club.id}/aliases`, { method: 'POST', body: JSON.stringify({ name }) });
        await refreshAfterChange(club.slug);
        flash(document.getElementById('cl-alias-msg'), `Added${linked ? ` — ${linked} game sides linked` : ''}`);
      } else if (e.target.closest('.alias-remove')) {
        await api(`/api/clubs/aliases/${e.target.closest('.alias-remove').dataset.aliasId}`, { method: 'DELETE' });
        openClub(club.slug);
      } else if (e.target.id === 'cl-move-btn') {
        const target = document.getElementById('cl-move').value;
        if (target === club.competition.id) return;
        const name = competitionsList.find((c) => c.id === target)?.name;
        if (!confirm(`Move ${club.name} to ${name}? The squad, follows and story tags move with it.`)) return;
        await api(`/api/clubs/${club.id}`, { method: 'PUT', body: JSON.stringify({ competitionId: target }) });
        flash(document.getElementById('cl-move-msg'), `Moved to ${name}`);
        refreshAfterChange();
      } else if (e.target.id === 'cl-merge-btn') {
        const intoId = document.getElementById('cl-merge').value;
        if (!intoId) return;
        const into = sportClubsCache.find((c) => c.id === intoId);
        if (!confirm(`Merge ${club.name} into ${into.name}? Every fixture, player, staff member, sponsor, story tag and follow moves to ${into.name}, "${club.name}" becomes another name for it, and this club is removed.`)) return;
        const { into: slug } = await api(`/api/clubs/${club.id}/merge`, { method: 'POST', body: JSON.stringify({ intoId }) });
        await refreshAfterChange(slug);
      } else if (e.target.id === 'cl-delete') {
        if (!confirm(`Delete ${club.name} and its whole squad? This can't be undone. To fix a duplicate, merge instead.`)) return;
        await api(`/api/clubs/${club.id}`, { method: 'DELETE' });
        await refreshAfterChange();
      } else if (e.target.closest('.person-save')) {
        const row = e.target.closest('.person-row');
        const body = {};
        row.querySelectorAll('[data-p]').forEach((el) => { if (el.dataset.p !== 'clubId' || el.value) body[el.dataset.p] = el.value; });
        if (!String(body.name || '').trim()) return flash(row.querySelector('.inline-msg'), 'A name is needed', true);
        const kind = row.dataset.kind;
        const base = { player: 'players', staff: 'staff', sponsor: 'sponsors' }[kind];
        if (row.dataset.id) await api(`/api/clubs/${base}/${row.dataset.id}`, { method: 'PUT', body: JSON.stringify(body) });
        else await api(`/api/clubs/${club.id}/${base}`, { method: 'POST', body: JSON.stringify(body) });
        openClub(club.slug);
      } else if (e.target.closest('.person-delete')) {
        const row = e.target.closest('.person-row');
        if (!confirm('Remove this person from the club?')) return;
        const base = { player: 'players', staff: 'staff', sponsor: 'sponsors' }[row.dataset.kind];
        await api(`/api/clubs/${base}/${row.dataset.id}`, { method: 'DELETE' });
        openClub(club.slug);
      }
    } catch (err) {
      alert(err.message);
    }
  });
}

async function initClubsPage() {
  me = await requireLogin();
  if (!me) return;
  if (!canManageArticles(me)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('clubs-app').style.display = 'block';
  initCanonicalLinkOutsideClickHandler();
  const venueList = document.createElement('datalist');
  venueList.id = 'venue-options';
  document.body.appendChild(venueList);

  const [{ competitions }, { venues }] = await Promise.all([api('/api/competitions'), api('/api/venues').catch(() => ({ venues: [] }))]);
  competitionsList = competitions;
  venueList.innerHTML = venues.map((v) => `<option value="${escapeHtml(v.name)}">`).join('');
  renderCompetitionPicker();
  wireEvents();
  loadUnlinked();

  document.getElementById('club-comp-select').addEventListener('change', (e) => openCompetitionClubs(e.target.value));
  document.getElementById('add-club-btn').addEventListener('click', async () => {
    const name = document.getElementById('club-name').value.trim();
    const competitionId = document.getElementById('club-competition').value;
    if (!name || !competitionId) return;
    try {
      const { club } = await api('/api/clubs', { method: 'POST', body: JSON.stringify({ name, competitionId }) });
      document.getElementById('club-name').value = '';
      const comp = competitionsList.find((c) => c.id === competitionId);
      document.getElementById('club-comp-select').value = comp.slug;
      await openCompetitionClubs(comp.slug, club.slug);
    } catch (err) { alert(err.message); }
  });

  // ?club=<slug> opens that club; otherwise the last competition used.
  const clubSlug = new URLSearchParams(window.location.search).get('club');
  if (clubSlug) {
    const { club } = await api(`/api/clubs/${encodeURIComponent(clubSlug)}`).catch(() => ({ club: null }));
    if (club) {
      document.getElementById('club-comp-select').value = club.competition.slug;
      await openCompetitionClubs(club.competition.slug, club.slug);
      return;
    }
  }
  let last = null;
  try { last = localStorage.getItem(LAST_KEY); } catch { last = null; }
  const start = last && competitionsList.some((c) => c.slug === last) ? last : (competitionsList.find((c) => c.slug === 'kenyan-premier-league') || {}).slug;
  if (start) {
    document.getElementById('club-comp-select').value = start;
    openCompetitionClubs(start);
  }
}

initClubsPage();
