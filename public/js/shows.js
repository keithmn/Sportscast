function nicheShowCardHtml(show) {
  return `
    <a class="niche-show-card" href="/show.html?slug=${encodeURIComponent(show.slug)}" style="--show-accent:${show.color};" data-video-series="${escapeHtml(show.videoSeries)}">
      ${show.coverImageUrl ? `<img class="niche-show-thumb" src="${escapeHtml(show.coverImageUrl)}" alt="" onerror="this.remove()">` : ''}
      <span class="niche-show-sport">${escapeHtml(show.sportLabel)}</span>
      <span class="niche-show-name">${escapeHtml(show.name)}</span>
      <span class="niche-show-tagline">${escapeHtml(show.tagline)}</span>
      <span class="niche-show-latest" data-latest-badge>Loading…</span>
    </a>`;
}

async function loadFlagshipCard() {
  const { articles } = await api('/api/articles?contentType=VIDEO_POST&videoSeries=' + encodeURIComponent('The Sportscast') + '&limit=1');
  if (!articles.length) return;
  const ep = articles[0];
  document.querySelector('#flagship-card .ep-tag').textContent = ep.episodeLabel || 'The Flagship Conversation';
  document.querySelector('#flagship-card .ep-title').textContent = ep.title;
  document.querySelector('#flagship-card .ep-desc').textContent = ep.dek;
  if (ep.coverImageUrl) document.querySelector('#flagship-card .ep-art-photo').src = ep.coverImageUrl;
}

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('niche-shows-grid');
  grid.innerHTML = SHOWS.filter((s) => s.kind === 'niche').map(nicheShowCardHtml).join('');
  loadFlagshipCard().catch((err) => console.warn('Could not load flagship episode:', err));
  loadLatestBadges(grid).catch((err) => console.warn('Could not load show badges:', err));
});
