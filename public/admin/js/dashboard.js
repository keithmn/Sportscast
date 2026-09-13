// "What needs attention today" — every number here is queried from data
// that already exists (Article/MonitoredItem/Submission/Source), same
// pattern as the Data Platform admin's own dashboard (see BLUEPRINT.md).
// Alerts render first and visually distinct (danger-colored left border)
// so a real problem (a source failing to sync) doesn't get lost among
// routine counts.
async function loadDashboard() {
  const user = await requireLogin();
  if (!user) return;

  const alertCards = [];
  const cards = [];

  if (canManageArticles(user)) {
    const [{ articles }, { items }, { submissions }, { sources }] = await Promise.all([
      api('/api/articles/admin/all'),
      api('/api/monitoring?status=NEW'),
      api('/api/submissions'),
      api('/api/sources'),
    ]);

    const failedSources = sources.filter((s) => s.isActive && s.syncStatus === 'ERROR');
    if (failedSources.length) {
      alertCards.push(`
        <a href="/admin/sources.html" style="display:contents;">
          <div class="card" style="border-left-color:var(--danger);">
            <span class="card-eyebrow" style="color:var(--danger);">Alert</span>
            <h3 class="card-title">${failedSources.length} source${failedSources.length === 1 ? '' : 's'} failing to sync</h3>
            <p class="card-desc">${failedSources.map((s) => escapeHtml(s.name)).join(', ')}</p>
          </div>
        </a>`);
    }

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

    cards.push(`
      <a href="/admin/monitoring.html" style="display:contents;">
        <div class="card">
          <span class="card-eyebrow">Monitoring</span>
          <h3 class="card-title">${items.length} new lead${items.length === 1 ? '' : 's'}</h3>
          <p class="card-desc">AI-triaged news/government/club leads awaiting review.</p>
        </div>
      </a>`);

    const unreviewed = submissions.filter((s) => s.status === 'NEW').length;
    cards.push(`
      <a href="/admin/submissions.html" style="display:contents;">
        <div class="card">
          <span class="card-eyebrow">Submissions</span>
          <h3 class="card-title">${unreviewed} awaiting review</h3>
          <p class="card-desc">Contact, tips, partnership, and newsletter signups.</p>
        </div>
      </a>`);
  }

  document.getElementById('dashboard-root').innerHTML = `<div class="card-grid">${alertCards.join('')}${cards.join('')}</div>`;
}

loadDashboard();
