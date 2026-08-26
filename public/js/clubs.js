function clubCardHtml(club) {
  return `
    <a href="/club.html?slug=${encodeURIComponent(club.slug)}" style="display:contents;">
      <div class="card">
        ${club.crestUrl ? `<img class="team-crest" src="${escapeHtml(club.crestUrl)}" alt="" onerror="this.remove()">` : ''}
        <span class="card-eyebrow">${escapeHtml(club.competition.name)}</span>
        <h3 class="card-title">${escapeHtml(club.name)}</h3>
      </div>
    </a>`;
}

async function loadClubs() {
  const root = document.getElementById('clubs-root');
  const { clubs: allClubs } = await api('/api/clubs');

  // Jurisdictional policy: the Teams/Clubs browsing page is strictly
  // Kenyan teams, never Global ones — Arsenal/Bayern/etc. have Club rows
  // (for competition-page context, e.g. a Premier League fixture's Teams
  // tab) but don't belong in a general "browse teams" surface.
  const clubs = allClubs.filter((c) => c.competition.region === 'KENYA');

  if (!clubs.length) {
    root.innerHTML = '<p class="empty-state">No clubs added yet.</p>';
    return;
  }

  const bySport = new Map();
  clubs.forEach((c) => {
    const sport = c.competition.sport;
    if (!bySport.has(sport.slug)) bySport.set(sport.slug, { label: sport.name, clubs: [] });
    bySport.get(sport.slug).clubs.push(c);
  });
  const categories = Array.from(bySport, ([key, { label, clubs }]) => ({ key, label, items: clubs }));

  renderCategoryToggle({
    container: root,
    categories,
    renderItem: () => '',
    afterRender: (panelEl, category) => renderCompetitionCategorizedGrid(
      panelEl, category.items, (c) => c.competition, clubCardHtml, 'No teams added yet for this sport.',
    ),
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('clubs-root')) return;
  loadClubs().catch((err) => {
    document.getElementById('clubs-root').innerHTML = `<div class="empty-state">Could not load clubs: ${escapeHtml(err.message)}</div>`;
  });
});
