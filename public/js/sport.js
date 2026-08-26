// sport.html's own bootstrap. The shared tab-bar mechanism (tab set, tab
// loaders, TAB_LOADERS, renderSecondaryNav) lives in subnav.js — this file
// only has what's genuinely sport-hub-specific: the Overview digest shown
// before any tab is explicitly picked, and wiring the page's own sportSlug
// into a `scope` for the shared renderer. See subnav.js for the tab
// mechanism itself, competition.js/club.js for the other two callers.

// The default view shown before any tab is explicitly picked — a light
// digest of what's in each tab below, each section linking into its full
// tab, rather than a separate "Home" tab. Built from a single "primary"
// competition (the sport's first Kenyan competition, or its first
// competition at all if there's no Kenyan one yet) so this stays one cheap
// extra fetch, not a fan-out across every competition in the sport.
// Sport-hub only — competition.html/club.html have no Overview concept,
// they default straight into a real tab (Tables).
async function loadOverviewTab(panelEl, scope) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';

  const [{ articles }, { competitions }] = await Promise.all([
    api(`/api/articles?sport=${encodeURIComponent(scope.sportSlug)}&limit=3`),
    api(`/api/competitions?sport=${encodeURIComponent(scope.sportSlug)}`),
  ]);

  const primary = competitions.find((c) => c.region === 'KENYA' && c.category === 'LEAGUE')
    || competitions.find((c) => c.region === 'KENYA')
    || competitions[0]
    || null;
  let nextFixture = null;
  let lastResult = null;
  let topStandings = [];
  let featuredClubs = [];

  if (primary) {
    const [detail, clubsRes] = await Promise.all([
      fetchCompetitionDetail(primary.slug),
      api(`/api/clubs?competition=${encodeURIComponent(primary.slug)}`).catch(() => ({ clubs: [] })),
    ]);
    nextFixture = detail.fixtures.find((f) => f.status !== 'FINISHED') || null;
    const finished = detail.fixtures.filter((f) => f.status === 'FINISHED');
    lastResult = finished.length ? finished[finished.length - 1] : null;
    topStandings = detail.standings.slice(0, 3);
    featuredClubs = clubsRes.clubs.slice(0, 3);
  }

  panelEl.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:2.5rem;">
      <div>
        <span class="section-label">Latest News</span>
        ${articles.length ? `<div class="card-grid">${articles.map(articleCardHtml).join('')}</div>` : '<p class="empty-state">No stories published yet for this sport.</p>'}
      </div>
      <div>
        <span class="section-label">Scores &amp; Fixtures</span>
        ${nextFixture || lastResult
          ? `${nextFixture ? fixtureRowHtml(nextFixture) : ''}${lastResult ? fixtureRowHtml(lastResult) : ''}`
          : '<p class="empty-state">No fixtures entered for this sport yet.</p>'}
      </div>
      <div>
        <span class="section-label">Table${primary ? ` — ${escapeHtml(primary.name)}` : ''}</span>
        ${topStandings.length ? standingsTableHtml(topStandings) : '<p class="empty-state">No standings entered for this sport yet.</p>'}
      </div>
      <div>
        <span class="section-label">Teams</span>
        ${featuredClubs.length ? `<div class="card-grid">${featuredClubs.map(clubCardHtml).join('')}</div>` : '<p class="empty-state">No teams added yet for this sport.</p>'}
      </div>
    </div>`;
}

async function loadSportPage() {
  const slug = qs('sport');
  const root = document.getElementById('sport-root');
  if (!slug) { root.innerHTML = '<div class="empty-state">No sport specified.</div>'; return; }

  const { sports } = await api('/api/sports');
  const sport = sports.find((s) => s.slug === slug);
  const sportName = sport ? sport.name : slug;

  document.title = `${sportName} — The Sportscast`;

  renderSecondaryNav(root, { sportSlug: slug, sportName, competition: null, club: null }, qs('tab'), loadOverviewTab);
}

document.addEventListener('DOMContentLoaded', () => {
  loadSportPage().catch((err) => {
    document.getElementById('sport-root').innerHTML = `<div class="empty-state">Could not load this page: ${escapeHtml(err.message)}</div>`;
  });
});
