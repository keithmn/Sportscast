function articleCardHtml(a) {
  return `
    <a href="/article.html?slug=${encodeURIComponent(a.slug)}" style="display:contents;">
      <article class="story">
        ${a.coverImageUrl ? `<img class="story-thumb" src="${escapeHtml(a.coverImageUrl)}" alt="">` : ''}
        <span class="story-cat">${escapeHtml(a.contentType === 'VIDEO_POST' ? (a.videoSeries || 'Podcast') : a.sport.name)}</span>
        <h3 class="story-hl">${escapeHtml(a.title)}</h3>
        <p class="story-desc">${escapeHtml(a.dek)}</p>
        <div class="story-foot">
          <span class="story-author">${escapeHtml(a.author.name)}</span>
          <span class="story-time">${formatDate(a.publishedAt)}</span>
        </div>
      </article>
    </a>`;
}

// The hub's own subnav (Home / News / Scores & Fixtures / Clubs / Shop),
// scoped to whichever sport this page loaded for. Each tab reuses the
// exact render functions already built for the sport's dedicated page
// (news.js/scores.js/clubs.js/shop.js) rather than reimplementing them —
// see BLUEPRINT.md for why those were made container-parameterized.
const BASE_SPORT_TABS = [
  { key: 'home', label: 'Home' },
  { key: 'news', label: 'News' },
  { key: 'watch', label: 'Watch' },
  { key: 'scores', label: 'Scores & Fixtures' },
  { key: 'clubs', label: 'Teams' },
  { key: 'shop', label: 'Kits' },
];

// Per-sport additions to the base tab set — only added where there's real
// content behind them, not just to look richer. Football gets Transfers
// because that's a real, already-used Tag on real articles (matches ESPN/
// Sky Sports too: their own Rugby subnav has no Transfers tab, only
// Football's does). Nothing else earns a sport-specific tab yet; add one
// here only once a sport has real, distinct data to back it, following
// this same reasoning.
const SPORT_SPECIFIC_TABS = {
  football: [{ after: 'scores', tab: { key: 'transfers', label: 'Transfers' } }],
};

function getSportTabs(sportSlug) {
  const extra = SPORT_SPECIFIC_TABS[sportSlug] || [];
  const tabs = [...BASE_SPORT_TABS];
  extra.forEach(({ after, tab }) => {
    const i = tabs.findIndex((t) => t.key === after);
    tabs.splice(i === -1 ? tabs.length : i + 1, 0, tab);
  });
  return tabs;
}

async function loadHomeTab(panelEl, sportSlug) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { articles } = await api(`/api/articles?sport=${encodeURIComponent(sportSlug)}&limit=6`);
  panelEl.innerHTML = articles.length
    ? `<div class="card-grid">${articles.map(articleCardHtml).join('')}</div>`
    : '<p class="empty-state">No stories published yet for this sport.</p>';
}

function loadNewsTab(panelEl, sportSlug) {
  panelEl.innerHTML = `
    <span class="section-label">Latest</span>
    <div data-news-latest></div>
    <span class="section-label" style="display:block; margin-top:2.5rem;">Stories</span>
    <div class="card-grid" data-news-stories></div>`;
  const latestEl = panelEl.querySelector('[data-news-latest]');
  const storiesEl = panelEl.querySelector('[data-news-stories]');
  return Promise.all([loadLatest(latestEl, sportSlug), loadStories(storiesEl, sportSlug)]);
}

async function loadWatchTab(panelEl, sportSlug) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { articles } = await api(`/api/articles?sport=${encodeURIComponent(sportSlug)}&contentType=VIDEO_POST&limit=12`);
  panelEl.innerHTML = articles.length
    ? `<div class="card-grid">${articles.map(articleCardHtml).join('')}</div>`
    : '<p class="empty-state">No videos published yet for this sport.</p>';
}

async function loadTransfersTab(panelEl, sportSlug) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { articles } = await api(`/api/articles?sport=${encodeURIComponent(sportSlug)}&tag=transfers&limit=20`);
  panelEl.innerHTML = articles.length
    ? `<div class="card-grid">${articles.map(articleCardHtml).join('')}</div>`
    : '<p class="empty-state">No transfer news yet for this sport.</p>';
}

async function loadScoresTab(panelEl, sportSlug) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { leagues } = await api('/api/leagues');
  const sportLeagues = leagues.filter((l) => l.sport.slug === sportSlug);
  panelEl.innerHTML = '';
  return renderScoresSportPanel(panelEl, sportLeagues);
}

async function loadClubsTab(panelEl, sportSlug) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { clubs } = await api('/api/clubs');
  const sportClubs = clubs.filter((c) => c.league.sport.slug === sportSlug);
  return renderClubsSportPanel(panelEl, sportClubs);
}

async function loadShopTab(panelEl, sportSlug) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { teams } = await api(`/api/shop/teams?sport=${encodeURIComponent(sportSlug)}`);
  return renderTeamGrid(panelEl, teams);
}

const TAB_LOADERS = {
  home: loadHomeTab,
  news: loadNewsTab,
  watch: loadWatchTab,
  scores: loadScoresTab,
  transfers: loadTransfersTab,
  clubs: loadClubsTab,
  shop: loadShopTab,
};

// initialTab lets the main nav's Scores/Kits dropdowns (site.js) deep-link
// straight into a specific tab instead of always opening on Home.
function renderSportTabs(root, sportSlug, initialTab) {
  const sportTabs = getSportTabs(sportSlug);
  root.innerHTML = `
    <div class="filter-row" data-sport-tabs></div>
    <div data-tab-panel></div>`;

  const tabsEl = root.querySelector('[data-sport-tabs]');
  const panelEl = root.querySelector('[data-tab-panel]');
  tabsEl.innerHTML = sportTabs
    .map((t) => `<button class="filter-pill" data-key="${t.key}">${escapeHtml(t.label)}</button>`)
    .join('');

  function openTab(key) {
    tabsEl.querySelectorAll('.filter-pill').forEach((p) => p.classList.toggle('active', p.dataset.key === key));
    Promise.resolve(TAB_LOADERS[key](panelEl, sportSlug)).catch((err) => {
      panelEl.innerHTML = `<div class="empty-state">Could not load this tab: ${escapeHtml(err.message)}</div>`;
    });
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    openTab(btn.dataset.key);
  });

  const validInitial = sportTabs.some((t) => t.key === initialTab) ? initialTab : 'home';
  openTab(validInitial);
}

async function loadSportPage() {
  const slug = qs('sport');
  const root = document.getElementById('sport-root');
  if (!slug) { root.innerHTML = '<div class="empty-state">No sport specified.</div>'; return; }

  const { sports } = await api('/api/sports');
  const sport = sports.find((s) => s.slug === slug);
  const sportName = sport ? sport.name : slug;

  document.title = `${sportName} — The Sportscast`;
  document.getElementById('sport-title').textContent = sportName;
  document.getElementById('sport-sub').textContent = `News, scores, teams, and kits for ${sportName} in Kenya.`;

  renderSportTabs(root, slug, qs('tab'));
}

document.addEventListener('DOMContentLoaded', () => {
  loadSportPage().catch((err) => {
    document.getElementById('sport-root').innerHTML = `<div class="empty-state">Could not load this page: ${escapeHtml(err.message)}</div>`;
  });
});
