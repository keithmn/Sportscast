function clubCardHtml(club) {
  return `
    <a href="/club.html?slug=${encodeURIComponent(club.slug)}" style="display:contents;">
      <div class="card">
        ${club.crestUrl ? `<img class="team-crest" src="${escapeHtml(club.crestUrl)}" alt="" onerror="this.remove()">` : ''}
        <span class="card-eyebrow">${escapeHtml(club.league.name)}</span>
        <h3 class="card-title">${escapeHtml(club.name)}</h3>
      </div>
    </a>`;
}

// Sport is the top-level toggle (reusing category-toggle.js, same as
// Shows/Scores/Shop); within a sport, clubs are grouped by league with a
// plain label rather than a second full toggle level — most sports only
// have one or two leagues here, not enough to need another layer.
function renderClubsSportPanel(panelEl, sportClubs) {
  const byLeague = new Map();
  sportClubs.forEach((c) => {
    if (!byLeague.has(c.league.slug)) byLeague.set(c.league.slug, { name: c.league.name, clubs: [] });
    byLeague.get(c.league.slug).clubs.push(c);
  });

  panelEl.innerHTML = Array.from(byLeague.values()).map(({ name, clubs }) => `
    <div style="margin-bottom:2.5rem;">
      <span class="section-label">${escapeHtml(name)}</span>
      <div class="card-grid">${clubs.map(clubCardHtml).join('')}</div>
    </div>`).join('');
}

async function loadClubs() {
  const root = document.getElementById('clubs-root');
  const { clubs } = await api('/api/clubs');

  if (!clubs.length) {
    root.innerHTML = '<p class="empty-state">No clubs added yet.</p>';
    return;
  }

  const bySport = new Map();
  clubs.forEach((c) => {
    const sport = c.league.sport;
    if (!bySport.has(sport.slug)) bySport.set(sport.slug, { label: sport.name, clubs: [] });
    bySport.get(sport.slug).clubs.push(c);
  });
  const categories = Array.from(bySport, ([key, { label, clubs }]) => ({ key, label, items: clubs }));

  renderCategoryToggle({
    container: root,
    categories,
    renderItem: () => '',
    afterRender: (panelEl, category) => renderClubsSportPanel(panelEl, category.items),
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('clubs-root')) return;
  loadClubs().catch((err) => {
    document.getElementById('clubs-root').innerHTML = `<div class="empty-state">Could not load clubs: ${escapeHtml(err.message)}</div>`;
  });
});
