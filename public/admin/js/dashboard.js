// Dashboard (rebuilt 2026-10-20): one "what needs me now" list, most
// urgent first, every item a link to the exact thing to fix — not a grid
// of section counts. Order:
//   1. Broken — failing jobs, overdue backup, failing sources.
//   2. Readers can see it's missing — Kenyan results overdue.
//   3. Waiting for you — provisional results, corrections to approve.
//   4. This week — fixtures without venue/broadcaster, match reports to
//      write, gaps in a round.
//   5. Leads and stories — new tips, X posts that disagree with us,
//      monitoring items, clips, scheduled and draft stories.
// Nothing with a count of zero is shown; an empty list says "All clear".

const DAY = 24 * 60 * 60 * 1000;

function ago(d) {
  if (!d) return 'never';
  const h = Math.round((Date.now() - new Date(d).getTime()) / 3600000);
  return h < 1 ? 'under an hour ago' : h < 48 ? `${h}h ago` : formatDate(d);
}

function game(f) {
  return `${escapeHtml(f.homeTeam)} v ${escapeHtml(f.awayTeam || '')}`;
}

// A group of to-do items: { level: 'urgent'|'act'|'info', title, items: [{ text, href }] , more? }
function groupHtml({ level, title, note, items, moreHref, moreText }) {
  return `
    <section class="todo-group ${level}">
      <h2>${escapeHtml(title)}</h2>
      ${note ? `<p class="todo-note">${note}</p>` : ''}
      <ul>${items.map((i) => `<li><a href="${escapeHtml(i.href)}">${i.text}</a>${i.meta ? `<span class="todo-meta">${i.meta}</span>` : ''}</li>`).join('')}</ul>
      ${moreHref ? `<a class="todo-more" href="${escapeHtml(moreHref)}">${escapeHtml(moreText || 'See all')} →</a>` : ''}
    </section>`;
}

const competitionsHref = (slug, extra = '') => `/admin/competitions.html?competition=${encodeURIComponent(slug)}&tab=fixtures${extra}`;
const resultsHref = (slug) => `/admin/results.html?competition=${encodeURIComponent(slug)}`;

