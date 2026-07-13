const TYPE_LABELS = {
  CONTACT: 'Contact',
  TIP: 'News Tip',
  PARTNERSHIP: 'Work With Us',
  SHOP_INTEREST: 'Shop Waitlist',
};

function submissionRowHtml(s) {
  return `
    <tr>
      <td>${escapeHtml(TYPE_LABELS[s.type] || s.type)}</td>
      <td>${escapeHtml(s.name || '—')}</td>
      <td>${escapeHtml(s.email)}</td>
      <td style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(s.message || '—')}</td>
      <td>${formatDate(s.createdAt)}</td>
      <td><span class="status-badge ${s.status === 'REVIEWED' ? 'published' : 'draft'}">${s.status}</span></td>
      <td>${s.status === 'NEW' ? `<button class="btn-outline-sm mark-reviewed-btn" data-id="${s.id}">Mark Reviewed</button>` : ''}</td>
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
