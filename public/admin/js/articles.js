let allSports = [];
let allAuthors = [];
let allTags = [];
let allCompetitions = [];
let allClubs = [];
// Set by editArticle() whenever the article being edited has a real
// Episode — every content-engine handler below (recording upload, clips,
// social assets, sponsors) targets this rather than re-fetching the whole
// article list on every click just to find the episode id again.
let currentEpisodeId = null;

// Wave 5 — hosts are Sportscast's own bylined Authors (see Episode.hosts'
// schema comment for why guests, below, work differently).
function populateHostCheckboxes(authors) {
  const el = document.getElementById('hosts-checkboxes');
  el.innerHTML = authors.map((a) => `
    <label class="checkbox-row" style="min-width:auto;">
      <input type="checkbox" value="${a.id}" class="host-checkbox"> ${escapeHtml(a.name)}
    </label>`).join('');
}

function getSelectedHostAuthorIds() {
  return Array.from(document.querySelectorAll('.host-checkbox:checked')).map((cb) => cb.value);
}

function setSelectedHostAuthorIds(ids) {
  document.querySelectorAll('.host-checkbox').forEach((cb) => {
    cb.checked = ids.includes(cb.value);
  });
}

// Guests are free-text-first (see EpisodeGuest's schema comment) — a
// repeatable row per guest, each with an optional best-effort Player
// search, same "type to search, click to link" UX as the canonical-event
// and fixture pickers elsewhere on this form, just simplified since a
// guest search only ever needs a name match, not a category/status label.
let guestPlayerSearchTimer = null;

function guestRowHtml(guest = {}) {
  return `
    <div class="form-row guest-row" style="align-items:flex-end; position:relative;" data-player-id="${guest.playerId || ''}">
      <div class="form-field"><label>Name</label><input type="text" class="guest-name" value="${escapeHtml(guest.name || '')}" placeholder="Guest name"></div>
      <div class="form-field"><label>Role (optional)</label><input type="text" class="guest-role" value="${escapeHtml(guest.role || '')}" placeholder="e.g. Federation Official"></div>
      <div class="form-field" style="position:relative;">
        <label>Link to Player (optional)</label>
        <input type="text" class="guest-player-search" placeholder="${guest.playerName ? escapeHtml(guest.playerName) : 'Search players…'}" autocomplete="off">
        <div class="guest-player-results" style="display:none; position:absolute; z-index:10; width:100%; background:var(--bg-surface); border:1px solid var(--border); border-radius:var(--radius); max-height:200px; overflow-y:auto;"></div>
      </div>
      <button type="button" class="btn-outline-sm remove-guest-btn">Remove</button>
    </div>`;
}

function addGuestRow(guest) {
  const list = document.getElementById('guests-list');
  list.insertAdjacentHTML('beforeend', guestRowHtml(guest));
  const row = list.lastElementChild;
  row.querySelector('.remove-guest-btn').addEventListener('click', () => row.remove());
  row.querySelector('.guest-player-search').addEventListener('input', (e) => {
    const q = e.target.value;
    clearTimeout(guestPlayerSearchTimer);
    guestPlayerSearchTimer = setTimeout(async () => {
      const resultsEl = row.querySelector('.guest-player-results');
      if (q.trim().length < 2) { resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; return; }
      const { players } = await api(`/api/players?q=${encodeURIComponent(q.trim())}`).catch(() => ({ players: [] }));
      if (!players.length) {
        resultsEl.innerHTML = '<div style="padding:0.5rem 0.7rem; color:var(--text-secondary); font-size:var(--text-small);">No matching players.</div>';
        resultsEl.style.display = 'block';
        return;
      }
      resultsEl.innerHTML = players.map((p) => `
        <button type="button" class="guest-player-result" data-id="${p.id}" data-name="${escapeHtml(p.name)}"
          style="display:block; width:100%; text-align:left; padding:0.5rem 0.7rem; border:none; border-bottom:1px solid var(--border); background:none; cursor:pointer; font-family:inherit;">
          ${escapeHtml(p.name)} <span style="color:var(--text-secondary); font-size:var(--text-small);">— ${escapeHtml(p.club?.name || '')}</span>
        </button>`).join('');
      resultsEl.querySelectorAll('.guest-player-result').forEach((btn) => {
        btn.addEventListener('click', () => {
          row.dataset.playerId = btn.dataset.id;
          row.querySelector('.guest-player-search').value = '';
          row.querySelector('.guest-player-search').placeholder = btn.dataset.name;
          resultsEl.style.display = 'none';
        });
      });
      resultsEl.style.display = 'block';
    }, 300);
  });
}

function getGuests() {
  return Array.from(document.querySelectorAll('.guest-row'))
    .map((row) => ({
      name: row.querySelector('.guest-name').value.trim(),
      role: row.querySelector('.guest-role').value.trim() || null,
      playerId: row.dataset.playerId || null,
    }))
    .filter((g) => g.name);
}

// Competition picker is scoped to whichever sport is currently selected —
// a competition tag only makes sense within its own sport, and the list
// would otherwise be confusing (KPL showing up while editing a Rugby
// episode). An article can now tag several competitions at once, so this
// renders checkboxes and cascades the club list off the CHECKED set, not
// a single value — carrying over any still-valid checked competitions
// across a re-render (e.g. switching sport) rather than wiping them.
function populateCompetitionOptions(sportId) {
  const el = document.getElementById('competitions-checkboxes');
  const previouslyChecked = getSelectedCompetitionIds();
  const competitions = allCompetitions.filter((c) => c.sportId === sportId);
  el.innerHTML = competitions.map((c) => `
    <label class="checkbox-row" style="min-width:auto;">
      <input type="checkbox" value="${c.id}" class="competition-checkbox"> ${escapeHtml(c.name)}
    </label>`).join('');
  const stillValid = previouslyChecked.filter((id) => competitions.some((c) => c.id === id));
  setSelectedCompetitionIds(stillValid);
  return populateClubOptions(stillValid);
}

