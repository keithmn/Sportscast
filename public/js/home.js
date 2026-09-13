// Populates the homepage.
//
// 2026-08-20: rebuilt to be strictly a news feed (Sports tiles → Top
// Stories → Latest briefs). The podcast carousel, niche shows grid, Teams
// teaser, shop promo, and newsletter all used to live here too — removed
// along with their markup in index.html, not just hidden; that content
// already had a home on /shows.html, /clubs.html, and /shop.html (the
// last of these was itself deleted 2026-09-13 — see BLUEPRINT.md).
//
// 2026-09-13, first pass: added back a "What's On" fixtures strip and a
// "Following" strip (localStorage, js/follows.js) — both explicit,
// deliberate reversals of the "no teaser sections" call above.
//
// 2026-09-13, second pass — full reorder: taxonomy-first (Sports →
// Following → What's On → Stories → Latest) became time-and-fan-intent-
// first. A visitor should find "what matters right now" before "what
// this site contains". New order: lead story (TOP) → live/upcoming (NOW)
// → flagship episodes (WATCH) → Kenyan competitions (LOCAL) → personal
// follows (FOLLOW) → the rest of today's editorial (READ) → browse by
// sport, last (DISCOVER — kept the "Sports" label; these are the major
// sports, not just the lesser-covered ones, so "Discover" would overclaim).

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

// TOP (the lead story, alone) + READ (everything else from the same
// fetch) — one query, two render targets, so "which article is the lead"
// can never disagree between the two sections.
function topStoryCardHtml(a, isLg) {
  return `
    <a href="/article.html?slug=${encodeURIComponent(a.slug)}" style="display:contents;">
      <article class="story${isLg ? ' story--lg' : ''}">
        ${a.coverImageUrl ? `<img loading="lazy" class="story-thumb" src="${escapeHtml(a.coverImageUrl)}" alt="">` : ''}
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

async function loadLeadAndEditorial() {
  const leadRoot = document.getElementById('lead-story-root');
  const editorialSection = document.getElementById('editorial-section');
  const r1 = document.getElementById('stories-r1');
  const r2 = document.getElementById('stories-r2');

  let { articles } = await api('/api/articles?isBrief=false&featured=true&limit=6');
  if (!articles.length) {
    ({ articles } = await api('/api/articles?isBrief=false&limit=6'));
  }
  if (!articles.length) {
    document.getElementById('lead-section').style.display = 'none';
    editorialSection.style.display = 'none';
    return;
  }

  const [lead, ...rest] = articles;
  leadRoot.innerHTML = topStoryCardHtml(lead, true);

  if (!rest.length) { editorialSection.style.display = 'none'; return; }
  r1.innerHTML = `<div class="stories-r1-col">${rest.slice(0, 3).map((a) => topStoryCardHtml(a, false)).join('')}</div>`;
  const r2Items = rest.slice(3, 6);
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
      ${a.coverImageUrl ? `<img loading="lazy" class="archive-item-thumb" src="${escapeHtml(a.coverImageUrl)}" alt="">` : ''}
      <span class="archive-item-content">
        <span class="archive-item-main">
          <span class="archive-item-cat">${escapeHtml(a.sport.name)}</span>
          <span class="archive-item-title">${escapeHtml(a.title)}</span>
        </span>
        <span class="archive-item-date">${formatDate(a.publishedAt)}</span>
      </span>
    </a>`).join('');
}

const FOLLOW_TYPE_LABEL = { club: 'Team', player: 'Player', competition: 'Competition' };

function followingChipHtml(f) {
  return `
    <a class="following-chip" href="${escapeHtml(f.href)}">
      <span class="following-chip-type">${escapeHtml(FOLLOW_TYPE_LABEL[f.type] || f.type)}</span>
      <span class="following-chip-name">${escapeHtml(f.name)}</span>
    </a>`;
}

// Synchronous, localStorage-only — no network call, so this runs directly
// rather than as one of the async loaders below.
function loadFollowing() {
  const follows = getFollows();
  const section = document.getElementById('following-section');
  if (!follows.length) { section.style.display = 'none'; return; }

  document.getElementById('following-list').innerHTML = follows.map(followingChipHtml).join('');
  section.style.display = '';
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

// WATCH — flagship episodes only (GET /api/shows/the-sportscast, added
// alongside the Show/Episode models). The 5 dormant niche shows stay
// unreferenced here too, same as nav/shows.html — this section isn't a
// second, inconsistent way back into them.
function watchCardHtml(ep) {
  const a = ep.article;
  const metaParts = [ep.episodeNumber ? `Episode ${ep.episodeNumber}` : null, ep.host, ep.guest].filter(Boolean);
  return `
    <a href="/article.html?slug=${encodeURIComponent(a.slug)}" style="display:contents;">
      <article class="story">
        ${a.coverImageUrl ? `<img loading="lazy" class="story-thumb" src="${escapeHtml(a.coverImageUrl)}" alt="">` : ''}
        <span class="story-cat">${escapeHtml(metaParts.join(' · ') || 'Episode')}</span>
        <h3 class="story-hl">${escapeHtml(a.title)}</h3>
        <p class="story-desc">${escapeHtml(a.dek)}</p>
        <div class="story-foot">
          <span class="story-author">${ep.durationSeconds ? `${Math.round(ep.durationSeconds / 60)} min` : ''}</span>
          <span class="story-time">${formatDate(a.publishedAt)}</span>
        </div>
      </article>
    </a>`;
}

async function loadWatchSection() {
  const section = document.getElementById('watch-section');
  const list = document.getElementById('watch-list');
  const res = await fetch('/api/shows/the-sportscast');
  if (!res.ok) { section.style.display = 'none'; return; }

  const { show } = await res.json();
  if (!show.episodes.length) { section.style.display = 'none'; return; }
  list.innerHTML = show.episodes.slice(0, 3).map(watchCardHtml).join('');
}

// LOCAL — Kenyan competitions specifically, grouped by sport. Client-side
// region filter rather than a new query param: /api/competitions has no
// region filter today, and the full list is small enough that fetching it
// once and filtering here isn't worth a backend change for.
function localGroupHtml(sportName, competitions) {
  return `
    <div class="local-group">
      <span class="local-group-sport">${escapeHtml(sportName)}</span>
      <div class="local-group-links">
        ${competitions.map((c) => `<a href="/competition.html?slug=${encodeURIComponent(c.slug)}">${escapeHtml(c.name)}</a>`).join('')}
      </div>
    </div>`;
}

async function loadLocalSection() {
  const section = document.getElementById('local-section');
  const list = document.getElementById('local-list');
  const { competitions } = await api('/api/competitions');
  const kenyan = competitions.filter((c) => c.region === 'KENYA');

  if (!kenyan.length) { section.style.display = 'none'; return; }

  const bySport = new Map();
  kenyan.forEach((c) => {
    if (!bySport.has(c.sport.name)) bySport.set(c.sport.name, []);
    bySport.get(c.sport.name).push(c);
  });
  list.innerHTML = Array.from(bySport, ([sportName, comps]) => localGroupHtml(sportName, comps)).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  loadLeadAndEditorial().catch((err) => console.warn('Could not load lead/editorial stories:', err));
  loadWhatsOn().catch((err) => console.warn('Could not load what\'s on:', err));
  loadWatchSection().catch((err) => console.warn('Could not load watch section:', err));
  loadLocalSection().catch((err) => console.warn('Could not load local competitions:', err));
  loadFollowing();
  loadNewsStrip().catch((err) => console.warn('Could not load news strip:', err));
  loadSportsTiles().catch((err) => console.warn('Could not load sports tiles:', err));

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
