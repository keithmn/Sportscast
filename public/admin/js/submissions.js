const TYPE_LABELS = {
  CONTACT: 'Contact',
  TIP: 'News Tip',
  PARTNERSHIP: 'Work With Us',
  SHOP_INTEREST: 'Shop Waitlist',
  NEWSLETTER: 'Newsletter Signup',
};

// The whole message (it was cut to one line), the email as a link to
// reply, and a tip can become a story draft in one tap (2026-10-20).
function submissionRowHtml(s) {
  const safeEmail = /^[^@\s]+@[^@\s]+$/.test(s.email || '') ? s.email : '';
  return `
    <tr class="submission-row">
      <td>${escapeHtml(TYPE_LABELS[s.type] || s.type)}</td>
      <td>${escapeHtml(s.name || '—')}</td>
      <td>${safeEmail ? `<a href="mailto:${escapeHtml(safeEmail)}">${escapeHtml(safeEmail)}</a>` : escapeHtml(s.email || '—')}</td>
      <td class="submission-message">${escapeHtml(s.message || '—')}</td>
      <td>${formatDate(s.createdAt)}</td>
      <td><span class="status-badge ${s.status === 'REVIEWED' ? 'published' : 'draft'}">${s.status}</span></td>
      <td class="submission-actions">
        ${s.type === 'TIP' || s.type === 'CONTACT' ? `<a class="btn-outline-sm" href="/admin/articles.html?submission=${encodeURIComponent(s.id)}">Turn into a story</a>` : ''}
        ${s.status === 'NEW' ? `<button class="btn-outline-sm mark-reviewed-btn" data-id="${s.id}">Mark reviewed</button>` : ''}
      </td>
    </tr>`;
}

async function loadSubmissions() {
  const { submissions } = await api('/api/submissions');
  const tbody = document.getElementById('submissions-tbody');
  tbody.innerHTML = submissions.length
    ? submissions.map(submissionRowHtml).join('')
    : '<tr><td colspan="7" class="empty-state">No submissions yet.</td></tr>';

  tbody.querySelectorAll('.mark-reviewed-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/submissions/${btn.dataset.id}`, { method: 'PUT', body: JSON.stringify({ status: 'REVIEWED' }) });
      loadSubmissions();
    });
  });
}

async function initSubmissionsPage() {
  const user = await requireLogin();
  if (!user) return;

  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('submissions-app').style.display = 'block';
  loadSubmissions();
}

initSubmissionsPage();
