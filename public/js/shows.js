// shows.html's bootstrap — "Watch." Simplified 2026-09-13: this used to be
// the flagship promo card plus a sport-category toggle over 5 niche shows
// (shows-data.js). Now there's one show, so this page is just the flagship
// promo plus its full episode list — no toggle, no niche-show cards.
// The 5 niche shows still work at their own /show.html?slug=... URL
// (js/show.js's legacy fallback), just not linked from here anymore.

async function loadFlagshipCard() {
  const { articles } = await api('/api/articles?contentType=VIDEO_POST&videoSeries=' + encodeURIComponent('The Sportscast') + '&limit=1');
  if (!articles.length) return;
  const ep = articles[0];
  document.querySelector('#flagship-card .ep-tag').textContent = ep.episodeLabel || 'The Flagship Conversation';
  document.querySelector('#flagship-card .ep-title').textContent = ep.title;
  document.querySelector('#flagship-card .ep-desc').textContent = ep.dek;
  if (ep.coverImageUrl) document.querySelector('#flagship-card .ep-art-photo').src = ep.coverImageUrl;
}

function episodeCardHtml(ep) {
  const a = ep.article;
  const metaParts = [ep.episodeNumber ? `Episode ${ep.episodeNumber}` : null, ep.host, ep.guest].filter(Boolean);
  return `
    <a href="/article.html?slug=${encodeURIComponent(a.slug)}" style="display:contents;">
      <article class="story">
        ${a.coverImageUrl ? `<img class="story-thumb" src="${escapeHtml(a.coverImageUrl)}" alt="">` : ''}
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

async function loadEpisodes() {
  const root = document.getElementById('episodes-root');
  const res = await fetch('/api/shows/the-sportscast');
  if (!res.ok) { root.innerHTML = '<p class="empty-state">No episodes published yet.</p>'; return; }
  const { show } = await res.json();
  root.innerHTML = show.episodes.length
    ? `<div class="card-grid">${show.episodes.map(episodeCardHtml).join('')}</div>`
    : '<p class="empty-state">No episodes published yet.</p>';
}

document.addEventListener('DOMContentLoaded', () => {
  loadFlagshipCard().catch((err) => console.warn('Could not load flagship episode:', err));
  loadEpisodes().catch((err) => console.warn('Could not load episodes:', err));
});
