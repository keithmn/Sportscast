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
async function loadScoresTeaser() {
  const root = document.getElementById('scores-teaser-root');
  const { leagues } = await api('/api/leagues');
  if (!leagues.length) { root.innerHTML = '<p class="empty-state">No leagues added yet.</p>'; return; }

  const { league } = await api(`/api/leagues/${encodeURIComponent(leagues[0].slug)}`);
  const top3 = league.standings.slice(0, 3);
  root.innerHTML = top3.length
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
}

// initShopPromoForm()/initContactForm()/CONTACT_TAB_COPY removed 2026-08-19
// — the homepage Shop band now just links to the live /shop.html (no more
// waitlist form), and Contact/Tip/Partnership lives in the shared footer.

document.addEventListener('DOMContentLoaded', () => {
  loadFlagshipCarousel().catch((err) => console.warn('Could not load flagship carousel:', err));
  loadNewsStrip().catch((err) => console.warn('Could not load news strip:', err));
  loadScoresTeaser().catch((err) => console.warn('Could not load scores teaser:', err));
  const nicheGrid = document.getElementById('niche-shows-grid');
  if (nicheGrid) loadLatestBadges(nicheGrid).catch((err) => console.warn('Could not load show badges:', err));
});
