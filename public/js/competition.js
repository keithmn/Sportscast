function competitionTeamCardHtml(club) {
  return `
    <a href="/club.html?slug=${encodeURIComponent(club.slug)}" style="display:contents;">
      <div class="card">
        ${club.crestUrl ? `<img class="team-crest" src="${escapeHtml(club.crestUrl)}" alt="" onerror="this.remove()">` : ''}
        <h3 class="card-title">${escapeHtml(club.name)}</h3>
      </div>
    </a>`;
}

// Sky Sports-style competition hub: Table / Fixtures / Results / Teams, all
// drawn from the one GET /api/competitions/:slug fetch (already returns
// standings + fixtures) plus one extra call for Teams. No new schema or
// endpoints — this page just gives the existing data its own dedicated
// per-competition view, distinct from the flat cross-competition Scores
// page and each sport hub's own Scores/Tables tabs.
const COMPETITION_TABS = [
  { key: 'table', label: 'Table' },
  { key: 'fixtures', label: 'Fixtures' },
  { key: 'results', label: 'Results' },
  { key: 'teams', label: 'Teams' },
];

function renderTableTab(panelEl, competition) {
  panelEl.innerHTML = standingsTableHtml(competition.standings);
}

function renderFixturesTab(panelEl, competition) {
  const upcoming = competition.fixtures.filter((f) => f.status !== 'FINISHED');
  panelEl.innerHTML = fixturesListHtml(upcoming);
}

function renderResultsTab(panelEl, competition) {
  const results = competition.fixtures.filter((f) => f.status === 'FINISHED').slice().reverse();
  panelEl.innerHTML = fixturesListHtml(results);
}

async function renderTeamsTab(panelEl, competition) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { clubs } = await api(`/api/clubs?competition=${encodeURIComponent(competition.slug)}`);
  panelEl.innerHTML = clubs.length
    ? `<div class="card-grid">${clubs.map(competitionTeamCardHtml).join('')}</div>`
    : '<p class="empty-state">No teams entered for this competition yet.</p>';
}

const COMPETITION_TAB_RENDERERS = {
  table: renderTableTab,
  fixtures: renderFixturesTab,
  results: renderResultsTab,
  teams: renderTeamsTab,
};

async function loadCompetitionPage() {
  const root = document.getElementById('competition-root');
  const slug = qs('slug');
  if (!slug) { root.innerHTML = '<div class="container"><div class="empty-state">No competition specified.</div></div>'; return; }

  const competition = await fetchCompetitionDetail(slug);
  document.title = `${competition.name} — The Sportscast`;

  root.innerHTML = `
    <header class="page-header">
      <div class="container">
        <span class="card-eyebrow">${escapeHtml(competition.sport.name)}</span>
        <h1 class="page-title">${escapeHtml(competition.name)}</h1>
      </div>
    </header>
    <nav class="sport-subnav">
      <div class="sport-subnav-links" data-competition-tabs>
        ${COMPETITION_TABS.map((t) => `<button data-key="${t.key}">${escapeHtml(t.label)}</button>`).join('')}
      </div>
    </nav>
    <div class="container" data-tab-panel style="padding-top:2rem;"></div>`;

  const tabsEl = root.querySelector('[data-competition-tabs]');
  const panelEl = root.querySelector('[data-tab-panel]');

  function openTab(key) {
    tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
    Promise.resolve(COMPETITION_TAB_RENDERERS[key](panelEl, competition)).catch((err) => {
      panelEl.innerHTML = `<div class="empty-state">Could not load this tab: ${escapeHtml(err.message)}</div>`;
    });
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    openTab(btn.dataset.key);
  });

  openTab('table');
}

document.addEventListener('DOMContentLoaded', () => {
  loadCompetitionPage().catch((err) => {
    document.getElementById('competition-root').innerHTML = `<div class="container"><div class="empty-state">Could not load this competition: ${escapeHtml(err.message)}</div></div>`;
  });
});
