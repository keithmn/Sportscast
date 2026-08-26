// Sky Sports-style secondary nav — News / Watch / Scores & Fixtures /
// Tables / Transfers[football] / Teams / Competitions — shared by
// sport.html, competition.html, and club.html. The tab SET never changes
// as you drill from a sport into one of its competitions or teams (the
// client's own framing: it "doesn't change as much"); what changes is the
// `scope` each tab loads against, and the bar's own label (sport name /
// competition name / team name).
//
// scope shape:
//   {
//     sportSlug, sportName,
//     competition: null | { slug, name, detail },   // detail = fetchCompetitionDetail(slug) — already has .standings/.fixtures, no re-fetch
//     club:        null | { slug, name, detail, competitionDetail }, // detail = GET /api/clubs/:slug; competitionDetail = fetchCompetitionDetail(detail.competition.slug)
//   }
// At most one of competition/club is set. club implies its own competition
// (via detail.competition), so club-scoped tabs reuse competitionDetail
// rather than re-fetching.

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

function competitionTeamCardHtml(club) {
  return `
    <a href="/club.html?slug=${encodeURIComponent(club.slug)}" style="display:contents;">
      <div class="card">
        ${club.crestUrl ? `<img class="team-crest" src="${escapeHtml(club.crestUrl)}" alt="" onerror="this.remove()">` : ''}
        <h3 class="card-title">${escapeHtml(club.name)}</h3>
      </div>
    </a>`;
}

const BASE_SPORT_TABS = [
  { key: 'news', label: 'News' },
  { key: 'watch', label: 'Watch' },
  { key: 'scores', label: 'Scores & Fixtures' },
  { key: 'tables', label: 'Tables' },
  { key: 'clubs', label: 'Teams' },
  { key: 'competitions', label: 'Competitions' },
];

// Per-sport additions — only where there's real content behind them, not
// just to look richer. See sport.js's original note: Football gets
// Transfers because that's a real, already-used Tag on real articles.
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

// Narrowest-first: club > competition > sport-wide. Returns the query
// fragment for GET /api/articles and a human label for empty-state copy.
function scopeArticleQuery(scope) {
  if (scope.club) return { query: `club=${encodeURIComponent(scope.club.slug)}`, label: scope.club.name };
  if (scope.competition) return { query: `competition=${encodeURIComponent(scope.competition.slug)}`, label: scope.competition.name };
  return { query: `sport=${encodeURIComponent(scope.sportSlug)}`, label: scope.sportName };
}

function loadNewsTab(panelEl, scope) {
  panelEl.innerHTML = `
    <span class="section-label">Latest</span>
    <div data-news-latest></div>
    <span class="section-label" style="display:block; margin-top:2.5rem;">Stories</span>
    <div class="card-grid" data-news-stories></div>`;
  const latestEl = panelEl.querySelector('[data-news-latest]');
  const storiesEl = panelEl.querySelector('[data-news-stories]');
  const { query, label } = scopeArticleQuery(scope);
  return Promise.all([loadLatest(latestEl, query, label), loadStories(storiesEl, query, label)]);
}

async function loadWatchTab(panelEl, scope) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { query, label } = scopeArticleQuery(scope);
  const { articles } = await api(`/api/articles?${query}&contentType=VIDEO_POST&limit=12`);
  panelEl.innerHTML = articles.length
    ? `<div class="card-grid">${articles.map(articleCardHtml).join('')}</div>`
    : `<p class="empty-state">No videos published yet${label ? ` for ${escapeHtml(label)}` : ''}.</p>`;
}

async function loadTransfersTab(panelEl, scope) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { query, label } = scopeArticleQuery(scope);
  const { articles } = await api(`/api/articles?${query}&tag=transfers&limit=20`);
  panelEl.innerHTML = articles.length
    ? `<div class="card-grid">${articles.map(articleCardHtml).join('')}</div>`
    : `<p class="empty-state">No transfer news yet${label ? ` for ${escapeHtml(label)}` : ''}.</p>`;
}

// Best-effort — Club names and Fixture/StandingRow team-name strings are
// entered independently with no shared autocomplete (BLUEPRINT.md §19/§20;
// confirmed live, e.g. "Gor Mahia FC" the club vs "Gor Mahia" on fixtures).
// Strips FC/AFC and does a substring check either direction rather than
// requiring exact equality — imperfect, but exact-match would wrongly show
// real, well-known clubs as having zero fixtures.
function normalizeTeamName(name) {
  return (name || '').toLowerCase().replace(/\b(fc|afc)\b/g, '').replace(/\s+/g, ' ').trim();
}
function fuzzyTeamMatch(fixtureTeamName, clubName) {
  const a = normalizeTeamName(fixtureTeamName);
  const b = normalizeTeamName(clubName);
  return !!a && !!b && (a.includes(b) || b.includes(a));
}

