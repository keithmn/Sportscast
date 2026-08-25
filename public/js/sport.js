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

// The hub's own subnav (News / Watch / Scores & Fixtures / Tables / Teams /
// Competitions), scoped to whichever sport this page loaded for. Each tab
// reuses the exact render functions already built for the sport's
// dedicated page (news.js/scores.js/clubs.js) rather than reimplementing
// them — see BLUEPRINT.md for why those were made container-parameterized.
//
// Deliberately no "Home" tab — the sport name heading above this bar is
// followed by a light Overview digest (see loadOverviewTab) shown by
// default, Sky Sports-style, instead of a separate clickable Home entry.
const BASE_SPORT_TABS = [
  { key: 'news', label: 'News' },
  { key: 'watch', label: 'Watch' },
  { key: 'scores', label: 'Scores & Fixtures' },
  { key: 'tables', label: 'Tables' },
  { key: 'clubs', label: 'Teams' },
  { key: 'competitions', label: 'Competitions' },
];

// Per-sport additions to the base tab set — only added where there's real
// content behind them, not just to look richer. Football gets Transfers
// because that's a real, already-used Tag on real articles (matches ESPN/
// Sky Sports too: their own Rugby subnav has no Transfers tab, only
// Football's does). Nothing else earns a sport-specific tab yet; add one
// here only once a sport has real, distinct data to back it, following
// this same reasoning.
const SPORT_SPECIFIC_TABS = {
  football: [{ after: 'tables', tab: { key: 'transfers', label: 'Transfers' } }],
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

// The default view shown before any tab is explicitly picked — a light
// digest of what's in each tab below, each section linking into its full
// tab, rather than a separate "Home" tab. Built from a single "primary"
// competition (the sport's first Kenyan competition, or its first
// competition at all if there's no Kenyan one yet) so this stays one cheap
// extra fetch, not a fan-out across every competition in the sport.
async function loadOverviewTab(panelEl, sportSlug) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';

  const [{ articles }, { competitions }] = await Promise.all([
    api(`/api/articles?sport=${encodeURIComponent(sportSlug)}&limit=3`),
    api(`/api/competitions?sport=${encodeURIComponent(sportSlug)}`),
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

// Sky Sports-style: pick a date first, then see fixtures across every
// competition authorized for this sport on that day, with a competition
// filter to narrow further. Backed by GET /api/fixtures (server/routes/
// fixtures.js), a cross-competition query — unlike the Tables tab, this is
// the one tab whose data source actually changes here, not just its
// grouping. `scores.html` and each competition's own Fixtures/Results tabs
// (competition.html) are unchanged — they keep serving "browse one
// competition's full history," which this isn't replacing, just
// complementing.
async function loadScoresTab(panelEl, sportSlug) {
  const today = nairobiToday();
  panelEl.innerHTML = '<div data-date-strip></div><div data-competition-filter></div><div data-fixtures-list></div>';
  const stripEl = panelEl.querySelector('[data-date-strip]');
  const filterEl = panelEl.querySelector('[data-competition-filter]');
  const listEl = panelEl.querySelector('[data-fixtures-list]');

  let selectedDate = today;
  let selectedCompetitionSlug = null; // null = all competitions

  function renderStrip() {
    const days = [-3, -2, -1, 0, 1, 2, 3].map((offset) => addDaysToDateStr(today, offset));
    stripEl.innerHTML = `
      <div class="filter-row" data-day-buttons>
        ${days.map((d) => `<button class="filter-pill ${d === selectedDate ? 'active' : ''}" data-date="${d}">${d === today ? 'Today' : escapeHtml(formatDayLabel(d))}</button>`).join('')}
      </div>
      <input type="date" data-date-input value="${selectedDate}" style="margin-top:0.75rem;">`;

    stripEl.querySelector('[data-day-buttons]').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      selectedDate = btn.dataset.date;
      selectedCompetitionSlug = null;
      renderStrip();
      loadFixtures();
    });
    stripEl.querySelector('[data-date-input]').addEventListener('change', (e) => {
      if (!e.target.value) return;
      selectedDate = e.target.value;
      selectedCompetitionSlug = null;
      renderStrip();
      loadFixtures();
    });
  }

  function renderFixturesList(groups) {
    const visible = selectedCompetitionSlug ? groups.filter((g) => g.competition.slug === selectedCompetitionSlug) : groups;
    listEl.innerHTML = visible.map((g) => `
      <div style="margin-bottom:2rem;">
        <span class="section-label">${escapeHtml(g.competition.name)}</span>
        ${g.fixtures.map(fixtureRowHtml).join('')}
      </div>`).join('');
  }

  async function loadFixtures() {
    listEl.innerHTML = '<div class="empty-state">Loading…</div>';
    filterEl.innerHTML = '';
    const { fixtures } = await api(`/api/fixtures?sport=${encodeURIComponent(sportSlug)}&date=${encodeURIComponent(selectedDate)}`);

    if (!fixtures.length) {
      listEl.innerHTML = `<p class="empty-state">No fixtures scheduled for this sport on ${escapeHtml(formatDayLabel(selectedDate))}.</p>`;
      return;
    }

    const byCompetition = new Map();
    fixtures.forEach((f) => {
      if (!byCompetition.has(f.competition.slug)) byCompetition.set(f.competition.slug, { competition: f.competition, fixtures: [] });
      byCompetition.get(f.competition.slug).fixtures.push(f);
    });
    const groups = Array.from(byCompetition.values());

    if (groups.length > 1) {
      filterEl.innerHTML = `
        <div class="filter-row" style="margin-bottom:1.5rem;">
          <button class="filter-pill ${!selectedCompetitionSlug ? 'active' : ''}" data-competition="">All</button>
          ${groups.map((g) => `<button class="filter-pill" data-competition="${escapeHtml(g.competition.slug)}">${escapeHtml(g.competition.name)}</button>`).join('')}
        </div>`;
      filterEl.querySelectorAll('.filter-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedCompetitionSlug = btn.dataset.competition || null;
          filterEl.querySelectorAll('.filter-pill').forEach((p) => p.classList.toggle('active', p === btn));
          renderFixturesList(groups);
        });
      });
    }

    renderFixturesList(groups);
  }

  renderStrip();
  await loadFixtures();
}

