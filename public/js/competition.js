// competition.html's bootstrap. The tab bar itself is the shared one from
// subnav.js (News/Watch/Scores & Fixtures/Tables/Transfers/Teams/
// Competitions) — this file only fetches the competition, builds a scope
// for it, and renders the page's own header (crest/name/eyebrow) above the
// shared tabs. See subnav.js for the tab mechanism, sport.js/club.js for
// the other two callers.

// Own <select>, not routed through subnav.js's scope machinery — changing
// season does a full reload via the URL's ?season= param, the same way
// changing ?slug= already does, rather than trying to hot-swap
// competition.detail inside every tab's already-rendered DOM.
function seasonSelectorHtml(competition) {
  if (!competition.seasons || competition.seasons.length < 2) return '';
  const options = competition.seasons.map((s) => `<option value="${escapeHtml(s.id)}" ${s.id === competition.viewingSeasonId ? 'selected' : ''}>${escapeHtml(s.label)}${s.isCurrent ? ' (current)' : ''}</option>`).join('');
  return `<select id="season-select">${options}</select>`;
}

async function loadCompetitionPage() {
  const root = document.getElementById('competition-root');
  const slug = qs('slug');
  if (!slug) { root.innerHTML = '<div class="container"><div class="empty-state">No competition specified.</div></div>'; return; }

  const competition = await fetchCompetitionDetail(slug, qs('season'));
  document.title = `${competition.name} — The Sportscast`;

  root.innerHTML = `
    <header class="page-header">
      <div class="container" style="display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap;">
        <div>
          <span class="card-eyebrow">${escapeHtml(competition.sport.name)}</span>
          <h1 class="page-title">${escapeHtml(competition.name)}</h1>
        </div>
        ${competition.seasons && competition.seasons.length > 1 ? `<span class="source-note" style="margin-left:auto;">Season</span>${seasonSelectorHtml(competition)}` : ''}
        <div${competition.seasons && competition.seasons.length > 1 ? '' : ' style="margin-left:auto;"'}>${followButtonHtml('competition', competition.slug, competition.name, `/competition.html?slug=${encodeURIComponent(competition.slug)}`)}</div>
      </div>
      ${competition.canonicalCompetition
        ? `<div class="container"><p class="source-note">Canonical record: ${escapeHtml(competition.canonicalCompetition.name)}${competition.standingsSource === 'underdawgs-data' ? ' · standings sourced from the Data Platform' : ''}</p></div>`
        : ''}
    </header>
    <div class="container" id="competition-tab-root" style="padding-top:2rem;"></div>`;

  const seasonSelect = document.getElementById('season-select');
  if (seasonSelect) {
    seasonSelect.addEventListener('change', () => {
      window.location.href = `/competition.html?slug=${encodeURIComponent(slug)}&season=${encodeURIComponent(seasonSelect.value)}`;
    });
  }

  const tabRoot = document.getElementById('competition-tab-root');
  const scope = {
    sportSlug: competition.sport.slug,
    sportName: competition.sport.name,
    competition: { slug: competition.slug, name: competition.name, detail: competition },
    club: null,
  };
  renderSecondaryNav(tabRoot, scope, 'tables');
}

document.addEventListener('DOMContentLoaded', () => {
  loadCompetitionPage().catch((err) => {
    document.getElementById('competition-root').innerHTML = `<div class="container"><div class="empty-state">Could not load this competition: ${escapeHtml(err.message)}</div></div>`;
  });
});
