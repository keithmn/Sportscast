function kesFromCents(cents) {
  return Number(cents / 100).toLocaleString();
}

function kitTileHtml(kit) {
  return `
    <div class="kit-tile">
      ${kit.photoUrl
        ? `<img class="kit-tile-photo" src="${escapeHtml(kit.photoUrl)}" alt="${escapeHtml(kit.label)}" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'kit-tile-photo-empty', textContent:'Kit photo to be added'}))">`
        : `<div class="kit-tile-photo-empty">Kit photo to be added</div>`}
      <div class="kit-tile-label">${escapeHtml(kit.label)}</div>
      <div class="kit-tile-price">KES ${kesFromCents(kit.priceKesCents)}</div>
    </div>`;
}

function teamCardHtml(team) {
  return `
    <div class="card team-card" data-team-card data-slug="${escapeHtml(team.slug)}">
      ${team.crestUrl ? `<img class="team-crest" src="${escapeHtml(team.crestUrl)}" alt="" onerror="this.remove()">` : ''}
      <span class="card-eyebrow">${escapeHtml(team.sport.name)}</span>
      <h3 class="card-title">${escapeHtml(team.name)}</h3>
      <div class="kit-grid" data-kit-grid style="display:none;"></div>
    </div>`;
}

async function loadTeamKits(container, slug) {
  container.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const { team } = await api(`/api/shop/teams/${encodeURIComponent(slug)}`);
    container.innerHTML = team.kits.length
      ? team.kits.map(kitTileHtml).join('')
      : '<p class="empty-state">No kits added for this team yet.</p>';
  } catch (err) {
    container.innerHTML = `<p class="empty-state">Could not load kits: ${escapeHtml(err.message)}</p>`;
  }
}

function renderTeamGrid(panelEl, teams) {
  if (!teams.length) {
    panelEl.innerHTML = '<p class="empty-state">No teams added for this sport yet.</p>';
    return;
  }
  panelEl.innerHTML = `<div class="card-grid">${teams.map(teamCardHtml).join('')}</div>`;

  panelEl.querySelectorAll('[data-team-card]').forEach((card) => {
    card.addEventListener('click', () => {
      const grid = card.querySelector('[data-kit-grid]');
      const isOpen = grid.style.display !== 'none';
      if (isOpen) {
        grid.style.display = 'none';
        return;
      }
      grid.style.display = 'grid';
      if (!grid.dataset.loaded) {
        grid.dataset.loaded = 'true';
        loadTeamKits(grid, card.dataset.slug);
      }
    });
  });
}

async function loadShop() {
  const root = document.getElementById('shop-root');
  const { teams } = await api('/api/shop/teams');

  if (!teams.length) {
    root.innerHTML = '<p class="empty-state">No teams added to the shop yet.</p>';
    return;
  }

  const bySport = new Map();
  teams.forEach((t) => {
    if (!bySport.has(t.sport.slug)) bySport.set(t.sport.slug, { label: t.sport.name, teams: [] });
    bySport.get(t.sport.slug).teams.push(t);
  });
  const categories = Array.from(bySport, ([key, { label, teams }]) => ({ key, label, items: teams }));

  renderCategoryToggle({
    container: root,
    categories,
    renderItem: () => '', // the sport panel renders its own team grid via afterRender
    afterRender: (panelEl, category) => {
      renderTeamGrid(panelEl, category.items);
    },
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadShop().catch((err) => {
    document.getElementById('shop-root').innerHTML = `<div class="empty-state">Could not load the shop: ${escapeHtml(err.message)}</div>`;
  });
});
