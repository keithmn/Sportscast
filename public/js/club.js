// club.html's bootstrap. The tab bar itself is the shared one from
// subnav.js (News/Watch/Scores & Fixtures/Tables/Transfers/Teams/
// Competitions) — this file fetches the club, renders its own header plus
// static profile content, then hands off to the shared tabs for
// everything else. See subnav.js for the tab mechanism, sport.js/
// competition.js for the other two callers.
//
// Kenyan clubs get the full profile template (crest badge, owner, Coach &
// Staff, Squad, Sponsors) — Global clubs (Arsenal, Bayern, ...) keep the
// original simple crest+squad treatment, since coach/sponsorship data is
// only ever entered for Kenyan clubs (client's own jurisdictional call,
// same split as the Teams tab).

// playerCardHtml now lives in subnav.js (shared with the new Players tab)
// — this file just calls it, `linked` true only for Kenyan clubs
// (profileHeaderHtml, below).

// Same card shape as a player's — role stands in for position.
function staffCardHtml(s) {
  return `
    <div class="player-card staff-card">
      ${s.photoUrl
        ? `<img class="player-photo" src="${escapeHtml(s.photoUrl)}" alt="${escapeHtml(s.name)}" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'player-photo-empty', textContent:'No photo'}))">`
        : `<div class="player-photo-empty">No photo</div>`}
      <div class="player-name">${escapeHtml(s.name)}</div>
      <div class="player-meta">${escapeHtml(s.role || '')}${s.role && s.nationality ? ' · ' : ''}${escapeHtml(s.nationality || '')}</div>
    </div>`;
}

function sponsorLogoHtml(sp) {
  const img = sp.logoUrl
    ? `<img src="${escapeHtml(sp.logoUrl)}" alt="${escapeHtml(sp.name)}" onerror="this.replaceWith(document.createTextNode('${escapeHtml(sp.name).replace(/'/g, "\\'")}'))">`
    : escapeHtml(sp.name);
  return sp.website
    ? `<a class="sponsor-logo" href="${escapeHtml(sp.website)}" target="_blank" rel="noopener" title="${escapeHtml(sp.name)}">${img}</a>`
    : `<span class="sponsor-logo" title="${escapeHtml(sp.name)}">${img}</span>`;
}

function simpleHeaderHtml(club) {
  return `
    <div class="article-header" style="max-width:900px; display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap;">
      ${club.crestUrl ? `<img src="${escapeHtml(club.crestUrl)}" alt="" style="width:72px; height:72px; object-fit:contain;" onerror="this.remove()">` : ''}
      <div>
        <span class="card-eyebrow">${escapeHtml(club.competition.sport.name)} · ${escapeHtml(club.competition.name)}</span>
        <h1 class="page-title" style="font-size:2rem;">${escapeHtml(club.name)}</h1>
        ${club.venue ? `<p class="page-sub">${escapeHtml(club.venue)}</p>` : ''}
      </div>
    </div>
    <div style="max-width:900px; margin:0 auto; padding:2rem 0 4rem;">
      <span class="section-label">Squad</span>
      ${club.players.length
        ? `<div class="player-grid">${club.players.map((p) => playerCardHtml(p, false)).join('')}</div>`
        : `<p class="empty-state">${club.source === 'API' ? 'No current squad data available yet for this club.' : 'No players added yet.'}</p>`}
      ${club.source === 'API' ? '<p class="empty-state" style="margin-top:1.5rem;">Squad sourced from Wikidata\'s public records — reliably current where shown, but not guaranteed to list every player on the books.</p>' : ''}
    </div>`;
}

// The real profile template — Kenyan clubs only. .profile-header/
// .profile-badge are pre-existing, previously-unused site.css classes
// scaffolded for exactly this.
function profileHeaderHtml(club) {
  const metaParts = [club.competition.name, club.venue, club.owner ? `Owned by ${club.owner}` : null].filter(Boolean);
  return `
    <div class="container">
      <div class="profile-header">
        <div class="profile-badge">
          ${club.crestUrl ? `<img src="${escapeHtml(club.crestUrl)}" alt="" onerror="this.parentElement.textContent='${escapeHtml(club.name).charAt(0)}'">` : escapeHtml(club.name).charAt(0)}
        </div>
        <div>
          <span class="card-eyebrow">${escapeHtml(club.competition.sport.name)}</span>
          <h1 class="profile-name">${escapeHtml(club.name)}</h1>
          <p class="profile-meta">${metaParts.map(escapeHtml).join(' · ')}</p>
        </div>
      </div>
    </div>
    <div style="max-width:900px; margin:0 auto; padding:2rem 0 1rem;">
      <span class="section-label">Coach &amp; Staff</span>
      ${club.staff.length
        ? `<div class="player-grid">${club.staff.map(staffCardHtml).join('')}</div>`
        : '<p class="empty-state">No coaching staff added yet.</p>'}
    </div>
    <div style="max-width:900px; margin:0 auto; padding:1rem 0;">
      <span class="section-label">Squad</span>
      ${club.players.length
        ? `<div class="player-grid">${club.players.map((p) => playerCardHtml(p, true)).join('')}</div>`
        : '<p class="empty-state">No players added yet.</p>'}
    </div>
    ${club.sponsors.length ? `
      <div style="max-width:900px; margin:0 auto; padding:1rem 0 4rem;">
        <span class="section-label">Sponsors</span>
        <div class="sponsor-row">${club.sponsors.map(sponsorLogoHtml).join('')}</div>
      </div>` : '<div style="padding-bottom:2rem;"></div>'}`;
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

  const isKenyan = club.competition.region === 'KENYA';
  root.innerHTML = `${isKenyan ? profileHeaderHtml(club) : simpleHeaderHtml(club)}<div id="club-tab-root"></div>`;

  const competitionDetail = await fetchCompetitionDetail(club.competition.slug);
  const tabRoot = document.getElementById('club-tab-root');
  const scope = {
    sportSlug: club.competition.sport.slug,
    sportName: club.competition.sport.name,
    competition: null,
    club: { slug: club.slug, name: club.name, detail: club, competitionDetail },
  };
  renderSecondaryNav(tabRoot, scope, 'tables');
}

document.addEventListener('DOMContentLoaded', () => {
  loadClub().catch((err) => {
    document.getElementById('club-root').innerHTML = `<div class="empty-state">Could not load this club: ${escapeHtml(err.message)}</div>`;
  });
});
