// "Latest" — compact, dense, timestamp-forward. No images, no dek — this is
// the fast lane, scanned in a few seconds, not read.
function latestRowHtml(a) {
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

// "Stories" — richer, image-forward cards. Deliberately visually distinct
// from the Latest strip above so the two speeds of content don't blur into
// one undifferentiated list.
function storyCardHtml(a) {
  return `
    <a href="/article.html?slug=${encodeURIComponent(a.slug)}" style="display:contents;">
      <article class="story">
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

async function loadLatest(sportSlug) {
  const root = document.getElementById('latest-root');
  root.innerHTML = '<div class="empty-state">Loading…</div>';
  const query = sportSlug ? `&sport=${encodeURIComponent(sportSlug)}` : '';
  const { articles } = await api(`/api/articles?isBrief=true&limit=20${query}`);
  root.innerHTML = articles.length
    ? articles.map(latestRowHtml).join('')
    : '<p class="empty-state">No news briefs yet for this sport.</p>';
}

async function loadStories(sportSlug) {
  const root = document.getElementById('stories-root');
  root.innerHTML = '<div class="empty-state">Loading…</div>';
  const query = sportSlug ? `&sport=${encodeURIComponent(sportSlug)}` : '';
  const { articles } = await api(`/api/articles?contentType=ARTICLE&isBrief=false&limit=100${query}`);
  root.innerHTML = articles.length
    ? articles.map(storyCardHtml).join('')
    : '<p class="empty-state">No stories yet for this sport.</p>';
}

function loadBoth(sportSlug) {
  loadLatest(sportSlug).catch((err) => console.warn('Could not load latest:', err));
  loadStories(sportSlug).catch((err) => console.warn('Could not load stories:', err));
}

async function loadFilters() {
  const { sports } = await api('/api/sports');
  const el = document.getElementById('news-filters');
  el.innerHTML = [`<button class="filter-pill active" data-sport="">All</button>`]
    .concat(sports.map((s) => `<button class="filter-pill" data-sport="${escapeHtml(s.slug)}">${escapeHtml(s.name)}</button>`))
    .join('');

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    el.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    loadBoth(btn.dataset.sport);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadFilters().catch((err) => console.warn('Could not load sport filters:', err));
  loadBoth();
});
