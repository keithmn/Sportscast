// player.html's bootstrap. A player isn't a competition-scoped entity — no
// Scores/Fixtures/Tables of its own — so this deliberately does NOT reuse
// subnav.js's tab-bar machinery (that would force a nonsensical Tables tab
// onto a page with nothing to show there). Simple, single-scroll layout:
// a profile header (reusing the same .profile-header/.profile-badge
// classes club.js's Kenyan club profile already uses) plus a News &
// Podcasts feed of whatever's tagged to this player via Article.playerId.
// Only reached from a Kenyan club's own page — player.html has no
// standalone "browse all players" entry point, same as club profiles.

async function loadPlayer() {
  const root = document.getElementById('player-root');
  const slug = qs('slug');
  if (!slug) {
    root.innerHTML = '<p class="empty-state">No player specified.</p>';
    return;
  }

  const { player } = await api(`/api/clubs/players/${encodeURIComponent(slug)}`);
  document.title = `${player.name} — The Sportscast`;

  const metaParts = [
    player.position,
    player.nationality,
    player.age ? `${player.age} yrs` : null,
  ].filter(Boolean);

  root.innerHTML = `
    <div class="profile-header">
      <div class="profile-badge">
        ${player.photoUrl ? `<img loading="lazy" src="${escapeHtml(player.photoUrl)}" alt="" onerror="this.parentElement.textContent='${escapeHtml(player.name).charAt(0)}'">` : escapeHtml(player.name).charAt(0)}
      </div>
      <div>
        <span class="card-eyebrow">${escapeHtml(player.club.competition.sport.name)}</span>
        <h1 class="profile-name">${escapeHtml(player.name)}</h1>
        <p class="profile-meta">
          ${metaParts.map(escapeHtml).join(' · ')}${metaParts.length ? ' · ' : ''}Plays for
          <a href="/club.html?slug=${encodeURIComponent(player.club.slug)}">${escapeHtml(player.club.name)}</a>
        </p>
      </div>
      <div style="margin-left:auto;">${followButtonHtml('player', player.slug, player.name, `/player.html?slug=${encodeURIComponent(player.slug)}`)}</div>
    </div>
    <div style="max-width:900px; margin:0 auto; padding:2rem 0 4rem;" id="player-articles">
      <span class="section-label">News &amp; Podcasts</span>
      <div class="empty-state">Loading…</div>
    </div>`;

  const { articles } = await api(`/api/articles?player=${encodeURIComponent(slug)}`);
  const articlesEl = document.getElementById('player-articles');
  articlesEl.innerHTML = `
    <span class="section-label">News &amp; Podcasts</span>
    ${articles.length
      ? `<div class="card-grid">${articles.map(articleCardHtml).join('')}</div>`
      : `<p class="empty-state">No stories tagged to ${escapeHtml(player.name)} yet.</p>`}`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadPlayer().catch((err) => {
    document.getElementById('player-root').innerHTML = `<div class="empty-state">Could not load this player: ${escapeHtml(err.message)}</div>`;
  });
});
