function sportCardHtml(sport) {
  return `
    <a href="/sport.html?sport=${encodeURIComponent(sport.slug)}" style="display:contents;">
      <div class="card">
        <h3 class="card-title">${escapeHtml(sport.name)}</h3>
      </div>
    </a>`;
}

// "Other" bundles every sport not yet split into its own page (see
// other.js) — always shown alongside whichever sports are active.
const OTHER_CARD_HTML = `
  <a href="/other.html" style="display:contents;">
    <div class="card">
      <h3 class="card-title">Other Sports</h3>
    </div>
  </a>`;

async function loadSports() {
  const root = document.getElementById('sports-root');
  const { sports } = await api('/api/sports');
  const activeSports = sports.filter((s) => s.isActive);

  root.innerHTML = `<div class="card-grid">${activeSports.map(sportCardHtml).join('')}${OTHER_CARD_HTML}</div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadSports().catch((err) => {
    document.getElementById('sports-root').innerHTML = `<div class="empty-state">Could not load sports: ${escapeHtml(err.message)}</div>`;
  });
});
