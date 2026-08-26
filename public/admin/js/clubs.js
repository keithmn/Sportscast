let allCompetitions = [];

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

// Same shape as playerRowHtml minus age — a coaching role doesn't need one.
function staffRowHtml(s) {
  return `
    <div class="staff-row-grid" data-staff-id="${s.id}">
      <input type="text" value="${escapeHtml(s.name)}" data-field="name" placeholder="Staff name">
      <input type="text" value="${escapeHtml(s.role || '')}" data-field="role" placeholder="Role (Head Coach, ...)">
      <input type="text" value="${escapeHtml(s.nationality || '')}" data-field="nationality" placeholder="Nationality">
      <input type="text" value="${escapeHtml(s.photoUrl || '')}" data-field="photoUrl" placeholder="Photo URL">
      <span>
        <button type="button" class="btn-outline-sm save-staff-btn">Save</button>
        <button type="button" class="btn-outline-sm delete-staff-btn" style="color:var(--danger); border-color:var(--danger);">✕</button>
      </span>
    </div>`;
}

function sponsorRowHtml(sp) {
  return `
    <div class="sponsor-row-grid" data-sponsor-id="${sp.id}">
      <input type="text" value="${escapeHtml(sp.name)}" data-field="name" placeholder="Sponsor name">
      <input type="text" value="${escapeHtml(sp.logoUrl || '')}" data-field="logoUrl" placeholder="Logo URL">
      <input type="text" value="${escapeHtml(sp.website || '')}" data-field="website" placeholder="Website">
      <span>
        <button type="button" class="btn-outline-sm save-sponsor-btn">Save</button>
        <button type="button" class="btn-outline-sm delete-sponsor-btn" style="color:var(--danger); border-color:var(--danger);">✕</button>
      </span>
    </div>`;
}

