function episodeRowHtml(ep) {
  return `
    <a href="/article.html?slug=${encodeURIComponent(ep.slug)}" style="display:contents;">
      <article class="story">
        ${ep.coverImageUrl ? `<img class="story-thumb" src="${escapeHtml(ep.coverImageUrl)}" alt="">` : ''}
        <span class="story-cat">${escapeHtml(ep.episodeLabel || 'Episode')}</span>
        <h3 class="story-hl">${escapeHtml(ep.title)}</h3>
        <p class="story-desc">${escapeHtml(ep.dek)}</p>
        <div class="story-foot">
          <span class="story-author">${escapeHtml(ep.runtimeLabel || '')}</span>
          <span class="story-time">${formatDate(ep.publishedAt)}</span>
        </div>
      </article>
    </a>`;
}

async function loadShowPage() {
  const slug = qs('slug');
  const root = document.getElementById('show-root');
  const show = getShowBySlug(slug);
  if (!show) { root.innerHTML = '<div class="empty-state">Show not found.</div>'; return; }

  document.title = `${show.name} — The Sportscast`;
  document.getElementById('show-header').style.setProperty('--show-accent', show.color);
  document.getElementById('show-sport').textContent = show.sportLabel;
  document.getElementById('show-title').textContent = show.name;
  document.getElementById('show-desc').textContent = show.description;
  if (show.coverImageUrl) {
    const photo = document.getElementById('show-header-photo');
    photo.src = show.coverImageUrl;
    photo.style.display = 'block';
    document.getElementById('og-image').setAttribute('content', show.coverImageUrl);
  }

  const { articles } = await api(`/api/articles?contentType=VIDEO_POST&videoSeries=${encodeURIComponent(show.videoSeries)}&limit=50`);
  root.innerHTML = articles.length
    ? `<span class="section-label">Episodes</span><div class="card-grid">${articles.map(episodeRowHtml).join('')}</div>`
    : '<p class="empty-state">No episodes published yet for this show.</p>';
}

document.addEventListener('DOMContentLoaded', () => {
  loadShowPage().catch((err) => {
    document.getElementById('show-root').innerHTML = `<div class="empty-state">Could not load this show: ${escapeHtml(err.message)}</div>`;
  });
});
