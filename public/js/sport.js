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

async function loadSportPage() {
  const slug = qs('sport');
  const root = document.getElementById('sport-root');
  if (!slug) { root.innerHTML = '<div class="empty-state">No sport specified.</div>'; return; }

  const { sports } = await api('/api/sports');
  const sport = sports.find((s) => s.slug === slug);
  const sportName = sport ? sport.name : slug;

  document.title = `${sportName} — The Sportscast`;
  document.getElementById('sport-title').textContent = sportName;
  document.getElementById('sport-sub').textContent = `Stories and shows covering ${sportName} in Kenya.`;

  const { articles } = await api(`/api/articles?sport=${encodeURIComponent(slug)}&limit=24`);
  root.innerHTML = articles.length
    ? `<div class="card-grid">${articles.map(articleCardHtml).join('')}</div>`
    : '<p class="empty-state">No stories published yet for this sport.</p>';
}

document.addEventListener('DOMContentLoaded', () => {
  loadSportPage().catch((err) => {
    document.getElementById('sport-root').innerHTML = `<div class="empty-state">Could not load this page: ${escapeHtml(err.message)}</div>`;
  });
});
