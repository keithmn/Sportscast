async function loadDashboard() {
  const user = await requireLogin();
  if (!user) return;

  const cards = [];
  if (canManageArticles(user)) {
    const { articles } = await api('/api/articles/admin/all');
    const drafts = articles.filter((a) => a.status === 'DRAFT').length;
    const published = articles.filter((a) => a.status === 'PUBLISHED').length;
    cards.push(`
      <a href="/admin/articles.html" style="display:contents;">
        <div class="card">
          <span class="card-eyebrow">Articles</span>
          <h3 class="card-title">${published} published, ${drafts} draft${drafts === 1 ? '' : 's'}</h3>
          <p class="card-desc">Manage stories and podcast/video posts.</p>
        </div>
      </a>`);
  }
  document.getElementById('dashboard-root').innerHTML = `<div class="card-grid">${cards.join('')}</div>`;
}

loadDashboard();
