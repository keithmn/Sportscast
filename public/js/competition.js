// competition.html's bootstrap. The tab bar itself is the shared one from
// subnav.js (News/Watch/Scores & Fixtures/Tables/Transfers/Teams/
// Competitions) — this file only fetches the competition, builds a scope
// for it, and renders the page's own header (crest/name/eyebrow) above the
// shared tabs. See subnav.js for the tab mechanism, sport.js/club.js for
// the other two callers.

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
    <div class="container" id="competition-tab-root" style="padding-top:2rem;"></div>`;

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
