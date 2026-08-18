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

// Sport-category toggle over the 5 niche shows — the flagship stays a
// separate, always-visible card above this (see loadFlagshipCard), never
// part of the toggle. Each niche show's own sportLabel becomes its
// category; today that's a 1:1 mapping (one show per sport/bundle), but
// nothing here assumes that stays true if a sport ever gets a second show.
function nicheShowCategories() {
  const niche = SHOWS.filter((s) => s.kind === 'niche');
  const bySport = new Map();
  niche.forEach((show) => {
    if (!bySport.has(show.sportLabel)) bySport.set(show.sportLabel, []);
    bySport.get(show.sportLabel).push(show);
  });
  return Array.from(bySport, ([label, items]) => ({ key: items[0].slug, label, items }));
}

document.addEventListener('DOMContentLoaded', () => {
  renderCategoryToggle({
    container: document.getElementById('niche-shows-toggle'),
    categories: nicheShowCategories(),
    renderItem: nicheShowCardHtml,
    afterRender: (panelEl) => {
      if (panelEl) loadLatestBadges(panelEl).catch((err) => console.warn('Could not load show badges:', err));
    },
  });
  loadFlagshipCard().catch((err) => console.warn('Could not load flagship episode:', err));
});
