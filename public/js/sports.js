function sportCardHtml(sport) {
  return `
    <a href="/sport.html?sport=${encodeURIComponent(sport.slug)}" style="display:contents;">
      <div class="card">
        <h3 class="card-title">${escapeHtml(sport.name)}</h3>
      </div>
    </a>`;
}

async function loadSports() {
  const root = document.getElementById('sports-root');
  const { sports } = await api('/api/sports');
  const activeSports = sports.filter((s) => s.isActive);

  root.innerHTML = activeSports.length
    ? `<div class="card-grid">${activeSports.map(sportCardHtml).join('')}</div>`
    : '<p class="empty-state">No sports are live yet — check back soon.</p>';
}

document.addEventListener('DOMContentLoaded', () => {
  loadSports().catch((err) => {
    document.getElementById('sports-root').innerHTML = `<div class="empty-state">Could not load sports: ${escapeHtml(err.message)}</div>`;
  });
});
