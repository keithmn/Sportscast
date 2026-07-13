let allSports = [];
let allAuthors = [];
let allTags = [];

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

function resetForm() {
  document.getElementById('article-form').reset();
  document.getElementById('article-id').value = '';
  setSelectedTagIds([]);
  document.getElementById('video-fields').style.display = 'none';
  document.getElementById('article-form-error').style.display = 'none';
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
  setSelectedTagIds(article.tags.map((t) => t.id));
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

  const [sportsRes, authorsRes, tagsRes] = await Promise.all([
    api('/api/sports'), api('/api/authors'), api('/api/tags'),
  ]);
  allSports = sportsRes.sports;
  allAuthors = authorsRes.authors;
  allTags = tagsRes.tags;
  populateSelect(document.getElementById('sportId'), allSports);
  populateSelect(document.getElementById('authorId'), allAuthors);
  populateTagCheckboxes(allTags);

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