// Club picker cascades from the checked competitions the same way it
// cascades from sport above — a club tag only makes sense within one of
// the article's tagged competitions (public/js/subnav.js's team pages).
// Union across every checked competition, not just one.
function populateClubOptions(competitionIds) {
  const el = document.getElementById('clubs-checkboxes');
  const previouslyChecked = getSelectedClubIds();
  const clubs = competitionIds.length ? allClubs.filter((c) => competitionIds.includes(c.competitionId)) : [];
  el.innerHTML = clubs.map((c) => `
    <label class="checkbox-row" style="min-width:auto;">
      <input type="checkbox" value="${c.id}" class="club-checkbox"> ${escapeHtml(c.name)}
    </label>`).join('');
  const stillValid = previouslyChecked.filter((id) => clubs.some((c) => c.id === id));
  setSelectedClubIds(stillValid);
  return populatePlayerOptions(stillValid);
}

// Player picker cascades from the checked clubs the same way clubs cascade
// from competitions — a player tag only makes sense within one of the
// article's tagged clubs (public/js/player.js's profile page). Union
// across every checked club. GET /api/clubs (already fetched into
// allClubs) doesn't include players, so this fetches each checked club's
// detail on demand, in parallel — the same endpoint the public club page
// already uses.
async function populatePlayerOptions(clubIds) {
  const el = document.getElementById('players-checkboxes');
  const previouslyChecked = getSelectedPlayerIds();
  if (!clubIds.length) {
    el.innerHTML = '';
    return;
  }
  const clubs = clubIds.map((id) => allClubs.find((c) => c.id === id)).filter(Boolean);
  const fullClubs = await Promise.all(clubs.map((c) => api(`/api/clubs/${encodeURIComponent(c.slug)}`).then((r) => r.club)));
  const players = fullClubs.flatMap((c) => c.players.map((p) => ({ ...p, clubName: c.name })));
  el.innerHTML = players.map((p) => `
    <label class="checkbox-row" style="min-width:auto;">
      <input type="checkbox" value="${p.id}" class="player-checkbox"> ${escapeHtml(p.name)} <span style="color:var(--text-secondary); font-size:0.85em;">(${escapeHtml(p.clubName)})</span>
    </label>`).join('');
  const stillValid = previouslyChecked.filter((id) => players.some((p) => p.id === id));
  setSelectedPlayerIds(stillValid);
}

function populateSelect(select, items) {
  select.innerHTML = items.map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('');
}

function populateTagCheckboxes(tags) {
  const el = document.getElementById('tags-checkboxes');
  el.innerHTML = tags.map((t) => `
    <label class="checkbox-row" style="min-width:auto;">
      <input type="checkbox" value="${t.id}" class="tag-checkbox"> ${escapeHtml(t.name)}
    </label>`).join('');
}

function getSelectedTagIds() {
  return Array.from(document.querySelectorAll('.tag-checkbox:checked')).map((cb) => cb.value);
}

function setSelectedTagIds(ids) {
  document.querySelectorAll('.tag-checkbox').forEach((cb) => {
    cb.checked = ids.includes(cb.value);
  });
}

function getSelectedCompetitionIds() {
  return Array.from(document.querySelectorAll('.competition-checkbox:checked')).map((cb) => cb.value);
}

function setSelectedCompetitionIds(ids) {
  document.querySelectorAll('.competition-checkbox').forEach((cb) => {
    cb.checked = ids.includes(cb.value);
  });
}

function getSelectedClubIds() {
  return Array.from(document.querySelectorAll('.club-checkbox:checked')).map((cb) => cb.value);
}

function setSelectedClubIds(ids) {
  document.querySelectorAll('.club-checkbox').forEach((cb) => {
    cb.checked = ids.includes(cb.value);
  });
}

function getSelectedPlayerIds() {
  return Array.from(document.querySelectorAll('.player-checkbox:checked')).map((cb) => cb.value);
}

function setSelectedPlayerIds(ids) {
  document.querySelectorAll('.player-checkbox').forEach((cb) => {
    cb.checked = ids.includes(cb.value);
  });
}