function clubBlockHtml(club) {
  const sourceTag = club.source === 'API'
    ? `<span class="status-badge" style="margin-left:0.5rem;">Wikidata · synced ${club.lastSyncedAt ? formatDate(club.lastSyncedAt) : 'never'}</span>`
    : '';
  return `
    <div class="card" style="margin-bottom:2.5rem; cursor:default;">
      <span class="card-eyebrow">${escapeHtml(club.competition.sport.name)} · ${escapeHtml(club.competition.name)}</span>
      <h3 class="card-title">${escapeHtml(club.name)}${sourceTag}</h3>
      ${club.owner ? `<p class="page-sub" style="margin-top:0.4rem;">Owned by ${escapeHtml(club.owner)}</p>` : ''}

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
          <span class="section-label" style="font-size:0.68rem;">Coach &amp; Staff</span>
          <div id="staff-rows-${club.id}">
            ${club.staff.map(staffRowHtml).join('') || '<p class="empty-state" style="padding:0.5rem 0;">No staff yet.</p>'}
          </div>
          <div class="staff-row-grid" style="margin-top:0.75rem;">
            <input type="text" placeholder="Staff name" data-new-staff="name">
            <input type="text" placeholder="Role (Head Coach, ...)" data-new-staff="role">
            <input type="text" placeholder="Nationality" data-new-staff="nationality">
            <input type="text" placeholder="Photo URL" data-new-staff="photoUrl">
            <button type="button" class="btn-outline-sm add-staff-btn" data-club-id="${club.id}">+ Add Staff</button>
          </div>
        </div>

        <div style="margin-top:1.25rem;">
          <span class="section-label" style="font-size:0.68rem;">Sponsors</span>
          <div id="sponsors-rows-${club.id}">
            ${club.sponsors.map(sponsorRowHtml).join('') || '<p class="empty-state" style="padding:0.5rem 0;">No sponsors yet.</p>'}
          </div>
          <div class="sponsor-row-grid" style="margin-top:0.75rem;">
            <input type="text" placeholder="Sponsor name" data-new-sponsor="name">
            <input type="text" placeholder="Logo URL" data-new-sponsor="logoUrl">
            <input type="text" placeholder="Website" data-new-sponsor="website">
            <button type="button" class="btn-outline-sm add-sponsor-btn" data-club-id="${club.id}">+ Add Sponsor</button>
          </div>
        </div>

        <div style="margin-top:1.25rem;">
          <button type="button" class="btn-outline-sm delete-club-btn" data-club-id="${club.id}" style="color:var(--danger); border-color:var(--danger);">Delete Club</button>
        </div>` : ''}
    </div>`;
}

async function loadClubs() {
  const { clubs } = await api('/api/clubs');
  const root = document.getElementById('clubs-root');
  if (!clubs.length) {
    root.innerHTML = '<p class="empty-state">No clubs added yet — add one above, or enable squad sync for a competition on the Competitions page.</p>';
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

  root.querySelectorAll('.add-staff-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.staff-row-grid');
      const get = (f) => row.querySelector(`[data-new-staff="${f}"]`).value.trim();
      const name = get('name');
      if (!name) return;
      await api(`/api/clubs/${btn.dataset.clubId}/staff`, {
        method: 'POST',
        body: JSON.stringify({ name, role: get('role'), nationality: get('nationality'), photoUrl: get('photoUrl') }),
      });
      loadClubs();
    });
  });

  root.querySelectorAll('.save-staff-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-staff-id]');
      const get = (f) => row.querySelector(`[data-field="${f}"]`).value.trim();
      await api(`/api/clubs/staff/${row.dataset.staffId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: get('name'), role: get('role'), nationality: get('nationality'), photoUrl: get('photoUrl') }),
      });
      loadClubs();
    });
  });

  root.querySelectorAll('.delete-staff-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this staff member?')) return;
      await api(`/api/clubs/staff/${btn.closest('[data-staff-id]').dataset.staffId}`, { method: 'DELETE' });
      loadClubs();
    });
  });

  root.querySelectorAll('.add-sponsor-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.sponsor-row-grid');
      const get = (f) => row.querySelector(`[data-new-sponsor="${f}"]`).value.trim();
      const name = get('name');
      if (!name) return;
      await api(`/api/clubs/${btn.dataset.clubId}/sponsors`, {
        method: 'POST',
        body: JSON.stringify({ name, logoUrl: get('logoUrl'), website: get('website') }),
      });
      loadClubs();
    });
  });

  root.querySelectorAll('.save-sponsor-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-sponsor-id]');
      const get = (f) => row.querySelector(`[data-field="${f}"]`).value.trim();
      await api(`/api/clubs/sponsors/${row.dataset.sponsorId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: get('name'), logoUrl: get('logoUrl'), website: get('website') }),
      });
      loadClubs();
    });
  });

  root.querySelectorAll('.delete-sponsor-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this sponsor?')) return;
      await api(`/api/clubs/sponsors/${btn.closest('[data-sponsor-id]').dataset.sponsorId}`, { method: 'DELETE' });
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

  const { competitions } = await api('/api/competitions');
  allCompetitions = competitions;
  document.getElementById('club-competition').innerHTML = competitions.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  document.getElementById('add-club-btn').addEventListener('click', async () => {
    const name = document.getElementById('club-name').value.trim();
    const competitionId = document.getElementById('club-competition').value;
    const crestUrl = document.getElementById('club-crest').value.trim();
    const venue = document.getElementById('club-venue').value.trim();
    const owner = document.getElementById('club-owner').value.trim();
    if (!name || !competitionId) return;
    await api('/api/clubs', { method: 'POST', body: JSON.stringify({ name, competitionId, crestUrl, venue, owner }) });
    document.getElementById('club-name').value = '';
    document.getElementById('club-crest').value = '';
    document.getElementById('club-venue').value = '';
    document.getElementById('club-owner').value = '';
    loadClubs();
  });

  loadClubs();
}

initClubsPage();