async function loadTablesTab(panelEl, sportSlug) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { competitions } = await api(`/api/competitions?sport=${encodeURIComponent(sportSlug)}`);
  panelEl.innerHTML = '';
  return renderGroupedCompetitionsPanel(panelEl, competitions, competitionTableHtml);
}

async function loadCompetitionsTab(panelEl, sportSlug) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { competitions } = await api(`/api/competitions?sport=${encodeURIComponent(sportSlug)}`);
  renderGroupedCompetitionCards(panelEl, competitions);
}

async function loadClubsTab(panelEl, sportSlug) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { clubs } = await api('/api/clubs');
  const sportClubs = clubs.filter((c) => c.competition.sport.slug === sportSlug);
  return renderClubsSportPanel(panelEl, sportClubs);
}

const TAB_LOADERS = {
  news: loadNewsTab,
  watch: loadWatchTab,
  scores: loadScoresTab,
  tables: loadTablesTab,
  transfers: loadTransfersTab,
  clubs: loadClubsTab,
  competitions: loadCompetitionsTab,
};

// initialTab lets the main nav's Scores dropdown (site.js) deep-link
// straight into a specific tab instead of always opening on the Overview.
//
// Tabs render into #subnav-placeholder (a persistent bar inside
// .sticky-chrome, directly under the primary nav — Sky Sports-style
// three-tier header) rather than inline in the page body, so the tab bar
// stays pinned while browsing a sport section; only the tab panel itself
// lives in the page's own content area.
function renderSportTabs(root, sportSlug, sportName, initialTab) {
  const subnavEl = document.getElementById('subnav-placeholder');
  const sportTabs = getSportTabs(sportSlug);

  if (subnavEl) {
    subnavEl.innerHTML = `
      <nav class="sport-subnav">
        <span class="sport-subnav-label">${escapeHtml(sportName)}</span>
        <div class="sport-subnav-links" data-sport-tabs>
          ${sportTabs.map((t) => `<button data-key="${t.key}">${escapeHtml(t.label)}</button>`).join('')}
        </div>
      </nav>`;
  }
  root.innerHTML = '<div data-tab-panel></div>';

  const tabsEl = (subnavEl || root).querySelector('[data-sport-tabs]');
  const panelEl = root.querySelector('[data-tab-panel]');

  function openTab(key) {
    tabsEl.querySelectorAll('button').forEach((p) => p.classList.toggle('active', p.dataset.key === key));
    Promise.resolve(TAB_LOADERS[key](panelEl, sportSlug)).catch((err) => {
      panelEl.innerHTML = `<div class="empty-state">Could not load this tab: ${escapeHtml(err.message)}</div>`;
    });
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    openTab(btn.dataset.key);
  });

  // No tab is pre-highlighted for the default Overview — it isn't one of
  // the clickable tabs, it's what the sport name heading itself shows
  // before you pick one.
  if (sportTabs.some((t) => t.key === initialTab)) {
    openTab(initialTab);
  } else {
    loadOverviewTab(panelEl, sportSlug).catch((err) => {
      panelEl.innerHTML = `<div class="empty-state">Could not load this page: ${escapeHtml(err.message)}</div>`;
    });
  }
}

async function loadSportPage() {
  const slug = qs('sport');
  const root = document.getElementById('sport-root');
  if (!slug) { root.innerHTML = '<div class="empty-state">No sport specified.</div>'; return; }

  const { sports } = await api('/api/sports');
  const sport = sports.find((s) => s.slug === slug);
  const sportName = sport ? sport.name : slug;

  document.title = `${sportName} — The Sportscast`;

  renderSportTabs(root, slug, sportName, qs('tab'));
}

document.addEventListener('DOMContentLoaded', () => {
  loadSportPage().catch((err) => {
    document.getElementById('sport-root').innerHTML = `<div class="empty-state">Could not load this page: ${escapeHtml(err.message)}</div>`;
  });
});
