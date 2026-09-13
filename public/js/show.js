// show.html's bootstrap. Two paths, tried in order:
//
// 1. DB-backed (Show/Season/Episode — added 2026-09-13): the flagship
//    show now has a real record. If the requested slug matches one,
//    render from there — richer data (episode number, host, guest) where
//    an editor has entered it.
// 2. Legacy (shows-data.js + Article.videoSeries string match): the 5
//    niche shows (The Hydration Break, The Ruck, Bully Off, Fast Break,
//    The Circuit) were deliberately NOT migrated — they're unreferenced
//    from nav/shows.html now, but this fallback keeps their URLs working
//    exactly as before if anyone still has one bookmarked/linked.
//    Dormant, not deleted.

function dbEpisodeRowHtml(ep) {
  const a = ep.article;
  const metaParts = [
    ep.episodeNumber ? `Episode ${ep.episodeNumber}` : null,
    ep.host,
    ep.guest,
  ].filter(Boolean);
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

async function renderFromDb(show) {
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

  const root = document.getElementById('show-root');
  root.innerHTML = show.episodes.length
    ? `<span class="section-label">Episodes</span><div class="card-grid">${show.episodes.map(dbEpisodeRowHtml).join('')}</div>`
    : '<p class="empty-state">No episodes published yet for this show.</p>';
}

// --- legacy path, unchanged from before the Show model existed ---
function legacyEpisodeRowHtml(ep) {
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

async function renderFromLegacy(slug) {
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
    ? `<span class="section-label">Episodes</span><div class="card-grid">${articles.map(legacyEpisodeRowHtml).join('')}</div>`
    : '<p class="empty-state">No episodes published yet for this show.</p>';
}

async function loadShowPage() {
  const slug = qs('slug');
  if (!slug) { document.getElementById('show-root').innerHTML = '<div class="empty-state">Show not found.</div>'; return; }

  const res = await fetch(`/api/shows/${encodeURIComponent(slug)}`);
  if (res.ok) {
    const { show } = await res.json();
    return renderFromDb(show);
  }
  return renderFromLegacy(slug);
}

document.addEventListener('DOMContentLoaded', () => {
  loadShowPage().catch((err) => {
    document.getElementById('show-root').innerHTML = `<div class="empty-state">Could not load this show: ${escapeHtml(err.message)}</div>`;
  });
});
