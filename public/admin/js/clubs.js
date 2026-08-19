let allLeagues = [];

function playerRowHtml(p) {
  return `
    <div class="player-row-grid" data-player-id="${p.id}">
      <input type="text" value="${escapeHtml(p.name)}" data-field="name" placeholder="Player name">
      <input type="text" value="${escapeHtml(p.position || '')}" data-field="position" placeholder="Position">
      <input type="text" value="${escapeHtml(p.nationality || '')}" data-field="nationality" placeholder="Nationality">
      <input type="number" value="${p.age ?? ''}" data-field="age" placeholder="Age">
      <input type="text" value="${escapeHtml(p.photoUrl || '')}" data-field="photoUrl" placeholder="Photo URL">
      <span>
        <button type="button" class="btn-outline-sm save-player-btn">Save</button>
        <button type="button" class="btn-outline-sm delete-player-btn" style="color:var(--danger); border-color:var(--danger);">✕</button>
      </span>
    </div>`;
}

function clubBlockHtml(club) {
  const sourceTag = club.source === 'API'
    ? `<span class="status-badge" style="margin-left:0.5rem;">Wikidata · synced ${club.lastSyncedAt ? formatDate(club.lastSyncedAt) : 'never'}</span>`
    : '';
  return `
    <div class="card" style="margin-bottom:2.5rem; cursor:default;">
      <span class="card-eyebrow">${escapeHtml(club.league.sport.name)} · ${escapeHtml(club.league.name)}</span>
      <h3 class="card-title">${escapeHtml(club.name)}${sourceTag}</h3>

      <div style="margin-top:1.25rem;">
        <span class="section-label" style="font-size:0.68rem;">Players</span>
        <div id="players-rows-${club.id}">
          ${club.players.map(playerRowHtml).join('') || '<p class="empty-state" style="padding:0.5rem 0;">No players yet.</p>'}
        </div>
        ${club.source === 'MANUAL' ? `
          <div class="player-row-grid" style="margin-top:0.75rem;">
            <input type="text" placeholder="Player name" data-new-player="name">
            <input type="text" placeholder="Position" data-new-player="position">
            <input type="text" placeholder="Nationality" data-new-player="nationality">
            <input type="number" placeholder="Age" data-new-player="age">
            <input type="text" placeholder="Photo URL" data-new-player="photoUrl">
            <button type="button" class="btn-outline-sm add-player-btn" data-club-id="${club.id}">+ Add Player</button>
          </div>` : '<p class="empty-state" style="padding:0.5rem 0;">Synced from Wikidata — edits here won\'t stick past the next sync.</p>'}
      </div>

      ${club.source === 'MANUAL' ? `
        <div style="margin-top:1.25rem;">
          <button type="button" class="btn-outline-sm delete-club-btn" data-club-id="${club.id}" style="color:var(--danger); border-color:var(--danger);">Delete Club</button>
        </div>` : ''}
    </div>`;
}

async function loadClubs() {
  const { clubs } = await api('/api/clubs');
  const root = document.getElementById('clubs-root');
  if (!clubs.length) {
    root.innerHTML = '<p class="empty-state">No clubs added yet — add one above, or enable squad sync for a league on the Scores &amp; Fixtures page.</p>';
    return;
  }

  const fullClubs = await Promise.all(clubs.map((c) => api(`/api/clubs/${c.slug}`).then((r) => r.club)));
  root.innerHTML = fullClubs.map(clubBlockHtml).join('');

  root.querySelectorAll('.add-player-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.player-row-grid');
      const get = (f) => row.querySelector(`[data-new-player="${f}"]`).value.trim();
      const name = get('name');
      if (!name) return;
      await api(`/api/clubs/${btn.dataset.clubId}/players`, {
        method: 'POST',
        body: JSON.stringify({ name, position: get('position'), nationality: get('nationality'), age: get('age'), photoUrl: get('photoUrl') }),
      });
      loadClubs();
    });
  });

  root.querySelectorAll('.save-player-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-player-id]');
      const get = (f) => row.querySelector(`[data-field="${f}"]`).value.trim();
      await api(`/api/clubs/players/${row.dataset.playerId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: get('name'), position: get('position'), nationality: get('nationality'), age: get('age'), photoUrl: get('photoUrl') }),
      });
      loadClubs();
    });
  });

  root.querySelectorAll('.delete-player-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this player?')) return;
      await api(`/api/clubs/players/${btn.closest('[data-player-id]').dataset.playerId}`, { method: 'DELETE' });
      loadClubs();
    });
  });

  root.querySelectorAll('.delete-club-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this club and all its players?')) return;
      await api(`/api/clubs/${btn.dataset.clubId}`, { method: 'DELETE' });
      loadClubs();
    });
  });
}

async function initClubsPage() {
  const user = await requireLogin();
  if (!user) return;

  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('clubs-app').style.display = 'block';

  const { leagues } = await api('/api/leagues');
  allLeagues = leagues;
  document.getElementById('club-league').innerHTML = leagues.map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');

  document.getElementById('add-club-btn').addEventListener('click', async () => {
    const name = document.getElementById('club-name').value.trim();
    const leagueId = document.getElementById('club-league').value;
    const crestUrl = document.getElementById('club-crest').value.trim();
    const venue = document.getElementById('club-venue').value.trim();
    if (!name || !leagueId) return;
    await api('/api/clubs', { method: 'POST', body: JSON.stringify({ name, leagueId, crestUrl, venue }) });
    document.getElementById('club-name').value = '';
    document.getElementById('club-crest').value = '';
    document.getElementById('club-venue').value = '';
    loadClubs();
  });

  loadClubs();
}

initClubsPage();
