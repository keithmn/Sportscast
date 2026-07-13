async function loadArticle() {
  const slug = qs('slug');
  const root = document.getElementById('article-root');
  if (!slug) {
    root.innerHTML = '<div class="empty-state">No article specified.</div>';
    return;
  }

  let article;
  try {
    ({ article } = await api(`/api/articles/${encodeURIComponent(slug)}`));
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Article not found.</div>`;
    return;
  }

  document.title = `${article.title} — The Sportscast`;
  if (article.coverImageUrl) document.getElementById('og-image').setAttribute('content', article.coverImageUrl);

  const bodyHtml = article.body
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para)}</p>`)
    .join('');

  const videoHtml = article.contentType === 'VIDEO_POST' && article.youtubeId
    ? `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(article.youtubeId)}" title="${escapeHtml(article.title)}" allowfullscreen></iframe></div>`
    : '';

  const coverHtml = !videoHtml && article.coverImageUrl
    ? `<img class="article-cover" src="${escapeHtml(article.coverImageUrl)}" alt="${escapeHtml(article.title)}">`
    : '';

  root.innerHTML = `
    <div class="article-header">
      <span class="section-label">${escapeHtml(article.sport.name)}${article.videoSeries ? ' · ' + escapeHtml(article.videoSeries) : ''}</span>
      <h1 class="page-title" style="font-size: var(--text-display);">${escapeHtml(article.title)}</h1>
      <p class="page-sub">${escapeHtml(article.dek)}</p>
      <div class="story-foot" style="border-top:none; margin-top:1rem; padding-top:0;">
        <span class="story-author">${escapeHtml(article.author.name)}</span>
        <span class="story-dot">·</span>
        <span class="story-time">${formatDate(article.publishedAt)}</span>
        <span class="story-dot">·</span>
        <span class="story-time">${readTime(article.body)} min read</span>
      </div>
    </div>
    <div class="article-body">
      ${videoHtml}
      ${coverHtml}
      ${bodyHtml}
      ${article.tags && article.tags.length ? `<p class="source-note">Tagged: ${article.tags.map((t) => escapeHtml(t.name)).join(', ')}</p>` : ''}
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadArticle();
});
