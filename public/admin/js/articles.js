let allSports = [];
let allAuthors = [];
let allTags = [];
let allCompetitions = [];
let allClubs = [];

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
}

function showForm() {
  document.getElementById('article-form').style.display = 'grid';
}

function statusBadge(article) {
  return `<span class="status-badge ${article.status === 'PUBLISHED' ? 'published' : 'draft'}">${article.status}</span>`;
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

function editArticle(article) {
  resetForm();
  document.getElementById('article-id').value = article.id;
  document.getElementById('title').value = article.title;
  document.getElementById('dek').value = article.dek;
  document.getElementById('body').value = article.body;
  document.getElementById('sportId').value = article.sport.id;
  document.getElementById('authorId').value = article.author.id;
  document.getElementById('status').value = article.status;
  document.getElementById('contentType').value = article.contentType;
  document.getElementById('featured').checked = article.featured;
  document.getElementById('isBrief').checked = article.isBrief;
  document.getElementById('coverImageUrl').value = article.coverImageUrl || '';
  document.getElementById('youtubeId').value = article.youtubeId || '';
  document.getElementById('videoSeries').value = article.videoSeries || '';
  document.getElementById('episodeLabel').value = article.episodeLabel || '';
  document.getElementById('runtimeLabel').value = article.runtimeLabel || '';
  document.getElementById('episodeNumber').value = article.episode?.episodeNumber ?? '';
  document.getElementById('host').value = article.episode?.host || '';
  document.getElementById('guest').value = article.episode?.guest || '';
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
    contentType: document.getElementById('contentType').value,
    featured: document.getElementById('featured').checked,
    isBrief: document.getElementById('isBrief').checked,
    coverImageUrl: document.getElementById('coverImageUrl').value.trim() || null,
    youtubeId: document.getElementById('youtubeId').value.trim() || null,
    videoSeries: document.getElementById('videoSeries').value.trim() || null,
    episodeLabel: document.getElementById('episodeLabel').value.trim() || null,
    runtimeLabel: document.getElementById('runtimeLabel').value.trim() || null,
    episodeNumber: document.getElementById('episodeNumber').value ? parseInt(document.getElementById('episodeNumber').value, 10) : null,
    host: document.getElementById('host').value.trim() || null,
    guest: document.getElementById('guest').value.trim() || null,
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
  document.getElementById('sportId').addEventListener('change', (e) => {
    populateCompetitionOptions(e.target.value);
  });
  document.getElementById('competitions-checkboxes').addEventListener('change', (e) => {
    if (e.target.classList.contains('competition-checkbox')) populateClubOptions(getSelectedCompetitionIds());
  });
  document.getElementById('clubs-checkboxes').addEventListener('change', (e) => {
    if (e.target.classList.contains('club-checkbox')) populatePlayerOptions(getSelectedClubIds());
  });

  document.getElementById('article-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('article-form-error');
    errorEl.style.display = 'none';
    const id = document.getElementById('article-id').value;
    const data = collectFormData();
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
