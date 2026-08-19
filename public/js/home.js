// Populates the homepage's flagship episode and the small "Latest" news
// strip with live data from the API. If the request fails, the static
// markup already in index.html stays put as a fallback.

function episodeCardHtml(ep) {
  const coverUrl = ep.coverImageUrl || '/images/shows/the-sportscast.jpg';
  return `
    <div class="episode-card">
      <div class="ep-art" aria-label="${escapeHtml(ep.title)} cover art">
        <img class="ep-art-photo" src="${escapeHtml(coverUrl)}" alt="" onerror="this.style.display='none'">
        <div class="ep-art-inner">
          <span class="a1">THE SPORTSCAST</span>
          <span class="ep-art-line"></span>
          <span class="a2">by Underdawgs</span>
        </div>
      </div>
      <div class="ep-info">
        <span class="ep-tag">${escapeHtml(ep.episodeLabel || 'The Flagship Conversation')}</span>
        <h2 class="ep-title">${escapeHtml(ep.title)}</h2>
        <p class="ep-guest">${escapeHtml(ep.dek)}</p>
        <p class="ep-desc">${escapeHtml(ep.body)}</p>
        <p class="ep-meta">${escapeHtml(ep.runtimeLabel || '')}${ep.runtimeLabel ? ' &nbsp;·&nbsp; ' : ''}The Flagship Conversation</p>
        <div class="ep-actions">
          <a href="/article.html?slug=${encodeURIComponent(ep.slug)}" class="btn-red">Watch Now</a>
        </div>
      </div>
    </div>`;
}

// Up to 4 recent flagship episodes in a scroll-snap carousel — plain CSS +
// manual scrollTo, no carousel library, consistent with the rest of the
// site's no-build-step approach. Degrades fine with 1-3 episodes too.
async function loadFlagshipCarousel() {
  const { articles } = await api('/api/articles?contentType=VIDEO_POST&videoSeries=' + encodeURIComponent('The Sportscast') + '&limit=4');
  if (!articles.length) return;
  const carousel = document.getElementById('episode-carousel');
  carousel.innerHTML = articles.map(episodeCardHtml).join('');
  setupCarousel(articles.length);
}

function setupCarousel(count) {
  const carousel = document.getElementById('episode-carousel');
  const dotsEl = document.getElementById('carousel-dots');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');

  if (count <= 1) {
    dotsEl.innerHTML = '';
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    return;
  }

  dotsEl.innerHTML = Array.from({ length: count }, (_, i) =>
    `<button class="carousel-dot${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Go to episode ${i + 1}"></button>`).join('');

  const currentIndex = () => Math.round(carousel.scrollLeft / carousel.clientWidth);

  function scrollToIndex(i) {
    const slide = carousel.children[i];
    if (slide) carousel.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
  }

  function updateActiveDot() {
    const idx = currentIndex();
    dotsEl.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  }

  prevBtn.addEventListener('click', () => scrollToIndex(Math.max(0, currentIndex() - 1)));
  nextBtn.addEventListener('click', () => scrollToIndex(Math.min(count - 1, currentIndex() + 1)));
  dotsEl.querySelectorAll('.carousel-dot').forEach((d) => {
    d.addEventListener('click', () => scrollToIndex(parseInt(d.dataset.index, 10)));
  });

  let scrollTimeout;
  carousel.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(updateActiveDot, 100);
  });
}

// Top Stories — reopens BLUEPRINT §11's brief-only boundary deliberately
// (2026-08-19, see §21): featured/full stories first, falling back to the
// most recent full stories if nothing's flagged featured yet. Big lead
// item + 2 alongside it + up to 3 more in a row below, matching the
// dormant .stories-r1/.stories-r2/.story--lg layout in index.html.
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