function resetForm() {
  document.getElementById('article-form').reset();
  document.getElementById('article-id').value = '';
  setSelectedTagIds([]);
  document.getElementById('video-fields').style.display = 'none';
  document.getElementById('article-form-error').style.display = 'none';
  populateCompetitionOptions(document.getElementById('sportId').value);
  // Only shown once an article actually exists — see editArticle(); a new,
  // unsaved article has no id to link a canonical Event against yet.
  document.getElementById('canonical-event-section').style.display = 'none';
  document.getElementById('canonical-event-search-input').value = '';
  hideCanonicalEventResults();
  document.getElementById('canonical-event-error').style.display = 'none';

  document.getElementById('scheduled-at-field').style.display = 'none';
  document.getElementById('scheduledAt').value = '';
  document.getElementById('scheduled-at-error').style.display = 'none';

  document.getElementById('fixtureId').value = '';
  document.getElementById('fixture-search-input').value = '';
  hideFixtureResults();
  renderFixtureLink(null);
  showCoverImagePreview(null);
  document.getElementById('cover-image-upload-status').textContent = '';

  document.getElementById('poll-section').style.display = 'none';
  document.getElementById('poll-error').style.display = 'none';

  document.getElementById('hosts-checkboxes').querySelectorAll('.host-checkbox').forEach((cb) => { cb.checked = false; });
  document.getElementById('guests-list').innerHTML = '';
  // Only shown once a real Episode exists (article saved, contentType
  // VIDEO_POST, videoSeries matching a real Show) — see editArticle().
  document.getElementById('content-engine-section').style.display = 'none';
  currentEpisodeId = null;
  document.getElementById('recording-status').textContent = '';
  document.getElementById('recording-error').style.display = 'none';
  document.getElementById('clips-list').innerHTML = '';
  document.getElementById('social-assets-list').innerHTML = '';
  document.getElementById('episode-sponsors-list').innerHTML = '';
  if (recordingStatusPollTimer) clearInterval(recordingStatusPollTimer);
}

// datetime-local has no timezone of its own — same convention already used
// for Fixture.kickoff entry (server/routes/competitions.js's admin form):
// the raw string is sent as-is and parsed server-side with `new Date(...)`,
// interpreted in whatever timezone the server runs in. Not solved here,
// deliberately consistent with the existing, pre-existing kickoff behavior
// rather than inventing a new timezone convention for just this one field.
function isoToLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showCoverImagePreview(url) {
  const img = document.getElementById('cover-image-preview');
  if (!url) {
    img.style.display = 'none';
    img.src = '';
    return;
  }
  img.src = url;
  img.style.display = 'block';
}

function renderFixtureLink(fixture) {
  const el = document.getElementById('fixture-current');
  document.getElementById('fixtureId').value = fixture ? fixture.id : '';
  if (!fixture) {
    el.innerHTML = `<span style="color:var(--text-secondary); font-size:var(--text-small);">Not linked to a match.</span>`;
    return;
  }
  el.innerHTML = `
    <strong>${escapeHtml(fixture.homeTeam)} vs ${escapeHtml(fixture.awayTeam)}</strong>
    <span style="color:var(--text-secondary); font-size:var(--text-small);"> — ${escapeHtml(fixture.competition.name)}, ${formatDate(fixture.kickoff)}</span>
    <button type="button" class="btn-outline-sm" id="unlink-fixture-btn" style="margin-left:0.5rem;">Unlink</button>`;
  document.getElementById('unlink-fixture-btn').addEventListener('click', () => renderFixtureLink(null));
}

let fixtureSearchTimer = null;
let fixtureSearchToken = 0;

function hideFixtureResults() {
  const resultsEl = document.getElementById('fixture-results');
  resultsEl.style.display = 'none';
  resultsEl.innerHTML = '';
}

function renderFixtureResults(fixtures) {
  const resultsEl = document.getElementById('fixture-results');
  if (!fixtures.length) {
    resultsEl.innerHTML = `<div style="padding:0.6rem 0.8rem; color:var(--text-secondary); font-size:var(--text-small);">No matching fixtures found.</div>`;
    resultsEl.style.display = 'block';
    return;
  }
  resultsEl.innerHTML = fixtures
    .map(
      (f) => `
      <button type="button" class="fixture-result" data-id="${f.id}"
        style="display:block; width:100%; text-align:left; padding:0.6rem 0.8rem; border:none; border-bottom:1px solid var(--border); background:none; cursor:pointer; font-family:inherit;">
        <strong>${escapeHtml(f.homeTeam)} vs ${escapeHtml(f.awayTeam)}</strong>
        <span style="color:var(--text-secondary); font-size:var(--text-small);"> — ${escapeHtml(f.competition.name)}, ${formatDate(f.kickoff)}</span>
      </button>`
    )
    .join('');
  resultsEl.querySelectorAll('.fixture-result').forEach((btn) => {
    const fixture = fixtures.find((f) => f.id === btn.dataset.id);
    btn.addEventListener('click', () => {
      renderFixtureLink(fixture);
      document.getElementById('fixture-search-input').value = '';
      hideFixtureResults();
    });
  });
  resultsEl.style.display = 'block';
}

async function searchFixtures(q) {
  const token = ++fixtureSearchToken;
  if (q.trim().length < 2) {
    hideFixtureResults();
    return;
  }
  const { fixtures } = await api(`/api/fixtures/search?q=${encodeURIComponent(q.trim())}`);
  if (token !== fixtureSearchToken) return; // a newer keystroke's search already landed — drop this stale one
  renderFixtureResults(fixtures);
}

function renderCanonicalEvent(event) {
  const el = document.getElementById('canonical-event-current');
  if (!event) {
    el.innerHTML = `<span style="color:var(--text-secondary); font-size:var(--text-small);">Not linked to a canonical Event.</span>`;
    return;
  }
  const subject = event.competitionName || event.teamName || event.athleteName || '';
  el.innerHTML = `
    <span class="pill">${escapeHtml(event.category)}</span>
    <strong>${escapeHtml(event.title)}</strong>${subject ? ` — ${escapeHtml(subject)}` : ''}
    <button type="button" class="btn-outline-sm" id="unlink-canonical-event-btn" style="margin-left:0.5rem;">Unlink</button>`;
  document.getElementById('unlink-canonical-event-btn').addEventListener('click', () => unlinkCanonicalEvent());
}

