function standingsTableHtml(standings) {
  if (!standings.length) {
    return '<p class="empty-state">Standings haven\'t been entered for this league yet.</p>';
  }
  const rows = standings.map((r) => `
    <tr>
      <td>${r.position}</td>
      <td>${escapeHtml(r.teamName)}</td>
      <td class="num">${r.played}</td>
      <td class="num">${r.won}</td>
      <td class="num">${r.drawn}</td>
      <td class="num">${r.lost}</td>
      <td class="num">${r.goalsFor}-${r.goalsAgainst}</td>
      <td class="num"><strong>${r.points}</strong></td>
    </tr>`).join('');
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>#</th><th>Team</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">GF-GA</th><th class="num">Pts</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function fixtureRowHtml(f) {
  const scoreOrTime = f.status === 'FINISHED'
    ? `<span class="fixture-score">${f.homeScore ?? 0} – ${f.awayScore ?? 0}</span>`
    : `<span class="fixture-meta">${formatDate(f.kickoff)}</span>`;
  return `
    <div class="fixture-row">
      <span class="fixture-teams">${escapeHtml(f.homeTeam)} vs ${escapeHtml(f.awayTeam)}</span>
      <span>${scoreOrTime}<span class="fixture-status ${escapeHtml(f.status)}">${escapeHtml(f.status)}</span></span>
    </div>`;
}

function fixturesListHtml(fixtures) {
  if (!fixtures.length) {
    return '<p class="empty-state">No fixtures entered for this league yet.</p>';
  }
  return fixtures.map(fixtureRowHtml).join('');
}

async function loadScores() {
  const root = document.getElementById('scores-root');
  const { leagues } = await api('/api/leagues');

  if (!leagues.length) {
    root.innerHTML = '<p class="empty-state">No leagues have been added yet.</p>';
    return;
  }

  // Football-first: show the first league found. When a second league
  // (rugby, athletics) is added, this becomes a tab row instead of a
  // single view — not needed while there's only one.
  const { league } = await api(`/api/leagues/${encodeURIComponent(leagues[0].slug)}`);

  const upcoming = league.fixtures.filter((f) => f.status !== 'FINISHED');
  const recent = league.fixtures.filter((f) => f.status === 'FINISHED').slice(-8).reverse();

  root.innerHTML = `
    <section style="margin-bottom:3rem;">
      <span class="section-label">${escapeHtml(league.name)} — Standings</span>
      ${standingsTableHtml(league.standings)}
    </section>
    <section style="margin-bottom:3rem;">
      <span class="section-label">Upcoming Fixtures</span>
      ${fixturesListHtml(upcoming)}
    </section>
    <section>
      <span class="section-label">Recent Results</span>
      ${fixturesListHtml(recent)}
    </section>`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadScores().catch((err) => {
    document.getElementById('scores-root').innerHTML = `<div class="empty-state">Could not load scores: ${escapeHtml(err.message)}</div>`;
  });
});
