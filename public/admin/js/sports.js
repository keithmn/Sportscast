function sportRowHtml(s) {
  return `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td>
        <label class="checkbox-row">
          <input type="checkbox" class="sport-active-toggle" data-sport-id="${s.id}" ${s.isActive ? 'checked' : ''}>
          <span style="font-size:0.85rem;">${s.isActive ? 'Live — shown on /sports.html' : 'Not live yet'}</span>
        </label>
      </td>
    </tr>`;
}

async function loadSports() {
  const { sports } = await api('/api/sports');
  const tbody = document.getElementById('sports-tbody');
  tbody.innerHTML = sports.map(sportRowHtml).join('');

  tbody.querySelectorAll('.sport-active-toggle').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      await api(`/api/sports/${checkbox.dataset.sportId}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: checkbox.checked }),
      });
      loadSports();
    });
  });
}

async function initSportsPage() {
  const user = await requireLogin();
  if (!user) return;

  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('sports-app').style.display = 'block';
  loadSports();
}

initSportsPage();
