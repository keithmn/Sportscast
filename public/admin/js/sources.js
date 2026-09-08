const CATEGORY_LABELS = {
  NEWS: 'News',
  GOVERNMENT: 'Government',
  CLUB: 'Club',
  STADIUM_PROJECT: 'Stadium Project',
  CAF: 'CAF',
  SOCIAL: 'Social',
};

const FETCH_METHOD_LABELS = {
  RSS: 'RSS feed',
  HTML_LIST: 'HTML list (scraped)',
  YOUTUBE_CHANNEL: 'YouTube channel',
  MANUAL: 'Manual',
};

const URL_HINTS = {
  RSS: 'The feed URL (e.g. https://example.com/feed.xml).',
  HTML_LIST: 'The page listing items (e.g. a press-releases index page).',
  YOUTUBE_CHANNEL: 'The channel ID (starts with "UC…"), not the channel URL.',
  MANUAL: "Not used for MANUAL sources — items are added by hand from Monitoring's queue.",
};

function updateFetchMethodFields() {
  const method = document.getElementById('fetchMethod').value;
  document.getElementById('html-list-fields').style.display = method === 'HTML_LIST' ? 'block' : 'none';
  document.getElementById('url-hint').textContent = URL_HINTS[method] || '';
}

function resetForm() {
  document.getElementById('source-form').reset();
  document.getElementById('source-id').value = '';
  document.getElementById('source-form-error').style.display = 'none';
  updateFetchMethodFields();
}

function showForm() {
  document.getElementById('source-form').style.display = 'grid';
}

function sourceRowHtml(source) {
  return `
    <tr>
      <td>${escapeHtml(source.name)}</td>
      <td>${escapeHtml(CATEGORY_LABELS[source.category] || source.category)}</td>
      <td>${escapeHtml(FETCH_METHOD_LABELS[source.fetchMethod] || source.fetchMethod)}</td>
      <td>${source.lastFetchedAt ? formatDate(source.lastFetchedAt) : '—'}</td>
      <td>${source.syncStatus ? `<span class="status-badge ${source.syncStatus === 'OK' ? 'published' : 'draft'}">${source.syncStatus}</span>` : '—'}</td>
      <td><input type="checkbox" class="active-toggle" data-id="${source.id}" ${source.isActive ? 'checked' : ''}></td>
      <td>
        <button class="btn-outline-sm edit-btn" data-id="${source.id}">Edit</button>
        <button class="btn-outline-sm delete-btn" data-id="${source.id}">Delete</button>
      </td>
    </tr>`;
}

async function loadSources() {
  const { sources } = await api('/api/sources');
  const tbody = document.getElementById('sources-tbody');
  tbody.innerHTML = sources.length
    ? sources.map(sourceRowHtml).join('')
    : '<tr><td colspan="7" class="empty-state">No sources yet — add one above.</td></tr>';

  tbody.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => editSource(sources.find((s) => s.id === btn.dataset.id)));
  });
  tbody.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteSource(btn.dataset.id));
  });
  tbody.querySelectorAll('.active-toggle').forEach((cb) => {
    cb.addEventListener('change', async () => {
      await api(`/api/sources/${cb.dataset.id}`, { method: 'PUT', body: JSON.stringify({ isActive: cb.checked }) });
    });
  });
}

function editSource(source) {
  resetForm();
  document.getElementById('source-id').value = source.id;
  document.getElementById('name').value = source.name;
  document.getElementById('category').value = source.category;
  document.getElementById('fetchMethod').value = source.fetchMethod;
  document.getElementById('url').value = source.url;
  document.getElementById('listItemSelector').value = source.listItemSelector || '';
  document.getElementById('titleSelector').value = source.titleSelector || '';
  document.getElementById('linkSelector').value = source.linkSelector || '';
  document.getElementById('dateSelector').value = source.dateSelector || '';
  document.getElementById('fetchIntervalCron').value = source.fetchIntervalCron || '';
  document.getElementById('isActive').checked = source.isActive;
  updateFetchMethodFields();
  showForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteSource(id) {
  if (!confirm('Delete this source? Its staged items will be deleted too. This cannot be undone.')) return;
  await api(`/api/sources/${id}`, { method: 'DELETE' });
  loadSources();
}

function collectFormData() {
  return {
    name: document.getElementById('name').value.trim(),
    category: document.getElementById('category').value,
    fetchMethod: document.getElementById('fetchMethod').value,
    url: document.getElementById('url').value.trim(),
    listItemSelector: document.getElementById('listItemSelector').value.trim() || null,
    titleSelector: document.getElementById('titleSelector').value.trim() || null,
    linkSelector: document.getElementById('linkSelector').value.trim() || null,
    dateSelector: document.getElementById('dateSelector').value.trim() || null,
    fetchIntervalCron: document.getElementById('fetchIntervalCron').value.trim() || null,
    isActive: document.getElementById('isActive').checked,
  };
}

async function initSourcesPage() {
  const user = await requireLogin();
  if (!user) return;

  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('sources-app').style.display = 'block';

  document.getElementById('new-source-btn').addEventListener('click', () => {
    resetForm();
    showForm();
  });
  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    document.getElementById('source-form').style.display = 'none';
  });
  document.getElementById('fetchMethod').addEventListener('change', updateFetchMethodFields);

  document.getElementById('source-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('source-form-error');
    errorEl.style.display = 'none';
    const id = document.getElementById('source-id').value;
    const data = collectFormData();
    try {
      if (id) {
        await api(`/api/sources/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      } else {
        await api('/api/sources', { method: 'POST', body: JSON.stringify(data) });
      }
      document.getElementById('source-form').style.display = 'none';
      loadSources();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });

  updateFetchMethodFields();
  loadSources();
}

initSourcesPage();
