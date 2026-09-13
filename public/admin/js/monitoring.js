const CATEGORY_LABELS = {
  NEWS: 'News',
  GOVERNMENT: 'Government',
  CLUB: 'Club',
  STADIUM_PROJECT: 'Stadium Project',
  CAF: 'CAF',
  SOCIAL: 'Social',
};

let allSports = [];
let allAuthors = [];

function relevancePillHtml(score) {
  if (score == null) return '<span class="status-badge draft">Pending</span>';
  const cls = score >= 60 ? 'published' : 'draft'; // reuse the existing two-variant status-badge palette
  return `<span class="status-badge ${cls}">${score}</span>`;
}

// item.externalUrl comes from scraped/RSS/YouTube third-party content, so
// it's untrusted — only ever render it as a clickable href if it's a plain
// http(s) URL. Anything else (e.g. a javascript: URI) is shown as inert
// escaped text instead of a link, since escaping alone stops attribute
// breakout but not a dangerous URI scheme.
function externalLinkHtml(url, label) {
  const isSafe = /^https?:\/\//i.test(url || '');
  const safeLabel = escapeHtml(label);
  return isSafe
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${safeLabel}</a>`
    : safeLabel;
}

function itemRowHtml(item) {
  const promoted = item.status === 'PROMOTED';
  return `
    <tr data-row-id="${item.id}">
      <td>${escapeHtml(item.source.name)}<br><span style="color:var(--text-secondary); font-size:0.8em;">${escapeHtml(CATEGORY_LABELS[item.source.category] || item.source.category)}</span></td>
      <td style="max-width:320px;">${externalLinkHtml(item.externalUrl, item.title)}<br><span style="color:var(--text-secondary); font-size:0.8em;">${formatDate(item.publishedAt || item.fetchedAt)}</span></td>
      <td style="max-width:360px;">${escapeHtml(item.aiSummary || '—')}</td>
      <td>${relevancePillHtml(item.aiRelevanceScore)}</td>
      <td><span class="status-badge ${item.status === 'PROMOTED' ? 'published' : 'draft'}">${item.status}</span>${promoted && item.promotedArticle ? `<br><a href="/admin/articles.html" style="font-size:0.8em;">View draft</a>` : ''}</td>
      <td style="white-space:nowrap;">
        ${!promoted && item.status !== 'DISMISSED' ? `<button class="btn-outline-sm promote-btn" data-id="${item.id}">Promote</button> ` : ''}
        ${item.status === 'NEW' ? `<button class="btn-outline-sm reviewed-btn" data-id="${item.id}">Mark Reviewed</button> ` : ''}
        ${!promoted && item.status !== 'DISMISSED' ? `<button class="btn-outline-sm dismiss-btn" data-id="${item.id}">Dismiss</button>` : ''}
      </td>
    </tr>`;
}

// The inline promote form — a second <tr> injected right after the item's
// own row, toggled open/closed on "Promote" click. Matches this codebase's
// existing pattern of a toggle revealing more fields inline (e.g.
// clubs.js's cascading checkboxes) rather than a modal, which nothing else
// here uses.
function promoteRowHtml(itemId) {
  return `
    <tr data-promote-row="${itemId}">
      <td colspan="6" style="background:var(--bg-surface);">
        <div class="form-row" style="align-items:flex-end;">
          <div class="form-field">
            <label for="promote-sport-${itemId}">Sport</label>
            <select id="promote-sport-${itemId}">${allSports.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select>
          </div>
          <div class="form-field">
            <label for="promote-author-${itemId}">Byline</label>
            <select id="promote-author-${itemId}">${allAuthors.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
          </div>
          <button class="btn-red promote-confirm-btn" data-id="${itemId}" style="height:fit-content;">Create Draft</button>
          <button class="btn-outline-sm promote-cancel-btn" data-id="${itemId}" style="height:fit-content;">Cancel</button>
        </div>
        <p class="form-error" data-promote-error="${itemId}" style="display:none; margin-top:0.5rem;"></p>
      </td>
    </tr>`;
}

async function loadMonitoring() {
  const status = document.getElementById('status-filter').value;
  const category = document.getElementById('category-filter').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (category) params.set('category', category);

  const { items } = await api(`/api/monitoring?${params.toString()}`);
  const tbody = document.getElementById('monitoring-tbody');
  tbody.innerHTML = items.length
    ? items.map(itemRowHtml).join('')
    : '<tr><td colspan="6" class="empty-state">No items match this filter.</td></tr>';

  tbody.querySelectorAll('.reviewed-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/monitoring/${btn.dataset.id}`, { method: 'PUT', body: JSON.stringify({ status: 'REVIEWED' }) });
      loadMonitoring();
    });
  });

  tbody.querySelectorAll('.dismiss-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/monitoring/${btn.dataset.id}`, { method: 'PUT', body: JSON.stringify({ status: 'DISMISSED' }) });
      loadMonitoring();
    });
  });

  tbody.querySelectorAll('.promote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = tbody.querySelector(`tr[data-row-id="${btn.dataset.id}"]`);
      row.insertAdjacentHTML('afterend', promoteRowHtml(btn.dataset.id));
      wirePromoteRow(btn.dataset.id);
    });
  });
}

function wirePromoteRow(itemId) {
  document.querySelector(`.promote-cancel-btn[data-id="${itemId}"]`).addEventListener('click', () => {
    document.querySelector(`tr[data-promote-row="${itemId}"]`).remove();
  });

  document.querySelector(`.promote-confirm-btn[data-id="${itemId}"]`).addEventListener('click', async () => {
    const sportId = document.getElementById(`promote-sport-${itemId}`).value;
    const authorId = document.getElementById(`promote-author-${itemId}`).value;
    const errorEl = document.querySelector(`[data-promote-error="${itemId}"]`);
    try {
      await api(`/api/monitoring/${itemId}/promote`, { method: 'POST', body: JSON.stringify({ sportId, authorId }) });
      loadMonitoring();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

async function initMonitoringPage() {
  const user = await requireLogin();
  if (!user) return;

  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('monitoring-app').style.display = 'block';

  const [sportsRes, authorsRes] = await Promise.all([api('/api/sports'), api('/api/authors')]);
  allSports = sportsRes.sports;
  allAuthors = authorsRes.authors;

  document.getElementById('status-filter').addEventListener('change', loadMonitoring);
  document.getElementById('category-filter').addEventListener('change', loadMonitoring);

  loadMonitoring();
}

initMonitoringPage();
