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
    const [{ articles }, { items }, { submissions }, { sources }, { fixtures: todayFixtures }, { fixtures: missingReports }, { clips: pendingClips }, { fixtures: missingInfo }, { fixtures: overdue }, { gaps: roundGaps }, health] = await Promise.all([
      api('/api/articles/admin/all'),
      api('/api/monitoring?status=NEW'),
      api('/api/submissions'),
      api('/api/sources'),
      api('/api/fixtures/today'),
      api('/api/fixtures/missing-reports'),
      api('/api/episodes/clips/pending'),
      api('/api/fixtures/missing-info'),
      api('/api/fixtures/overdue'),
      api('/api/fixtures/round-gaps'),
      api('/api/health/details').catch(() => null),
    ]);

    // System: scheduled jobs and backups (server/routes/health.js). Red and
    // first when a job failed in the last day or the backup is overdue;
    // otherwise a quiet card at the end.
    if (health) {
      const ago = (d) => {
        if (!d) return 'never';
        const h = Math.round((Date.now() - new Date(d).getTime()) / 3600000);
        return h < 1 ? 'under an hour ago' : h < 48 ? `${h}h ago` : formatDate(d);
      };
      const failedJobs = [...new Set(health.failures.map((f) => f.job))];
      const problems = [
        ...failedJobs.map((j) => `${j} failed (${ago(health.failures.find((f) => f.job === j).startedAt)})`),
        ...(health.backupOverdue ? [`last backup ${ago(health.lastBackup && health.lastBackup.startedAt)}`] : []),
      ];
      const notes = [
        health.lastBackup ? `Last backup ${ago(health.lastBackup.startedAt)}${health.offsiteBackupConfigured ? ', off-site copy on' : ' — no off-site copy yet'}.` : 'No backup has run yet.',
        health.alertsConfigured ? 'Failure alerts on.' : 'Failure alerts not set up (ALERT_WEBHOOK_URL).',
      ];
      const card = `
        <div class="card system-card" style="cursor:default;${problems.length ? ' border-left-color:var(--danger);' : ''}">
          <span class="card-eyebrow"${problems.length ? ' style="color:var(--danger);"' : ''}>System</span>
          <h3 class="card-title">${problems.length ? escapeHtml(problems.join(' · ')) : 'All scheduled jobs OK'}</h3>
          <p class="card-desc">${escapeHtml(notes.join(' '))} ${health.jobs.length} jobs tracked.</p>
        </div>`;
      if (problems.length) alertCards.push(card); else cards.push(card);
    }

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

    // Wave 9 §8.8 — a finished match with no report yet is worth flagging
    // the same way a live-and-awaiting-a-result match is above; this is
    // the "already finished, still nothing written" half of that gap.
    if (missingReports.length) {
      alertCards.push(`
        <a href="/admin/competitions.html" style="display:contents;">
          <div class="card" style="border-left-color:var(--gold-text);">
            <span class="card-eyebrow" style="color:var(--gold-text);">Missing reports</span>
            <h3 class="card-title">${missingReports.length} finished match${missingReports.length === 1 ? '' : 'es'} with no report yet</h3>
            <p class="card-desc">${missingReports.slice(0, 3).map((f) => `${escapeHtml(f.homeTeam)} vs ${escapeHtml(f.awayTeam)}`).join(', ')}</p>
          </div>
        </a>`);
    }

    // Results the public site is showing as "Result pending" — the most
    // visible gap a reader can hit, so it goes before the routine cards.
    if (overdue.length) {
      cards.unshift(`
        <a href="/admin/results.html" style="display:contents;">
          <div class="card overdue-results-card">
            <span class="card-eyebrow" style="color:var(--danger);">Results overdue</span>
            <h3 class="card-title">${overdue.length} Kenyan result${overdue.length === 1 ? '' : 's'} not entered</h3>
            <p class="card-desc">Shown publicly as "Result pending". ${overdue.slice(0, 4).map((f) => `${escapeHtml(f.homeTeam)} vs ${escapeHtml(f.awayTeam)} (${escapeHtml(f.competition.name)})`).join(', ')}${overdue.length > 4 ? '…' : ''}</p>
          </div>
        </a>`);
    }

    if (roundGaps.length) {
      cards.push(`
        <a href="/admin/competitions.html" style="display:contents;">
          <div class="card">
            <span class="card-eyebrow">Fixture gaps</span>
            <h3 class="card-title">${roundGaps.length} round${roundGaps.length === 1 ? '' : 's'} with a team missing</h3>
            <p class="card-desc">${roundGaps.slice(0, 3).map((g) => `${escapeHtml(g.competition.name)} ${escapeHtml(g.round)}: ${g.missing.map(escapeHtml).join(', ')}`).join(' · ')}</p>
          </div>
        </a>`);
    }

    // The research desk's weekly to-do list: Kenyan fixtures in the next 7
    // days that still have no venue or broadcaster. Routine, not an alert.
    if (missingInfo.length) {
      const byGap = (gap) => missingInfo.filter((f) => f.missing.includes(gap)).length;
      cards.push(`
        <a href="/admin/competitions.html" style="display:contents;">
          <div class="card">
            <span class="card-eyebrow">Match details</span>
            <h3 class="card-title">${missingInfo.length} upcoming match${missingInfo.length === 1 ? '' : 'es'} missing details</h3>
            <p class="card-desc">${byGap('venue')} without a venue, ${byGap('broadcaster')} without a broadcaster — next 7 days. ${missingInfo.slice(0, 3).map((f) => `${escapeHtml(f.homeTeam)} vs ${escapeHtml(f.awayTeam)}`).join(', ')}</p>
          </div>
        </a>`);
    }

    // Wave 9 §8.8 — AI-suggested clips awaiting a human decision, across
    // every episode (previously only visible per-episode).
    if (pendingClips.length) {
      cards.push(`
        <a href="/admin/articles.html" style="display:contents;">
          <div class="card">
            <span class="card-eyebrow">Clips</span>
            <h3 class="card-title">${pendingClips.length} awaiting approval</h3>
            <p class="card-desc">${pendingClips.slice(0, 3).map((c) => escapeHtml(c.title)).join(', ')}</p>
          </div>
        </a>`);
    }

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