function renderEntityFixtures(panelEl, competitionDetail, clubNameForFilter) {
  let fixtures = competitionDetail.fixtures;
  if (clubNameForFilter) {
    fixtures = fixtures.filter((f) => fuzzyTeamMatch(f.homeTeam, clubNameForFilter) || fuzzyTeamMatch(f.awayTeam, clubNameForFilter));
  }
  const upcoming = fixtures.filter((f) => f.status !== 'FINISHED');
  const results = fixtures.filter((f) => f.status === 'FINISHED').slice().reverse();
  panelEl.innerHTML = `
    ${clubNameForFilter ? '<p class="empty-state" style="margin-bottom:1.5rem;">Matched by team name — may miss fixtures entered under a different spelling.</p>' : ''}
    <span class="section-label">Upcoming Fixtures</span>
    ${upcoming.length ? fixturesListHtml(upcoming) : '<p class="empty-state">No upcoming fixtures.</p>'}
    <span class="section-label" style="display:block; margin-top:2.5rem;">Recent Results</span>
    ${results.length ? fixturesListHtml(results) : '<p class="empty-state">No results yet.</p>'}`;
}

// Sky Sports-style: pick a date first, then see fixtures across every
// competition authorized for this sport on that day, with a competition
// filter to narrow further. Sport-wide only — competition/club scope reuse
// the fixtures already fetched for that one competition instead (a single
// competition's fixture list is already small; a date-strip adds nothing).
async function loadScoresTab(panelEl, scope) {
  if (scope.club) return renderEntityFixtures(panelEl, scope.club.competitionDetail, scope.club.name);
  if (scope.competition) return renderEntityFixtures(panelEl, scope.competition.detail, null);

  const sportSlug = scope.sportSlug;
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

async function loadTablesTab(panelEl, scope) {
  if (scope.club) { panelEl.innerHTML = standingsTableHtml(scope.club.competitionDetail.standings); return; }
  if (scope.competition) { panelEl.innerHTML = standingsTableHtml(scope.competition.detail.standings); return; }

  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { competitions } = await api(`/api/competitions?sport=${encodeURIComponent(scope.sportSlug)}`);
  panelEl.innerHTML = '';
  return renderGroupedCompetitionsPanel(panelEl, competitions, competitionTableHtml);
}

// Sport-wide regardless of scope, deliberately — lets you navigate sideways
// to a different competition in the same sport from a competition or team
// page, same tab and same query throughout.
async function loadCompetitionsTab(panelEl, scope) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { competitions } = await api(`/api/competitions?sport=${encodeURIComponent(scope.sportSlug)}`);
  renderGroupedCompetitionCards(panelEl, competitions);
}

async function renderTeamsForCompetition(panelEl, competitionSlug) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { clubs } = await api(`/api/clubs?competition=${encodeURIComponent(competitionSlug)}`);
  panelEl.innerHTML = clubs.length
    ? `<div class="card-grid">${clubs.map(competitionTeamCardHtml).join('')}</div>`
    : '<p class="empty-state">No teams entered for this competition yet.</p>';
}

async function loadClubsTab(panelEl, scope) {
  if (scope.club) return renderTeamsForCompetition(panelEl, scope.club.detail.competition.slug);
  if (scope.competition) return renderTeamsForCompetition(panelEl, scope.competition.slug);

  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const { clubs } = await api('/api/clubs');
  // Jurisdictional policy: the sport-wide Teams tab is strictly Kenyan
  // teams, never Global ones (Arsenal/Bayern/etc. don't belong in a
  // general "browse this sport's teams" surface, even though their own
  // Club rows exist here for competition-page context). A specific
  // competition's own Teams tab (renderTeamsForCompetition, above) is
  // unaffected — if you're on the Premier League's own competition page,
  // seeing its real teams is expected, not a jurisdiction violation.
  const sportClubs = clubs.filter((c) => c.competition.sport.slug === scope.sportSlug && c.competition.region === 'KENYA');
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

function subnavLabel(scope) {
  if (scope.club) return scope.club.name;
  if (scope.competition) return scope.competition.name;
  return scope.sportName;
}

// Renders into #subnav-placeholder (persistent bar inside .sticky-chrome,
// directly under the primary nav — Sky Sports-style three-tier header) so
// the tab bar stays pinned while browsing; only the tab panel itself lives
// in the page's own content area. `defaultTab` is shown when no tab is
// explicitly picked — sport.html uses this for its light Overview digest
// (see loadOverviewTab in sport.js, sport-hub only); competition.html/
// club.html pass a real tab key ('tables') since there's no per-competition
// or per-team Overview concept.
function renderSecondaryNav(root, scope, initialTab, defaultTabRenderer) {
  const subnavEl = document.getElementById('subnav-placeholder');
  const sportTabs = getSportTabs(scope.sportSlug);

  if (subnavEl) {
    subnavEl.innerHTML = `
      <nav class="sport-subnav">
        <span class="sport-subnav-label">${escapeHtml(subnavLabel(scope))}</span>
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
    Promise.resolve(TAB_LOADERS[key](panelEl, scope)).catch((err) => {
      panelEl.innerHTML = `<div class="empty-state">Could not load this tab: ${escapeHtml(err.message)}</div>`;
    });
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    openTab(btn.dataset.key);
  });

  if (sportTabs.some((t) => t.key === initialTab)) {
    openTab(initialTab);
  } else if (defaultTabRenderer) {
    // No tab pre-highlighted — matches the default view not being one of
    // the clickable tabs (sport.html's Overview).
    defaultTabRenderer(panelEl, scope).catch((err) => {
      panelEl.innerHTML = `<div class="empty-state">Could not load this page: ${escapeHtml(err.message)}</div>`;
    });
  } else {
    openTab(sportTabs[0].key);
  }
}
