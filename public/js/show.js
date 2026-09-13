// show.html's bootstrap. The flagship is the only show left (the 5 niche
// shows — The Hydration Break, The Ruck, Bully Off, Fast Break, The
// Circuit — and their content were removed 2026-09-13, not just
// unreferenced; see BLUEPRINT.md), so this is DB-backed only now — no
// legacy Article.videoSeries fallback path.

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

async function loadShowPage() {
  const slug = qs('slug');
  if (!slug) { document.getElementById('show-root').innerHTML = '<div class="empty-state">Show not found.</div>'; return; }

  const res = await fetch(`/api/shows/${encodeURIComponent(slug)}`);
  if (!res.ok) { document.getElementById('show-root').innerHTML = '<div class="empty-state">Show not found.</div>'; return; }
  const { show } = await res.json();
  return renderFromDb(show);
}

document.addEventListener('DOMContentLoaded', () => {
  loadShowPage().catch((err) => {
    document.getElementById('show-root').innerHTML = `<div class="empty-state">Could not load this show: ${escapeHtml(err.message)}</div>`;
  });
});
