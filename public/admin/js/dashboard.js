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
    const [{ articles }, { items }, { submissions }, { sources }, { fixtures: todayFixtures }] = await Promise.all([
      api('/api/articles/admin/all'),
      api('/api/monitoring?status=NEW'),
      api('/api/submissions'),
      api('/api/sources'),
      api('/api/fixtures/today'),
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

    // Fixtures — today's matches across every sport/competition. A live
    // one (not yet FINISHED, kickoff already passed) gets its own alert
    // treatment, same as the failed-sources card above: it's the kind of
    // thing that needs a score entered soon, not just a routine count.
    const live = todayFixtures.filter((f) => f.status === 'LIVE' || (f.status === 'SCHEDULED' && new Date(f.kickoff) < new Date()));
    if (live.length) {
      alertCards.push(`
        <a href="/admin/competitions.html" style="display:contents;">
          <div class="card" style="border-left-color:var(--gold-text);">
            <span class="card-eyebrow" style="color:var(--gold-text);">In progress</span>
            <h3 class="card-title">${live.length} match${live.length === 1 ? '' : 'es'} underway or awaiting a result</h3>
            <p class="card-desc">${live.map((f) => `${escapeHtml(f.homeTeam)} vs ${escapeHtml(f.awayTeam)}`).join(', ')}</p>
          </div>
        </a>`);
    }
    cards.push(`
      <a href="/admin/competitions.html" style="display:contents;">
        <div class="card">
          <span class="card-eyebrow">Fixtures</span>
          <h3 class="card-title">${todayFixtures.length} match${todayFixtures.length === 1 ? '' : 'es'} today</h3>
          <p class="card-desc">${todayFixtures.length ? todayFixtures.slice(0, 3).map((f) => escapeHtml(f.competition.name)).join(', ') : 'Nothing scheduled today.'}</p>
        </div>
      </a>`);

    // Production — draft video posts (episodes not yet published).
    const draftEpisodes = articles.filter((a) => a.contentType === 'VIDEO_POST' && a.status === 'DRAFT');
    cards.push(`
      <a href="/admin/articles.html" style="display:contents;">
        <div class="card">
          <span class="card-eyebrow">Production</span>
          <h3 class="card-title">${draftEpisodes.length} episode${draftEpisodes.length === 1 ? '' : 's'} in edit</h3>
          <p class="card-desc">Video posts still in Draft.</p>
        </div>
      </a>`);

    // Publishing — scheduled stories, soonest first.
    const scheduled = articles
      .filter((a) => a.status === 'SCHEDULED' && a.scheduledAt)
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    cards.push(`
      <a href="/admin/articles.html" style="display:contents;">
        <div class="card">
          <span class="card-eyebrow">Publishing</span>
          <h3 class="card-title">${scheduled.length} scheduled</h3>
          <p class="card-desc">${scheduled.length ? `Next: "${escapeHtml(scheduled[0].title)}" — ${formatDate(scheduled[0].scheduledAt)}` : 'Nothing scheduled.'}</p>
        </div>
      </a>`);
  }

  document.getElementById('dashboard-root').innerHTML = `<div class="card-grid">${alertCards.join('')}${cards.join('')}</div>`;
}

loadDashboard();
