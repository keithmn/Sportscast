// Populates the homepage — 2026-08-20: rebuilt to be strictly a news
// feed (Sports tiles → Top Stories → Latest briefs). The podcast
// carousel, niche shows grid, Teams teaser, shop promo, and newsletter
// all used to live here too — removed along with their markup in
// index.html, not just hidden; that content already has a home on
// /shows.html, /clubs.html, and /shop.html.
//
// 2026-09-13: a "What's On" fixtures strip was deliberately added back —
// a real, explicit reversal of the "no teaser sections" call above, not
// an oversight. Uses the same fixtureRowHtml/api() this page's Sports
// tiles already lean on; see js/scores.js (now loaded on this page too)
// and GET /api/fixtures/upcoming.

// Quick-jump into each active sport's hub — same active-sports list and
// filter as the nav's own Sports dropdown (nav-dropdown.js), just
// rendered as tiles instead of a dropdown list. Single-letter mark is a
// deliberate stand-in for an icon system that doesn't exist yet — no
// emoji, matches the brand's plain-text voice.
async function loadSportsTiles() {
  const grid = document.getElementById('sports-tiles-grid');
  const { sports } = await api('/api/sports');
  const activeSports = sports.filter((s) => s.isActive);

  grid.innerHTML = activeSports.length
    ? activeSports.map((s) => `
      <a class="sport-tile" href="/sport.html?sport=${encodeURIComponent(s.slug)}">
        <span class="sport-mark">${escapeHtml(s.name.charAt(0))}</span>
        <span class="sport-name">${escapeHtml(s.name)}</span>
      </a>`).join('')
    : '<p class="empty-state">No sports live yet.</p>';
}

// Top Stories — featured/full stories first, falling back to the most
// recent full stories if nothing's flagged featured yet. Big lead item +
// 2 alongside it + up to 3 more in a row below, matching the
// .stories-r1/.stories-r2/.story--lg layout in site.css.
function topStoryCardHtml(a, isLg) {
  return `
    <a href="/article.html?slug=${encodeURIComponent(a.slug)}" style="display:contents;">
      <article class="story${isLg ? ' story--lg' : ''}">
        ${a.coverImageUrl ? `<img class="story-thumb" src="${escapeHtml(a.coverImageUrl)}" alt="">` : ''}
        <span class="story-cat">${escapeHtml(a.sport.name)}</span>
        <h3 class="story-hl">${escapeHtml(a.title)}</h3>
        <p class="story-desc">${escapeHtml(a.dek)}</p>
        <div class="story-foot">
          <span class="story-author">${escapeHtml(a.author.name)}</span>
          <span class="story-time">${formatDate(a.publishedAt)}</span>
        </div>
      </article>
    </a>`;
}

async function loadTopStories() {
  const section = document.getElementById('top-stories');
  const r1 = document.getElementById('stories-r1');
  const r2 = document.getElementById('stories-r2');

  let { articles } = await api('/api/articles?isBrief=false&featured=true&limit=6');
  if (!articles.length) {
    ({ articles } = await api('/api/articles?isBrief=false&limit=6'));
  }
  if (!articles.length) { section.style.display = 'none'; return; }

  const [big, ...rest] = articles;
  r1.innerHTML = topStoryCardHtml(big, true)
    + (rest.length ? `<div class="stories-r1-col">${rest.slice(0, 2).map((a) => topStoryCardHtml(a, false)).join('')}</div>` : '');
  const r2Items = rest.slice(2, 5);
  r2.innerHTML = r2Items.map((a) => topStoryCardHtml(a, false)).join('');
  r2.style.display = r2Items.length ? 'grid' : 'none';
}

// Deliberately small (3 items) and calm — a pointer into News & Articles,
// not a feed trying to hold attention on its own. Briefs only, on purpose:
// this is "nothing else" territory, per an explicit decision not to also
// tease full features on the homepage.
async function loadNewsStrip() {
  const { articles } = await api('/api/articles?isBrief=true&limit=3');
  const list = document.getElementById('archive-list');
  if (!articles.length) { list.innerHTML = ''; return; }

  list.innerHTML = articles.map((a) => `
    <a href="/article.html?slug=${encodeURIComponent(a.slug)}" class="archive-item">
      ${a.coverImageUrl ? `<img class="archive-item-thumb" src="${escapeHtml(a.coverImageUrl)}" alt="">` : ''}
      <span class="archive-item-content">
        <span class="archive-item-main">
          <span class="archive-item-cat">${escapeHtml(a.sport.name)}</span>
          <span class="archive-item-title">${escapeHtml(a.title)}</span>
        </span>
        <span class="archive-item-date">${formatDate(a.publishedAt)}</span>
      </span>
    </a>`).join('');
}

// Cross-sport "what's happening" strip — soonest-kickoff-first, across
// every active sport, not scoped to one competition the way the shared
// fixtureRowHtml normally is (it's usually shown under a single
// competition's own heading). Each row gets its own sport/competition
// label prepended here rather than teaching fixtureRowHtml itself a new
// "show your own context" mode other callers don't need.
function whatsOnItemHtml(f) {
  return `
    <div class="whats-on-item">
      <div class="whats-on-context">
        <span class="whats-on-sport">${escapeHtml(f.competition.sport.name)}</span>
        <a href="/competition.html?slug=${encodeURIComponent(f.competition.slug)}">${escapeHtml(f.competition.name)}</a>
      </div>
      ${fixtureRowHtml(f)}
    </div>`;
}

async function loadWhatsOn() {
  const list = document.getElementById('whats-on-list');
  const { fixtures } = await api('/api/fixtures/upcoming?limit=5');

  if (!fixtures.length) {
    list.innerHTML = '<p class="empty-state">Nothing scheduled right now — check back soon.</p>';
    return;
  }
  list.innerHTML = fixtures.map(whatsOnItemHtml).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  loadSportsTiles().catch((err) => console.warn('Could not load sports tiles:', err));
  loadWhatsOn().catch((err) => console.warn('Could not load what\'s on:', err));
  loadTopStories().catch((err) => console.warn('Could not load top stories:', err));
  loadNewsStrip().catch((err) => console.warn('Could not load news strip:', err));

  // Scroll-triggered fade-up reveal for sections marked .fade-up.
  const fadeEls = document.querySelectorAll('.fade-up');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  fadeEls.forEach((el) => observer.observe(el));
});