// Small, honest, football-only — matches the News strip's restraint rather
// than becoming a full standings table. Degrades gracefully to an empty
// state if no standings have been entered yet (see admin/scores.html).
// 2026-08-19: extended to also show a few upcoming fixtures alongside
// standings, reusing the same .archive-item row shape.
async function loadScoresTeaser() {
  const root = document.getElementById('scores-teaser-root');
  const { leagues } = await api('/api/leagues');
  if (!leagues.length) { root.innerHTML = '<p class="empty-state">No leagues added yet.</p>'; return; }

  const { league } = await api(`/api/leagues/${encodeURIComponent(leagues[0].slug)}`);
  const top3 = league.standings.slice(0, 3);
  const upcoming = league.fixtures.filter((f) => f.status === 'SCHEDULED').slice(0, 3);

  const standingsHtml = top3.length
    ? top3.map((r) => `
      <a href="/scores.html" class="archive-item">
        <span class="archive-item-content">
          <span class="archive-item-main">
            <span class="archive-item-cat">#${r.position}</span>
            <span class="archive-item-title">${escapeHtml(r.teamName)}</span>
          </span>
          <span class="archive-item-date">${r.points} pts</span>
        </span>
      </a>`).join('')
    : '<p class="empty-state">Standings haven\'t been entered yet — check back soon.</p>';

  const fixturesHtml = upcoming.map((f) => `
    <a href="/scores.html" class="archive-item">
      <span class="archive-item-content">
        <span class="archive-item-main">
          <span class="archive-item-cat">Upcoming</span>
          <span class="archive-item-title">${escapeHtml(f.homeTeam)} vs ${escapeHtml(f.awayTeam)}</span>
        </span>
        <span class="archive-item-date">${formatDate(f.kickoff)}</span>
      </span>
    </a>`).join('');

  root.innerHTML = standingsHtml + fixturesHtml;
}

// Teams rail (2026-08-19) — surfaces the Clubs & Players data (shipped
// 2026-08-19) that had no homepage presence yet. Football-only for now,
// same reasoning as the Scores teaser above.
async function loadClubsTeaser() {
  const root = document.getElementById('clubs-teaser-root');
  const { clubs } = await api('/api/clubs');
  const footballClubs = clubs.filter((c) => c.league.sport.slug === 'football').slice(0, 4);

  root.innerHTML = footballClubs.length
    ? footballClubs.map((c) => `
      <a href="/sport.html?sport=football&tab=clubs" style="display:contents;">
        <div class="card">
          ${c.crestUrl ? `<img class="team-crest" src="${escapeHtml(c.crestUrl)}" alt="" onerror="this.remove()">` : ''}
          <span class="card-eyebrow">${escapeHtml(c.league.name)}</span>
          <h3 class="card-title">${escapeHtml(c.name)}</h3>
        </div>
      </a>`).join('')
    : '<p class="empty-state">No teams added yet.</p>';
}

// initShopPromoForm()/initContactForm()/CONTACT_TAB_COPY removed 2026-08-19
// — the homepage Shop band now just links to the live /shop.html (no more
// waitlist form), and Contact/Tip/Partnership lives in the shared footer.

document.addEventListener('DOMContentLoaded', () => {
  loadFlagshipCarousel().catch((err) => console.warn('Could not load flagship carousel:', err));
  loadTopStories().catch((err) => console.warn('Could not load top stories:', err));
  loadNewsStrip().catch((err) => console.warn('Could not load news strip:', err));
  loadScoresTeaser().catch((err) => console.warn('Could not load scores teaser:', err));
  loadClubsTeaser().catch((err) => console.warn('Could not load teams teaser:', err));
  const nicheGrid = document.getElementById('niche-shows-grid');
  if (nicheGrid) loadLatestBadges(nicheGrid).catch((err) => console.warn('Could not load show badges:', err));

  // index.html builds its own richer nav inline (fixed + scroll-state,
  // see #main-nav) rather than going through site.js's renderNav(), so
  // its Sports/Scores/Kits dropdowns need wiring here instead.
  const mainNavLinks = document.querySelector('#main-nav .nav-links');
  if (mainNavLinks) {
    wireNavDropdownToggles(mainNavLinks);
    loadNavDropdowns(mainNavLinks, { sports: null, scores: 'scores' })
      .catch((err) => console.warn('Could not load nav dropdowns:', err));
  }
});
