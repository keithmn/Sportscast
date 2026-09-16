// player.html's bootstrap. A player isn't a competition-scoped entity — no
// Scores/Fixtures/Tables of its own — so this deliberately does NOT reuse
// subnav.js's tab-bar machinery (that would force a nonsensical Tables tab
// onto a page with nothing to show there). Simple, single-scroll layout:
// a profile header (reusing the same .profile-header/.profile-badge
// classes club.js's Kenyan club profile already uses) plus a News &
// Podcasts feed of whatever's tagged to this player via Article.playerId.
// Only reached from a Kenyan club's own page — player.html has no
// standalone "browse all players" entry point, same as club profiles.

function formatCanonicalDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function canonicalPerformance(r) {
  if (r.timeSeconds != null) return `${r.timeSeconds}s`;
  if (r.distanceMeters != null) return `${r.distanceMeters}m`;
  if (r.heightMeters != null) return `${r.heightMeters}m`;
  return '—';
}

// Wave 4 — expands the previous one-line canonical note into the actual
// history/performance data the Data Platform's /athletes/:id already
// returns (server/lib/canonicalData.js now surfaces it). Fails soft the
// same way the note always did: no canonicalAthlete, or any of its
// sub-arrays empty, just means that section is omitted, never an error.
function canonicalAthleteSectionHtml(ca) {
  if (!ca) return '';

  const competitionNames = [...new Set(ca.matchHistory.map((m) => m.competitionName).filter(Boolean))];

  const historyHtml = ca.affiliationHistory.length ? `
    <h2>Affiliation History (Canonical)</h2>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Team</th><th>Season</th><th>Role</th><th class="num">Jersey</th><th>Dates</th></tr></thead>
        <tbody>
          ${ca.affiliationHistory.map((h) => `
            <tr>
              <td>${escapeHtml(h.teamName)}</td>
              <td>${h.seasonName ? escapeHtml(h.seasonName) : '—'}</td>
              <td>${escapeHtml(h.role)}</td>
              <td class="num">${h.jerseyNumber ?? '—'}</td>
              <td>${formatCanonicalDate(h.startDate)}${h.endDate ? ` – ${formatCanonicalDate(h.endDate)}` : ' – present'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const competitionsHtml = competitionNames.length ? `
    <p class="source-note">Competitions (canonical): ${competitionNames.map(escapeHtml).join(', ')}</p>` : '';

  const athleticsHtml = ca.athleticsResults.length ? `
    <h2>Results (Canonical)</h2>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Meet</th><th>Event</th><th class="num">Performance</th><th class="num">Rank</th><th></th></tr></thead>
        <tbody>
          ${ca.athleticsResults.map((r) => `
            <tr>
              <td>${r.meetName ? escapeHtml(r.meetName) : '—'}</td>
              <td>${r.eventName ? escapeHtml(r.eventName) : '—'}</td>
              <td class="num">${canonicalPerformance(r)}</td>
              <td class="num">${r.rank ?? '—'}</td>
              <td>${r.isPersonalBest ? '<span class="pill">PB</span>' : ''}${r.isSeasonBest ? '<span class="pill">SB</span>' : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const matchHistoryHtml = (!ca.athleticsResults.length && ca.matchHistory.length) ? `
    <h2>Match History (Canonical)</h2>
    ${ca.matchHistory.map((m) => `
      <div class="fixture-row">
        <span class="teams">${escapeHtml(m.eventTypeLabel || '')} — ${escapeHtml(m.homeTeamName || '')} vs ${escapeHtml(m.awayTeamName || '')}</span>
        <span>
          ${m.minute != null ? `<span class="meta">${m.minute}'</span>` : ''}
          ${m.scheduledStart ? `<span class="meta" style="margin-left:0.75rem;">${formatCanonicalDate(m.scheduledStart)}</span>` : ''}
        </span>
      </div>`).join('')}` : '';

  return `${historyHtml}${competitionsHtml}${athleticsHtml}${matchHistoryHtml}`;
}

async function loadPlayer() {
  const root = document.getElementById('player-root');
  const slug = qs('slug');
  if (!slug) {
    root.innerHTML = '<p class="empty-state">No player specified.</p>';
    return;
  }

  const { player } = await api(`/api/clubs/players/${encodeURIComponent(slug)}`);
  document.title = `${player.name} — The Sportscast`;

  const metaParts = [
    player.position,
    player.nationality,
    player.age ? `${player.age} yrs` : null,
  ].filter(Boolean);

  root.innerHTML = `
    <div class="profile-header">
      <div class="profile-badge">
        ${player.photoUrl ? `<img loading="lazy" src="${escapeHtml(player.photoUrl)}" alt="" onerror="this.parentElement.textContent='${escapeHtml(player.name).charAt(0)}'">` : escapeHtml(player.name).charAt(0)}
      </div>
      <div>
        <span class="card-eyebrow">${escapeHtml(player.club.competition.sport.name)}</span>
        <h1 class="profile-name">${escapeHtml(player.name)}</h1>
        <p class="profile-meta">
          ${metaParts.map(escapeHtml).join(' · ')}${metaParts.length ? ' · ' : ''}Plays for
          <a href="/club.html?slug=${encodeURIComponent(player.club.slug)}">${escapeHtml(player.club.name)}</a>
        </p>
      </div>
      <div style="margin-left:auto;">${followButtonHtml('player', player.slug, player.name, `/player.html?slug=${encodeURIComponent(player.slug)}`)}</div>
    </div>
    ${player.canonicalAthlete ? `
      <div style="max-width:900px; margin:0 auto;">
        <p class="source-note">Canonical record: ${escapeHtml(player.canonicalAthlete.fullName)}${player.canonicalAthlete.currentTeamName ? ` · ${escapeHtml(player.canonicalAthlete.currentTeamName)}` : ''}</p>
        ${canonicalAthleteSectionHtml(player.canonicalAthlete)}
      </div>` : ''}
    <div style="max-width:900px; margin:0 auto; padding:2rem 0 4rem;" id="player-articles">
      <span class="section-label">News &amp; Podcasts</span>
      <div class="empty-state">Loading…</div>
    </div>`;

  const { articles } = await api(`/api/articles?player=${encodeURIComponent(slug)}`);
  const articlesEl = document.getElementById('player-articles');
  articlesEl.innerHTML = `
    <span class="section-label">News &amp; Podcasts</span>
    ${articles.length
      ? `<div class="card-grid">${articles.map(articleCardHtml).join('')}</div>`
      : `<p class="empty-state">No stories tagged to ${escapeHtml(player.name)} yet.</p>`}`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadPlayer().catch((err) => {
    document.getElementById('player-root').innerHTML = `<div class="empty-state">Could not load this player: ${escapeHtml(err.message)}</div>`;
  });
});