async function loadCanonicalEvent(articleId) {
  const { canonicalEvent } = await api(`/api/articles/${articleId}/canonical-event`);
  renderCanonicalEvent(canonicalEvent);
}

// Wave 2 — real search picker (server/routes/canonicalSearch.js), replacing
// the raw-UUID-paste field this used to be. Debounced so every keystroke
// doesn't fire its own server-to-server fetch to the Data Platform.
let canonicalEventSearchTimer = null;
let canonicalEventSearchToken = 0;

function hideCanonicalEventResults() {
  const resultsEl = document.getElementById('canonical-event-results');
  resultsEl.style.display = 'none';
  resultsEl.innerHTML = '';
}

function renderCanonicalEventResults(events, articleId) {
  const resultsEl = document.getElementById('canonical-event-results');
  if (!events.length) {
    resultsEl.innerHTML = `<div style="padding:0.6rem 0.8rem; color:var(--text-secondary); font-size:var(--text-small);">No matching events found.</div>`;
    resultsEl.style.display = 'block';
    return;
  }
  resultsEl.innerHTML = events
    .map(
      (e) => `
      <button type="button" class="canonical-event-result" data-id="${e.id}"
        style="display:block; width:100%; text-align:left; padding:0.6rem 0.8rem; border:none; border-bottom:1px solid var(--border); background:none; cursor:pointer; font-family:inherit;">
        <span class="pill">${escapeHtml(e.category)}</span>
        <strong>${escapeHtml(e.name)}</strong>
        <span style="color:var(--text-secondary); font-size:var(--text-small);"> — ${escapeHtml(e.status)}</span>
      </button>`
    )
    .join('');
  resultsEl.querySelectorAll('.canonical-event-result').forEach((btn) => {
    btn.addEventListener('click', () => linkCanonicalEvent(articleId, btn.dataset.id));
  });
  resultsEl.style.display = 'block';
}

async function searchCanonicalEvents(articleId, q) {
  const token = ++canonicalEventSearchToken;
  if (q.trim().length < 2) {
    hideCanonicalEventResults();
    return;
  }
  const { results } = await api(`/api/canonical-search?type=event&q=${encodeURIComponent(q.trim())}`);
  if (token !== canonicalEventSearchToken) return; // a newer keystroke's search already landed — drop this stale one
  renderCanonicalEventResults(results.events || [], articleId);
}

