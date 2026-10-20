// Coverage (2026-10-20) — how complete and fresh each Kenyan competition
// is (server: GET /api/competitions/admin/coverage). "Copy as text" makes a
// short report to paste into the team's WhatsApp group.

const RIGHTS_SHORT = { UNREVIEWED: 'rights not reviewed', PERMISSION_PENDING: 'permission pending', CLEARED: 'cleared', LEGAL_HOLD: 'legal hold' };
let lastRows = [];
let lastDays = 30;

const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
function stat(label, value, low) {
  return `<span class="cov-stat${low ? ' low' : ''}"><b>${value}</b>${label}</span>`;
}

function cardHtml(r) {
  const results = pct(r.withResult, r.played);
  const onTime = pct(r.onTime, r.timedResults);
  const venue = pct(r.upcomingWithVenue, r.upcoming);
  const tv = pct(r.upcomingWithBroadcaster, r.upcoming);
  return `
    <div class="cov-card">
      <div class="cov-head">
        <strong><a href="/admin/competitions.html?competition=${encodeURIComponent(r.competition.slug)}">${escapeHtml(r.competition.name)}</a></strong>
        <span class="rights-tag">${escapeHtml(r.competition.sport)} · ${escapeHtml(RIGHTS_SHORT[r.rightsStatus] || r.rightsStatus)}</span>
      </div>
      <div class="cov-stats">
        ${stat(`of ${r.played} games have a result`, results === null ? '—' : `${results}%`, results !== null && results < 90)}
        ${stat(`on the site within ${r.resultTargetHours}h`, onTime === null ? '—' : `${onTime}%`, onTime !== null && onTime < 75)}
        ${stat('typical time to result', r.medianHoursToResult === null ? '—' : `${r.medianHoursToResult}h`)}
        ${stat(`of ${r.upcoming} upcoming have a venue`, venue === null ? '—' : `${venue}%`, venue !== null && venue < 80)}
        ${stat('have a broadcaster', tv === null ? '—' : `${tv}%`)}
        ${stat(`stor${r.stories === 1 ? 'y' : 'ies'} published`, r.stories, r.played > 0 && r.stories === 0)}
      </div>
    </div>`;
}

function reportText(rows, days) {
  const lines = [`The Sportscast — coverage, last ${days} days`];
  rows.forEach((r) => {
    const parts = [];
    if (r.played) parts.push(`${r.withResult}/${r.played} results${r.timedResults ? ` (${pct(r.onTime, r.timedResults)}% within ${r.resultTargetHours}h)` : ''}`);
    if (r.upcoming) parts.push(`${r.upcomingWithVenue}/${r.upcoming} upcoming with venue`);
    parts.push(`${r.stories} stor${r.stories === 1 ? 'y' : 'ies'}`);
    lines.push(`• ${r.competition.name}: ${parts.join(', ')}`);
  });
  return lines.join('\n');
}

async function loadCoverage() {
  const days = Number(document.getElementById('coverage-days').value);
  const root = document.getElementById('coverage-root');
  root.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const { rows } = await api(`/api/competitions/admin/coverage?days=${days}`);
    lastRows = rows;
    lastDays = days;
    root.innerHTML = rows.length ? rows.map(cardHtml).join('') : '<p class="empty-state">No Kenyan competition had games or stories in this period.</p>';
  } catch (err) {
    root.innerHTML = `<p class="empty-state">Could not load: ${escapeHtml(err.message)}</p>`;
  }
}

async function initCoveragePage() {
  const user = await requireLogin();
  if (!user) return;
  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('coverage-app').style.display = 'block';
  document.getElementById('coverage-days').addEventListener('change', loadCoverage);
  document.getElementById('copy-report').addEventListener('click', async () => {
    const text = reportText(lastRows, lastDays);
    try {
      await navigator.clipboard.writeText(text);
      document.getElementById('copy-msg').textContent = 'Copied — paste it into WhatsApp';
    } catch {
      window.prompt('Copy this report:', text);
    }
  });
  loadCoverage();
}

initCoveragePage();