async function loadDashboard() {
  const user = await requireLogin();
  if (!user) return;
  const root = document.getElementById('dashboard-root');
  if (!canManageArticles(user)) {
    root.innerHTML = user.role === 'CORRESPONDENT'
      ? '<p>You enter results on the <a href="/admin/results.html">Results</a> page.</p>'
      : '<p class="empty-state">Nothing here for your account.</p>';
    return;
  }
  root.innerHTML = '<p class="empty-state">Loading…</p>';

  const safe = (p, fallback) => p.catch(() => fallback);
  const [
    health, { sources }, { fixtures: overdue }, { fixtures: provisional }, { corrections: pendingCorrections },
    { fixtures: missingInfo }, { fixtures: missingReports }, { gaps: roundGaps }, { submissions }, { items: leads },
    { posts: xPosts }, { clips: pendingClips }, { articles },
  ] = await Promise.all([
    safe(api('/api/health/details'), null),
    safe(api('/api/sources'), { sources: [] }),
    safe(api('/api/fixtures/overdue'), { fixtures: [] }),
    safe(api('/api/fixtures/provisional'), { fixtures: [] }),
    safe(api('/api/competitions/corrections/pending'), { corrections: [] }),
    safe(api('/api/fixtures/missing-info'), { fixtures: [] }),
    safe(api('/api/fixtures/missing-reports'), { fixtures: [] }),
    safe(api('/api/fixtures/round-gaps'), { gaps: [] }),
    safe(api('/api/submissions'), { submissions: [] }),
    safe(api('/api/monitoring?status=NEW'), { items: [] }),
    safe(api('/api/watch/posts?status=NEW&attention=1'), { posts: [] }),
    safe(api('/api/episodes/clips/pending'), { clips: [] }),
    safe(api('/api/articles/admin/all'), { articles: [] }),
  ]);

  const groups = [];

  // 1. Broken
  const broken = [];
  if (health) {
    [...new Set(health.failures.map((f) => f.job))].forEach((job) => {
      const f = health.failures.find((x) => x.job === job);
      broken.push({ text: `Scheduled job "${escapeHtml(job)}" failed ${escapeHtml(ago(f.startedAt))}`, meta: escapeHtml((f.error || '').slice(0, 120)), href: '/admin/dashboard.html#system' });
    });
    if (health.backupOverdue) broken.push({ text: `Last database backup: ${escapeHtml(ago(health.lastBackup && health.lastBackup.startedAt))}`, meta: 'Nightly backups should run at 02:30 — see JOB_RUNBOOK.md', href: '/admin/dashboard.html#system' });
  }
  sources.filter((s) => s.isActive && s.syncStatus === 'ERROR').forEach((s) => broken.push({ text: `Source "${escapeHtml(s.name)}" is failing`, meta: escapeHtml((s.lastError || '').slice(0, 120)), href: '/admin/sources.html' }));
  if (broken.length) groups.push({ level: 'urgent', title: 'Something is broken', items: broken });

  // 2. Results readers are waiting for
  if (overdue.length) {
    groups.push({
      level: 'urgent', title: `${overdue.length} result${overdue.length === 1 ? '' : 's'} overdue`,
      note: 'Shown on the site as "Result pending".',
      items: overdue.slice(0, 8).map((f) => ({ text: `${game(f)}`, meta: `${escapeHtml(f.competition.name)} · ${escapeHtml(formatDate(f.kickoff))}`, href: resultsHref(f.competition.slug) })),
      moreHref: '/admin/results.html', moreText: 'Enter results',
    });
  }

  // 3. Waiting for you
  const waiting = [
    ...provisional.map((f) => ({ text: `Confirm ${game(f)} ${f.homeScore}–${f.awayScore}`, meta: `Provisional, from a correspondent · ${escapeHtml(f.competition.name)}`, href: '/admin/results.html' })),
    ...pendingCorrections.map((c) => ({ text: `Approve correction: ${escapeHtml(c.fixture.homeTeam)} v ${escapeHtml(c.fixture.awayTeam)} ${c.beforeHome}–${c.beforeAway} → ${c.afterHome}–${c.afterAway}`, meta: `by ${escapeHtml(c.userName)}: ${escapeHtml(c.reason || '')}`, href: '/admin/results.html' })),
  ];
  if (waiting.length) groups.push({ level: 'act', title: 'Waiting for you', items: waiting });

  // 4. This week
  const week = [
    ...missingInfo.slice(0, 6).map((f) => ({ text: `${game(f)}: add ${f.missing.join(' and ')}`, meta: `${escapeHtml(f.competition.name)} · ${escapeHtml(formatDate(f.kickoff))}`, href: competitionsHref(f.competition.slug, `&fixture=${encodeURIComponent(f.id)}`) })),
    ...missingReports.slice(0, 6).map((f) => ({ text: `Write the report: ${game(f)} ${f.homeScore}–${f.awayScore}`, meta: escapeHtml(f.competition.name), href: `/admin/articles.html?new=1&fixture=${encodeURIComponent(f.id)}` })),
    ...roundGaps.slice(0, 4).map((g) => ({ text: `${escapeHtml(g.competition.name)} ${escapeHtml(g.round)}: no fixture for ${g.missing.map(escapeHtml).join(', ')}`, meta: 'Add the missing game', href: competitionsHref(g.competition.slug) })),
  ];
  if (week.length) groups.push({ level: 'act', title: 'This week', items: week });

  // 5. Leads and stories
  const newTips = submissions.filter((s) => s.status === 'NEW');
  const scheduled = articles.filter((a) => a.status === 'SCHEDULED' && a.scheduledAt).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const drafts = articles.filter((a) => a.status === 'DRAFT');
  const lastStory = articles.filter((a) => a.status === 'PUBLISHED' && a.publishedAt).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))[0];
  const leadsItems = [
    ...(xPosts.length ? [{ text: `${xPosts.length} X post${xPosts.length === 1 ? '' : 's'} disagree with us or are ahead of us`, href: '/admin/watch.html' }] : []),
    ...(newTips.length ? [{ text: `${newTips.length} new reader tip${newTips.length === 1 ? '' : 's'}`, href: '/admin/submissions.html' }] : []),
    ...(leads.length ? [{ text: `${leads.length} new monitoring lead${leads.length === 1 ? '' : 's'}`, href: '/admin/monitoring.html' }] : []),
    ...(pendingClips.length ? [{ text: `${pendingClips.length} suggested clip${pendingClips.length === 1 ? '' : 's'} to review`, href: '/admin/articles.html' }] : []),
    ...(scheduled.length ? [{ text: `${scheduled.length} stor${scheduled.length === 1 ? 'y' : 'ies'} scheduled`, meta: `Next: "${escapeHtml(scheduled[0].title)}" — ${escapeHtml(formatDate(scheduled[0].scheduledAt))}`, href: '/admin/articles.html' }] : []),
    ...(drafts.length ? [{ text: `${drafts.length} draft${drafts.length === 1 ? '' : 's'}`, href: '/admin/articles.html' }] : []),
    ...(lastStory && Date.now() - new Date(lastStory.publishedAt).getTime() > 2 * DAY
      ? [{ text: `No story published for ${Math.floor((Date.now() - new Date(lastStory.publishedAt).getTime()) / DAY)} days`, meta: `Last: "${escapeHtml(lastStory.title)}"`, href: '/admin/articles.html?new=1' }] : []),
  ];
  if (leadsItems.length) groups.push({ level: 'info', title: 'Leads and stories', items: leadsItems });

  root.innerHTML = `
    ${groups.length ? groups.map(groupHtml).join('') : '<section class="todo-group clear"><h2>All clear</h2><p class="todo-note">No overdue results, nothing waiting for you, nothing missing this week.</p></section>'}
    ${health ? `
      <section class="todo-group system" id="system">
        <h2>System</h2>
        <div class="card system-card" style="cursor:default;${health.failures.length || health.backupOverdue ? ' border-left-color:var(--danger);' : ''}">
          <h3 class="card-title">${health.failures.length || health.backupOverdue ? escapeHtml([...new Set(health.failures.map((f) => `${f.job} failed (${ago(f.startedAt)})`)), ...(health.backupOverdue ? [`last backup ${ago(health.lastBackup && health.lastBackup.startedAt)}`] : [])].join(' · ')) : 'All scheduled jobs OK'}</h3>
          <p class="card-desc">${escapeHtml([
            health.lastBackup ? `Last backup ${ago(health.lastBackup.startedAt)}${health.offsiteBackupConfigured ? ', off-site copy on.' : ' — no off-site copy yet.'}` : 'No backup has run yet.',
            health.alertsConfigured ? 'Failure alerts on.' : 'Failure alerts not set up (ALERT_WEBHOOK_URL).',
            `${health.jobs.length} jobs tracked.`,
          ].join(' '))}</p>
        </div>
      </section>` : ''}`;
}

loadDashboard();
