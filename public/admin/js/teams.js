let allSports = [];
let allLeagues = [];

function kesFromCents(cents) {
  return (cents / 100).toFixed(0);
}

function kitRowHtml(kit) {
  return `
    <div class="kit-row-grid" data-kit-id="${kit.id}">
      <input type="text" value="${escapeHtml(kit.label)}" data-field="label" placeholder="Home / Away / Third">
      <input type="number" value="${kesFromCents(kit.priceKesCents)}" data-field="priceKes" placeholder="Price (KES)">
      <input type="text" value="${escapeHtml(kit.photoUrl || '')}" data-field="photoUrl" placeholder="Photo URL">
      <input type="text" value="${escapeHtml(kit.sizesAvailable || '')}" data-field="sizesAvailable" placeholder="S,M,L,XL">
      <span>
        <button type="button" class="btn-outline-sm save-kit-btn">Save</button>
        <button type="button" class="btn-outline-sm delete-kit-btn" style="color:var(--danger); border-color:var(--danger);">✕</button>
      </span>
    </div>`;
}

function teamBlockHtml(team) {
  return `
    <div class="card" style="margin-bottom:2.5rem; cursor:default;">
      <span class="card-eyebrow">${escapeHtml(team.sport.name)}${team.league ? ' · ' + escapeHtml(team.league.name) : ''}</span>
      <h3 class="card-title">${escapeHtml(team.name)}</h3>

      <div style="margin-top:1.5rem;">
        <span class="section-label" style="font-size:0.68rem;">Kits</span>
        <div id="kits-rows-${team.id}">
          ${team.kits.map(kitRowHtml).join('') || '<p class="empty-state" style="padding:0.5rem 0;">No kits yet.</p>'}
        </div>
        <div class="kit-row-grid" style="margin-top:0.75rem;">
          <input type="text" placeholder="Home / Away / Third" data-new-kit="label">
          <input type="number" placeholder="Price (KES)" data-new-kit="priceKes">
          <input type="text" placeholder="Photo URL" data-new-kit="photoUrl">
          <input type="text" placeholder="S,M,L,XL" data-new-kit="sizesAvailable">
          <button type="button" class="btn-outline-sm add-kit-btn" data-team-id="${team.id}">+ Add Kit</button>
        </div>
      </div>

      <div style="margin-top:1.5rem;">
        <button type="button" class="btn-outline-sm delete-team-btn" data-team-id="${team.id}" style="color:var(--danger); border-color:var(--danger);">Delete Team</button>
      </div>
    </div>`;
}

async function loadTeams() {
  const { teams } = await api('/api/shop/teams');
  const root = document.getElementById('teams-root');
  if (!teams.length) {
    root.innerHTML = '<p class="empty-state">No teams added yet — add one above to start building the shop catalog.</p>';
    return;
  }

  root.innerHTML = teams.map(teamBlockHtml).join('');

  root.querySelectorAll('.add-kit-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.kit-row-grid');
      const label = row.querySelector('[data-new-kit="label"]').value.trim();
      const priceKes = row.querySelector('[data-new-kit="priceKes"]').value;
      const photoUrl = row.querySelector('[data-new-kit="photoUrl"]').value.trim();
      const sizesAvailable = row.querySelector('[data-new-kit="sizesAvailable"]').value.trim();
      if (!label || !priceKes) return;
      await api(`/api/shop/teams/${btn.dataset.teamId}/kits`, {
        method: 'POST',
        body: JSON.stringify({ label, priceKesCents: Math.round(Number(priceKes) * 100), photoUrl, sizesAvailable }),
      });
      loadTeams();
    });
  });

  root.querySelectorAll('.save-kit-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-kit-id]');
      const kitId = row.dataset.kitId;
      const get = (f) => row.querySelector(`[data-field="${f}"]`).value.trim();
      await api(`/api/shop/kits/${kitId}`, {
        method: 'PUT',
        body: JSON.stringify({
          label: get('label'),
          priceKesCents: Math.round(Number(get('priceKes')) * 100),
          photoUrl: get('photoUrl'),
          sizesAvailable: get('sizesAvailable'),
        }),
      });
      loadTeams();
    });
  });

  root.querySelectorAll('.delete-kit-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const kitId = btn.closest('[data-kit-id]').dataset.kitId;
      if (!confirm('Delete this kit?')) return;
      await api(`/api/shop/kits/${kitId}`, { method: 'DELETE' });
      loadTeams();
    });
  });

  root.querySelectorAll('.delete-team-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this team and all its kits?')) return;
      await api(`/api/shop/teams/${btn.dataset.teamId}`, { method: 'DELETE' });
      loadTeams();
    });
  });
}

async function initTeamsPage() {
  const user = await requireLogin();
  if (!user) return;

  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('teams-app').style.display = 'block';

  const [{ sports }, { leagues }] = await Promise.all([api('/api/sports'), api('/api/leagues')]);
  allSports = sports;
  allLeagues = leagues;
  document.getElementById('team-sport').innerHTML = sports.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  document.getElementById('team-league').insertAdjacentHTML('beforeend', leagues.map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join(''));

  document.getElementById('add-team-btn').addEventListener('click', async () => {
    const name = document.getElementById('team-name').value.trim();
    const sportId = document.getElementById('team-sport').value;
    const leagueId = document.getElementById('team-league').value;
    const crestUrl = document.getElementById('team-crest').value.trim();
    if (!name || !sportId) return;
    await api('/api/shop/teams', { method: 'POST', body: JSON.stringify({ name, sportId, leagueId, crestUrl }) });
    document.getElementById('team-name').value = '';
    document.getElementById('team-crest').value = '';
    loadTeams();
  });

  loadTeams();
}

initTeamsPage();
