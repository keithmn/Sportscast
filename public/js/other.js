// The "(Other)" bundle hub — for sports not yet split into their own
// dedicated page (see BLUEPRINT.md §22). Deliberately simple: no Scores/
// Teams tabs, since none of these sports have real league/club data —
// Athletics and most of Boxing are meet/fight-based, not table-based (the
// one exception, Boxing's National Boxing League, is a deferred nuance,
// not built here). Just Home / News / Watch, merged across every bundled
// sport, one small local render layer rather than reusing news.js/sport.js
// (those are built around a single sport slug, not a merge across several).

const OTHER_SPORT_SLUGS = ['volleyball', 'motorsport', 'university-sports', 'martial-arts', 'darts', 'athletics', 'boxing'];

async function fetchAcrossOtherSports(queryString) {
  const results = await Promise.all(
    OTHER_SPORT_SLUGS.map((slug) => api(`/api/articles?sport=${encodeURIComponent(slug)}&${queryString}`).catch(() => ({ articles: [] })))
  );
  return results
    .flatMap((r) => r.articles)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function otherArticleCardHtml(a) {
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

function otherLatestRowHtml(a) {
  return `
    <a href="/article.html?slug=${encodeURIComponent(a.slug)}" class="archive-item">
      <span class="archive-item-content">
        <span class="archive-item-main">
          <span class="archive-item-cat">${escapeHtml(a.sport.name)}</span>
          <span class="archive-item-title">${escapeHtml(a.title)}</span>
        </span>
        <span class="archive-item-date">${formatDate(a.publishedAt)}</span>
      </span>
    </a>`;
}

const OTHER_TABS = [
  { key: 'home', label: 'Home' },
  { key: 'news', label: 'News' },
  { key: 'watch', label: 'Watch' },
];

async function loadOtherHomeTab(panelEl) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const articles = (await fetchAcrossOtherSports('limit=8')).slice(0, 8);
  panelEl.innerHTML = articles.length
    ? `<div class="card-grid">${articles.map(otherArticleCardHtml).join('')}</div>`
    : '<p class="empty-state">No stories published yet for these sports.</p>';
}

async function loadOtherNewsTab(panelEl) {
  panelEl.innerHTML = `
    <span class="section-label">Latest</span>
    <div data-other-latest><div class="empty-state">Loading…</div></div>
    <span class="section-label" style="display:block; margin-top:2.5rem;">Stories</span>
    <div class="card-grid" data-other-stories></div>`;
  const [latest, stories] = await Promise.all([
    fetchAcrossOtherSports('isBrief=true&limit=20'),
    fetchAcrossOtherSports('contentType=ARTICLE&isBrief=false&limit=20'),
  ]);
  panelEl.querySelector('[data-other-latest]').innerHTML = latest.length
    ? latest.map(otherLatestRowHtml).join('')
    : '<p class="empty-state">No news briefs yet for these sports.</p>';
  panelEl.querySelector('[data-other-stories]').innerHTML = stories.length
    ? stories.map(otherArticleCardHtml).join('')
    : '<p class="empty-state">No stories yet for these sports.</p>';
}

async function loadOtherWatchTab(panelEl) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const articles = (await fetchAcrossOtherSports('contentType=VIDEO_POST&limit=20'));
  panelEl.innerHTML = articles.length
    ? `<div class="card-grid">${articles.map(otherArticleCardHtml).join('')}</div>`
    : '<p class="empty-state">No videos published yet for these sports.</p>';
}

const OTHER_TAB_LOADERS = { home: loadOtherHomeTab, news: loadOtherNewsTab, watch: loadOtherWatchTab };

function renderOtherTabs(root) {
  root.innerHTML = `
    <div class="filter-row" data-other-tabs></div>
    <div data-tab-panel></div>`;
  const tabsEl = root.querySelector('[data-other-tabs]');
  const panelEl = root.querySelector('[data-tab-panel]');
  tabsEl.innerHTML = OTHER_TABS.map((t) => `<button class="filter-pill" data-key="${t.key}">${escapeHtml(t.label)}</button>`).join('');

  function openTab(key) {
    tabsEl.querySelectorAll('.filter-pill').forEach((p) => p.classList.toggle('active', p.dataset.key === key));
    OTHER_TAB_LOADERS[key](panelEl).catch((err) => {
      panelEl.innerHTML = `<div class="empty-state">Could not load this tab: ${escapeHtml(err.message)}</div>`;
    });
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    openTab(btn.dataset.key);
  });

  openTab('home');
}

document.addEventListener('DOMContentLoaded', () => {
  renderOtherTabs(document.getElementById('other-root'));
});
