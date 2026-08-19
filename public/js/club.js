function playerCardHtml(p) {
  return `
    <div class="player-card">
      ${p.photoUrl
        ? `<img class="player-photo" src="${escapeHtml(p.photoUrl)}" alt="${escapeHtml(p.name)}" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'player-photo-empty', textContent:'No photo'}))">`
        : `<div class="player-photo-empty">No photo</div>`}
      <div class="player-name">${escapeHtml(p.name)}</div>
      <div class="player-meta">${escapeHtml(p.position || '')}${p.position && p.nationality ? ' · ' : ''}${escapeHtml(p.nationality || '')}</div>
    </div>`;
}

// Kits nested here (2026-08-19) rather than as a separate top-level
// section — Club (roster) and the shop's Team (merch) are still two
// unlinked models, so this is a best-effort match by name within the
// same sport, not a real foreign key. Silently omitted, not an empty
// state, when no matching merch entry exists — most clubs won't have one
// yet, and that shouldn't read as "kits are missing," just "not here."
function clubKitTileHtml(kit) {
  return `
    <div class="kit-tile">
      ${kit.photoUrl
        ? `<img class="kit-tile-photo" src="${escapeHtml(kit.photoUrl)}" alt="${escapeHtml(kit.label)}" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'kit-tile-photo-empty', textContent:'Kit photo to be added'}))">`
        : `<div class="kit-tile-photo-empty">Kit photo to be added</div>`}
      <div class="kit-tile-label">${escapeHtml(kit.label)}</div>
    </div>`;
}

async function findMatchingKits(club) {
  try {
    const { teams } = await api(`/api/shop/teams?sport=${encodeURIComponent(club.league.sport.slug)}`);
    const match = teams.find((t) => t.name.toLowerCase() === club.name.toLowerCase());
    return match ? match.kits : [];
  } catch (err) {
    return [];
  }
}

async function loadClub() {
  const root = document.getElementById('club-root');
  const slug = qs('slug');
  if (!slug) {
    root.innerHTML = '<p class="empty-state">No club specified.</p>';
    return;
  }

  const { club } = await api(`/api/clubs/${encodeURIComponent(slug)}`);
  document.title = `${club.name} — The Sportscast`;
  const kits = await findMatchingKits(club);

  root.innerHTML = `
    <div class="article-header" style="max-width:900px; display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap;">
      ${club.crestUrl ? `<img src="${escapeHtml(club.crestUrl)}" alt="" style="width:72px; height:72px; object-fit:contain;" onerror="this.remove()">` : ''}
      <div>
        <span class="card-eyebrow">${escapeHtml(club.league.sport.name)} · ${escapeHtml(club.league.name)}</span>
        <h1 class="page-title" style="font-size:2rem;">${escapeHtml(club.name)}</h1>
        ${club.venue ? `<p class="page-sub">${escapeHtml(club.venue)}</p>` : ''}
      </div>
    </div>
    <div style="max-width:900px; margin:0 auto; padding:2rem 0 4rem;">
      <span class="section-label">Squad</span>
      ${club.players.length
        ? `<div class="player-grid">${club.players.map(playerCardHtml).join('')}</div>`
        : `<p class="empty-state">${club.source === 'API' ? 'No current squad data available yet for this club.' : 'No players added yet.'}</p>`}
      ${club.source === 'API' ? '<p class="empty-state" style="margin-top:1.5rem;">Squad sourced from Wikidata\'s public records — reliably current where shown, but not guaranteed to list every player on the books.</p>' : ''}

      ${kits.length ? `
        <div style="margin-top:3rem;">
          <span class="section-label">Kits</span>
          <div class="kit-grid">${kits.map(clubKitTileHtml).join('')}</div>
        </div>` : ''}
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadClub().catch((err) => {
    document.getElementById('club-root').innerHTML = `<div class="empty-state">Could not load this club: ${escapeHtml(err.message)}</div>`;
  });
});