async function linkCanonicalEvent(articleId, canonicalEventId) {
  const errorEl = document.getElementById('canonical-event-error');
  errorEl.style.display = 'none';
  try {
    const { canonicalEvent } = await api(`/api/articles/${articleId}/canonical-event`, {
      method: 'PUT',
      body: JSON.stringify({ canonicalEventId }),
    });
    document.getElementById('canonical-event-search-input').value = '';
    hideCanonicalEventResults();
    renderCanonicalEvent(canonicalEvent);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
}

async function unlinkCanonicalEvent() {
  const articleId = document.getElementById('article-id').value;
  await api(`/api/articles/${articleId}/canonical-event`, { method: 'DELETE' });
  renderCanonicalEvent(null);
}

function addPollOptionInput(value) {
  const list = document.getElementById('poll-options-list');
  const row = document.createElement('div');
  row.className = 'form-row poll-option-row';
  row.style.marginBottom = '0.5rem';
  row.innerHTML = `
    <input type="text" class="poll-option-input" placeholder="Option" value="${value ? escapeHtml(value) : ''}" style="flex:1;">
    <button type="button" class="btn-outline-sm remove-poll-option-btn">Remove</button>`;
  row.querySelector('.remove-poll-option-btn').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

function renderPoll(poll) {
  const existingEl = document.getElementById('poll-existing');
  const createFormEl = document.getElementById('poll-create-form');
  if (poll) {
    document.getElementById('poll-existing-summary').textContent =
      `"${poll.question}" — ${poll.totalVotes} vote${poll.totalVotes === 1 ? '' : 's'} (${poll.options.map((o) => `${o.label}: ${o.votes}`).join(', ')})`;
    existingEl.style.display = 'block';
    createFormEl.style.display = 'none';
  } else {
    existingEl.style.display = 'none';
    createFormEl.style.display = 'block';
    document.getElementById('poll-question').value = '';
    document.getElementById('poll-options-list').innerHTML = '';
    addPollOptionInput('');
    addPollOptionInput('');
  }
}

async function loadPoll(articleId) {
  const { poll } = await api(`/api/articles/${articleId}/poll`);
  renderPoll(poll);
}

async function createPoll(articleId) {
  const errorEl = document.getElementById('poll-error');
  errorEl.style.display = 'none';
  const question = document.getElementById('poll-question').value.trim();
  const options = Array.from(document.querySelectorAll('.poll-option-input'))
    .map((el) => el.value.trim())
    .filter(Boolean);
  if (!question || options.length < 2) {
    errorEl.textContent = 'A question and at least 2 options are required';
    errorEl.style.display = 'block';
    return;
  }
  try {
    const { poll } = await api(`/api/articles/${articleId}/poll`, { method: 'POST', body: JSON.stringify({ question, options }) });
    renderPoll(poll);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
}

async function deletePoll(articleId) {
  if (!confirm('Delete this poll? Existing votes will be lost.')) return;
  await api(`/api/articles/${articleId}/poll`, { method: 'DELETE' });
  renderPoll(null);
}

function showForm() {
  document.getElementById('article-form').style.display = 'grid';
}

function statusBadge(article) {
  const cls = article.status === 'PUBLISHED' ? 'published' : article.status === 'SCHEDULED' ? 'scheduled' : 'draft';
  const label = article.status === 'SCHEDULED' && article.scheduledAt
    ? `Scheduled — ${formatDate(article.scheduledAt)}`
    : article.status;
  return `<span class="status-badge ${cls}">${escapeHtml(label)}</span>`;
}

async function loadArticles() {
  const { articles } = await api('/api/articles/admin/all');
  const tbody = document.getElementById('articles-tbody');
  tbody.innerHTML = articles.map((a) => `
    <tr>
      <td>${escapeHtml(a.title)}</td>
      <td>${escapeHtml(a.sport.name)}</td>
      <td>${a.contentType === 'VIDEO_POST' ? 'Video Post' : 'Article'}</td>
      <td>${statusBadge(a)}</td>
      <td>${a.featured ? '★' : ''}${a.isBrief ? ' <span class="pill">News</span>' : ''}</td>
      <td>
        <button class="btn-outline-sm edit-btn" data-id="${a.id}">Edit</button>
        <button class="btn-outline-sm delete-btn" data-id="${a.id}">Delete</button>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => editArticle(articles.find((a) => a.id === btn.dataset.id)));
  });
  tbody.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteArticle(btn.dataset.id));
  });
}

// ---- Content Engine (Wave 5): recording upload/status, clips, social
// assets, sponsors. All gated on a real Episode already existing — see
// editArticle()'s `if (article.episode)` block. ----
let recordingStatusPollTimer = null;

function updateRecordingStatusUI(status, error) {
  const statusEl = document.getElementById('recording-status');
  const deleteBtn = document.getElementById('delete-recording-btn');
  const errorEl = document.getElementById('recording-error');
  errorEl.style.display = 'none';
  if (status === 'PROCESSING') {
    statusEl.textContent = 'Transcribing… this can take a few minutes for a full episode.';
    deleteBtn.style.display = 'none';
  } else if (status === 'DONE') {
    statusEl.textContent = 'Transcription complete.';
    deleteBtn.style.display = 'inline-block';
  } else if (status === 'FAILED') {
    statusEl.textContent = '';
    errorEl.textContent = error || 'Transcription failed.';
    errorEl.style.display = 'block';
    deleteBtn.style.display = 'inline-block'; // the raw file is still there even though transcription failed — clips can still be added/rendered manually
  } else {
    statusEl.textContent = '';
    deleteBtn.style.display = 'none';
  }
}

function startRecordingStatusPoll(episodeId) {
  if (recordingStatusPollTimer) clearInterval(recordingStatusPollTimer);
  recordingStatusPollTimer = setInterval(async () => {
    const status = await api(`/api/episodes/${episodeId}/status`).catch(() => null);
    if (!status) return;
    updateRecordingStatusUI(status.transcriptionStatus, status.transcriptionError);
    if (status.transcript) document.getElementById('transcript').value = status.transcript;
    renderClips(status.clips || [], episodeId);
    if (status.transcriptionStatus === 'DONE' || status.transcriptionStatus === 'FAILED') {
      clearInterval(recordingStatusPollTimer);
    }
  }, 5000);
}

function clipStatusLabel(clip) {
  if (clip.status === 'SUGGESTED') return `AI-suggested — ${escapeHtml(clip.reason || '')}`;
  if (clip.status === 'REJECTED') return 'Rejected';
  if (clip.status === 'RENDERED') return 'Rendered';
  return 'Approved — not yet rendered';
}

function renderClips(clips, episodeId) {
  const el = document.getElementById('clips-list');
  if (!clips.length) {
    el.innerHTML = '<p class="empty-state" style="padding:0.5rem 0;">No clips yet.</p>';
    return;
  }
  el.innerHTML = clips.map((c) => `
    <div class="fixture-row" data-clip-id="${c.id}">
      <div>
        <span class="fixture-teams" style="font-size:0.88rem; font-weight:600;">${escapeHtml(c.title)}</span>
        <span class="fixture-meta">${c.startSeconds}s–${c.endSeconds}s · ${clipStatusLabel(c)}</span>
      </div>
      <div>
        ${c.status === 'SUGGESTED' ? `<button type="button" class="btn-outline-sm approve-clip-btn">Approve</button> <button type="button" class="btn-outline-sm reject-clip-btn">Reject</button>` : ''}
        ${c.status === 'APPROVED' ? `<button type="button" class="btn-outline-sm render-clip-btn">Render</button>` : ''}
        ${c.status === 'RENDERED' ? `<a href="${escapeHtml(c.videoUrl)}" target="_blank" class="btn-outline-sm" style="text-decoration:none;">View</a>` : ''}
        <button type="button" class="btn-outline-sm delete-clip-btn" style="color:var(--danger); border-color:var(--danger);">✕</button>
      </div>
    </div>`).join('');

  el.querySelectorAll('.approve-clip-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const clipId = btn.closest('[data-clip-id]').dataset.clipId;
      await api(`/api/episodes/clips/${clipId}`, { method: 'PUT', body: JSON.stringify({ status: 'APPROVED' }) });
      reloadEpisodeSection(episodeId);
    });
  });
  el.querySelectorAll('.reject-clip-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const clipId = btn.closest('[data-clip-id]').dataset.clipId;
      await api(`/api/episodes/clips/${clipId}`, { method: 'PUT', body: JSON.stringify({ status: 'REJECTED' }) });
      reloadEpisodeSection(episodeId);
    });
  });
  el.querySelectorAll('.render-clip-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Rendering…';
      try {
        const clipId = btn.closest('[data-clip-id]').dataset.clipId;
        await api(`/api/episodes/clips/${clipId}/render`, { method: 'POST' });
        reloadEpisodeSection(episodeId);
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = 'Render';
      }
    });
  });
  el.querySelectorAll('.delete-clip-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const clipId = btn.closest('[data-clip-id]').dataset.clipId;
      await api(`/api/episodes/clips/${clipId}`, { method: 'DELETE' });
      reloadEpisodeSection(episodeId);
    });
  });
}

function renderSocialAssets(assets, episodeId) {
  const el = document.getElementById('social-assets-list');
  if (!assets.length) {
    el.innerHTML = '<p class="empty-state" style="padding:0.5rem 0;">No social assets yet.</p>';
    return;
  }
  el.innerHTML = assets.map((a) => `
    <div class="fixture-row" data-asset-id="${a.id}">
      <div>
        <span class="pill">${escapeHtml(a.type.replace('_', ' '))}</span>
        <span class="fixture-teams" style="font-size:0.85rem;">${escapeHtml(a.content)}</span>
        ${a.source === 'AI_GENERATED' ? '<span class="fixture-meta">AI-generated, verified against the real transcript</span>' : ''}
      </div>
      <button type="button" class="btn-outline-sm delete-asset-btn" style="color:var(--danger); border-color:var(--danger);">✕</button>
    </div>`).join('');
  el.querySelectorAll('.delete-asset-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const assetId = btn.closest('[data-asset-id]').dataset.assetId;
      await api(`/api/episodes/social-assets/${assetId}`, { method: 'DELETE' });
      reloadEpisodeSection(episodeId);
    });
  });
}

function renderEpisodeSponsors(sponsors, episodeId) {
  const el = document.getElementById('episode-sponsors-list');
  if (!sponsors.length) {
    el.innerHTML = '<p class="empty-state" style="padding:0.5rem 0;">No sponsors yet.</p>';
    return;
  }
  el.innerHTML = sponsors.map((s) => `
    <div class="fixture-row" data-sponsor-id="${s.id}">
      <span class="fixture-teams" style="font-size:0.88rem;">${escapeHtml(s.name)}</span>
      <button type="button" class="btn-outline-sm delete-episode-sponsor-btn" style="color:var(--danger); border-color:var(--danger);">✕</button>
    </div>`).join('');
  el.querySelectorAll('.delete-episode-sponsor-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sponsorId = btn.closest('[data-sponsor-id]').dataset.sponsorId;
      await api(`/api/episodes/sponsors/${sponsorId}`, { method: 'DELETE' });
      reloadEpisodeSection(episodeId);
    });
  });
}

// Re-fetches this one episode's content-engine state (clips/social
// assets/sponsors) via the admin article list, without closing/reopening
// the whole edit form. Reuses GET /api/articles/admin/all rather than a
// dedicated by-id route — this list is already small (newsroom-scale, not
// public-traffic-scale) and every other refresh path in this file already
// re-fetches it wholesale (see loadArticles), so this stays consistent
// rather than adding a one-off endpoint just to shave one query.
async function reloadEpisodeSection(episodeId) {
  const { articles } = await api('/api/articles/admin/all');
  const article = articles.find((a) => a.episode?.id === episodeId);
  if (!article?.episode) return;
  renderClips(article.episode.clips || [], episodeId);
  renderSocialAssets(article.episode.socialAssets || [], episodeId);
  renderEpisodeSponsors(article.episode.sponsors || [], episodeId);
}

function editArticle(article) {
  resetForm();
  document.getElementById('article-id').value = article.id;
  document.getElementById('title').value = article.title;
  document.getElementById('dek').value = article.dek;
  document.getElementById('body').value = article.body;
  document.getElementById('sportId').value = article.sport.id;
  document.getElementById('authorId').value = article.author.id;
  document.getElementById('status').value = article.status;
  document.getElementById('scheduled-at-field').style.display = article.status === 'SCHEDULED' ? 'block' : 'none';
  document.getElementById('scheduledAt').value = isoToLocalInputValue(article.scheduledAt);
  renderFixtureLink(article.fixture);
  document.getElementById('contentType').value = article.contentType;
  document.getElementById('featured').checked = article.featured;
  document.getElementById('isBrief').checked = article.isBrief;
  document.getElementById('coverImageUrl').value = article.coverImageUrl || '';
  showCoverImagePreview(article.coverImageUrl);
  document.getElementById('youtubeId').value = article.youtubeId || '';
  document.getElementById('videoSeries').value = article.videoSeries || '';
  document.getElementById('episodeLabel').value = article.episodeLabel || '';
  document.getElementById('runtimeLabel').value = article.runtimeLabel || '';
  document.getElementById('episodeNumber').value = article.episode?.episodeNumber ?? '';
  setSelectedHostAuthorIds((article.episode?.hosts || []).map((h) => h.id));
  (article.episode?.guests || []).forEach((g) => addGuestRow({ name: g.name, role: g.role, playerId: g.playerId, playerName: g.player?.name }));
  document.getElementById('recordingDate').value = article.episode?.recordingDate ? article.episode.recordingDate.slice(0, 10) : '';
  document.getElementById('transcript').value = article.episode?.transcript || '';
  document.getElementById('chapters').value = article.episode?.chapters || '';
  setSelectedTagIds(article.tags.map((t) => t.id));

  populateCompetitionOptions(article.sport.id);
  setSelectedCompetitionIds(article.competitions.map((c) => c.id));
  populateClubOptions(article.competitions.map((c) => c.id));
  setSelectedClubIds(article.clubs.map((c) => c.id));
  populatePlayerOptions(article.clubs.map((c) => c.id)).then(() => {
    setSelectedPlayerIds(article.players.map((p) => p.id));
  });

  document.getElementById('video-fields').style.display = article.contentType === 'VIDEO_POST' ? 'block' : 'none';

  if (article.episode) {
    currentEpisodeId = article.episode.id;
    document.getElementById('content-engine-section').style.display = 'block';
    renderClips(article.episode.clips || [], article.episode.id);
    renderSocialAssets(article.episode.socialAssets || [], article.episode.id);
    renderEpisodeSponsors(article.episode.sponsors || [], article.episode.id);
    updateRecordingStatusUI(article.episode.transcriptionStatus, article.episode.transcriptionError);
    if (article.episode.transcriptionStatus === 'PROCESSING') startRecordingStatusPoll(article.episode.id);
  }

  document.getElementById('canonical-event-section').style.display = 'block';
  renderCanonicalEvent(null); // clear stale state from any previously-edited article while this one loads
  loadCanonicalEvent(article.id);

  document.getElementById('poll-section').style.display = 'block';
  loadPoll(article.id);

  showForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteArticle(id) {
  if (!confirm('Delete this article? This cannot be undone.')) return;
  await api(`/api/articles/${id}`, { method: 'DELETE' });
  loadArticles();
}

function collectFormData() {
  return {
    title: document.getElementById('title').value.trim(),
    dek: document.getElementById('dek').value.trim(),
    body: document.getElementById('body').value.trim(),
    sportId: document.getElementById('sportId').value,
    authorId: document.getElementById('authorId').value,
    tagIds: getSelectedTagIds(),
    status: document.getElementById('status').value,
    scheduledAt: document.getElementById('scheduledAt').value || null,
    fixtureId: document.getElementById('fixtureId').value || null,
    contentType: document.getElementById('contentType').value,
    featured: document.getElementById('featured').checked,
    isBrief: document.getElementById('isBrief').checked,
    coverImageUrl: document.getElementById('coverImageUrl').value.trim() || null,
    youtubeId: document.getElementById('youtubeId').value.trim() || null,
    videoSeries: document.getElementById('videoSeries').value.trim() || null,
    episodeLabel: document.getElementById('episodeLabel').value.trim() || null,
    runtimeLabel: document.getElementById('runtimeLabel').value.trim() || null,
    episodeNumber: document.getElementById('episodeNumber').value ? parseInt(document.getElementById('episodeNumber').value, 10) : null,
    hostAuthorIds: getSelectedHostAuthorIds(),
    guests: getGuests(),
    recordingDate: document.getElementById('recordingDate').value || null,
    transcript: document.getElementById('transcript').value.trim() || null,
    chapters: document.getElementById('chapters').value.trim() || null,
    competitionIds: getSelectedCompetitionIds(),
    clubIds: getSelectedClubIds(),
    playerIds: getSelectedPlayerIds(),
  };
}

async function initArticlesPage() {
  const user = await requireLogin();
  if (!user) return;

  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('articles-app').style.display = 'block';

  const [sportsRes, authorsRes, tagsRes, competitionsRes, clubsRes] = await Promise.all([
    api('/api/sports'), api('/api/authors'), api('/api/tags'), api('/api/competitions'), api('/api/clubs'),
  ]);
  allSports = sportsRes.sports;
  allAuthors = authorsRes.authors;
  allTags = tagsRes.tags;
  allCompetitions = competitionsRes.competitions;
  allClubs = clubsRes.clubs;
  populateSelect(document.getElementById('sportId'), allSports);
  populateSelect(document.getElementById('authorId'), allAuthors);
  populateTagCheckboxes(allTags);
  populateHostCheckboxes(allAuthors);
  populateCompetitionOptions(document.getElementById('sportId').value);

  document.getElementById('new-article-btn').addEventListener('click', () => {
    resetForm();
    showForm();
  });
  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    document.getElementById('article-form').style.display = 'none';
  });
  document.getElementById('contentType').addEventListener('change', (e) => {
    document.getElementById('video-fields').style.display = e.target.value === 'VIDEO_POST' ? 'block' : 'none';
  });
  document.getElementById('status').addEventListener('change', (e) => {
    document.getElementById('scheduled-at-field').style.display = e.target.value === 'SCHEDULED' ? 'block' : 'none';
  });
  document.getElementById('coverImageUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('cover-image-upload-status');
    statusEl.textContent = 'Uploading…';
    statusEl.style.color = 'var(--text-secondary)';
    const formData = new FormData();
    formData.append('image', file);
    try {
      const { url } = await api('/api/uploads/image', { method: 'POST', body: formData, headers: {} });
      document.getElementById('coverImageUrl').value = url;
      showCoverImagePreview(url);
      statusEl.textContent = 'Uploaded.';
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.style.color = 'var(--danger)';
    } finally {
      e.target.value = '';
    }
  });
  document.getElementById('coverImageUrl').addEventListener('input', (e) => {
    showCoverImagePreview(e.target.value.trim());
  });

  document.getElementById('add-guest-btn').addEventListener('click', () => addGuestRow());

  document.getElementById('recordingUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentEpisodeId) return;
    const statusEl = document.getElementById('recording-status');
    const errorEl = document.getElementById('recording-error');
    errorEl.style.display = 'none';
    statusEl.textContent = 'Uploading…';
    const formData = new FormData();
    formData.append('recording', file);
    try {
      await api(`/api/episodes/${currentEpisodeId}/recording`, { method: 'POST', body: formData, headers: {} });
      updateRecordingStatusUI('PROCESSING', null);
      startRecordingStatusPoll(currentEpisodeId);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      statusEl.textContent = '';
    } finally {
      e.target.value = '';
    }
  });
  document.getElementById('delete-recording-btn').addEventListener('click', async () => {
    if (!currentEpisodeId || !confirm('Delete the raw recording? You will need to re-upload it to render any more clips.')) return;
    await api(`/api/episodes/${currentEpisodeId}/recording`, { method: 'DELETE' });
    document.getElementById('delete-recording-btn').style.display = 'none';
  });
  document.getElementById('add-clip-btn').addEventListener('click', async () => {
    if (!currentEpisodeId) return;
    const title = document.getElementById('newClipTitle').value.trim();
    const startSeconds = parseInt(document.getElementById('newClipStart').value, 10);
    const endSeconds = parseInt(document.getElementById('newClipEnd').value, 10);
    if (!title || Number.isNaN(startSeconds) || Number.isNaN(endSeconds)) return;
    await api(`/api/episodes/${currentEpisodeId}/clips`, { method: 'POST', body: JSON.stringify({ title, startSeconds, endSeconds }) });
    document.getElementById('newClipTitle').value = '';
    document.getElementById('newClipStart').value = '';
    document.getElementById('newClipEnd').value = '';
    reloadEpisodeSection(currentEpisodeId);
  });
  document.getElementById('generate-quotes-btn').addEventListener('click', async (e) => {
    if (!currentEpisodeId) return;
    const btn = e.target;
    const errorEl = document.getElementById('social-asset-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Generating…';
    try {
      await api(`/api/episodes/${currentEpisodeId}/social-assets/generate`, { method: 'POST' });
      reloadEpisodeSection(currentEpisodeId);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate Quote Cards from Transcript';
    }
  });
  document.getElementById('add-sponsor-btn').addEventListener('click', async () => {
    if (!currentEpisodeId) return;
    const name = document.getElementById('newSponsorName').value.trim();
    const logoUrl = document.getElementById('newSponsorLogoUrl').value.trim() || null;
    if (!name) return;
    await api(`/api/episodes/${currentEpisodeId}/sponsors`, { method: 'POST', body: JSON.stringify({ name, logoUrl }) });
    document.getElementById('newSponsorName').value = '';
    document.getElementById('newSponsorLogoUrl').value = '';
    reloadEpisodeSection(currentEpisodeId);
  });

  document.getElementById('fixture-search-input').addEventListener('input', (e) => {
    const q = e.target.value;
    clearTimeout(fixtureSearchTimer);
    fixtureSearchTimer = setTimeout(() => searchFixtures(q), 300);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#fixture-search-input') && !e.target.closest('#fixture-results')) {
      hideFixtureResults();
    }
  });
  document.getElementById('sportId').addEventListener('change', (e) => {
    populateCompetitionOptions(e.target.value);
  });
  document.getElementById('competitions-checkboxes').addEventListener('change', (e) => {
    if (e.target.classList.contains('competition-checkbox')) populateClubOptions(getSelectedCompetitionIds());
  });
  document.getElementById('clubs-checkboxes').addEventListener('change', (e) => {
    if (e.target.classList.contains('club-checkbox')) populatePlayerOptions(getSelectedClubIds());
  });
  document.getElementById('canonical-event-search-input').addEventListener('input', (e) => {
    const q = e.target.value;
    clearTimeout(canonicalEventSearchTimer);
    canonicalEventSearchTimer = setTimeout(() => {
      searchCanonicalEvents(document.getElementById('article-id').value, q);
    }, 300);
  });
  // Clicking a result already hides the dropdown (linkCanonicalEvent);
  // this covers clicking anywhere else on the page instead.
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#canonical-event-search-input') && !e.target.closest('#canonical-event-results')) {
      hideCanonicalEventResults();
    }
  });
  document.getElementById('poll-add-option-btn').addEventListener('click', () => addPollOptionInput(''));
  document.getElementById('create-poll-btn').addEventListener('click', () => {
    createPoll(document.getElementById('article-id').value);
  });
  document.getElementById('delete-poll-btn').addEventListener('click', () => {
    deletePoll(document.getElementById('article-id').value);
  });

  document.getElementById('article-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('article-form-error');
    errorEl.style.display = 'none';
    const scheduledAtErrorEl = document.getElementById('scheduled-at-error');
    scheduledAtErrorEl.style.display = 'none';
    const id = document.getElementById('article-id').value;
    const data = collectFormData();
    if (data.status === 'SCHEDULED' && !data.scheduledAt) {
      scheduledAtErrorEl.textContent = 'Pick a date/time to schedule this for.';
      scheduledAtErrorEl.style.display = 'block';
      return;
    }
    try {
      if (id) {
        await api(`/api/articles/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      } else {
        await api('/api/articles', { method: 'POST', body: JSON.stringify(data) });
      }
      document.getElementById('article-form').style.display = 'none';
      loadArticles();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });

  loadArticles();
}

initArticlesPage();
