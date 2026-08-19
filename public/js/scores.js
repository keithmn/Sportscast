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
  const postponedNote = f.status === 'POSTPONED' && f.originalKickoff
    ? `<div class="fixture-meta" style="margin-top:0.2rem;">Was ${formatDate(f.originalKickoff)} — now ${formatDate(f.kickoff)}</div>`
    : '';
  return `
    <div class="fixture-row" style="flex-wrap:wrap;">
      <span class="fixture-teams">${escapeHtml(f.homeTeam)} vs ${escapeHtml(f.awayTeam)}</span>
      <span>${scoreOrTime}<span class="fixture-status ${escapeHtml(f.status)}">${escapeHtml(f.status)}</span></span>
      ${postponedNote}
    </div>`;
}

function fixturesListHtml(fixtures) {
  if (!fixtures.length) {
    return '<p class="empty-state">No fixtures entered for this league yet.</p>';
  }
  return fixtures.map(fixtureRowHtml).join('');
}

// Full standings + upcoming + recent for one league — same shape the page
// always used for its single (KPL-only) view, now reused per league.
function leagueDetailHtml(league) {
  const upcoming = league.fixtures.filter((f) => f.status !== 'FINISHED');
  const recent = league.fixtures.filter((f) => f.status === 'FINISHED').slice(-8).reverse();
  return `
    <div class="league-detail">
      <h3 class="story-hl" style="margin-bottom:1rem;">${escapeHtml(league.name)}</h3>
      <div style="margin-bottom:2rem;">
        <span class="section-label">Standings</span>
        ${standingsTableHtml(league.standings)}
      </div>
      <div style="margin-bottom:2rem;">
        <span class="section-label">Upcoming Fixtures</span>
        ${fixturesListHtml(upcoming)}
      </div>
      <div>
        <span class="section-label">Recent Results</span>
        ${fixturesListHtml(recent)}
      </div>
    </div>`;
}

async function fetchLeagueDetail(slug) {
  const { league } = await api(`/api/leagues/${encodeURIComponent(slug)}`);
  return league;
}

// One sport's full Scores view: Kenyan leagues (KPL, NSL, ...) shown
// expanded by default — the client's explicit ask was that these not get
// lost in the noise of a much longer global list — then a secondary,
// single-select picker for the region:GLOBAL leagues in that sport,
// lazy-loaded one at a time on click rather than fetching all of them.
async function renderScoresSportPanel(panelEl, sportLeagues) {
  const kenyaLeagues = sportLeagues.filter((l) => l.region === 'KENYA');
  const globalLeagues = sportLeagues.filter((l) => l.region === 'GLOBAL');

  panelEl.innerHTML = `
    <div data-kenya-leagues></div>
    ${globalLeagues.length ? `
      <div style="margin-top:3rem;">
        <span class="section-label">Other Leagues</span>
        <div class="filter-row" data-global-pills></div>
        <div data-global-detail></div>
      </div>` : ''}`;

  const kenyaEl = panelEl.querySelector('[data-kenya-leagues]');
  if (kenyaLeagues.length) {
    kenyaEl.innerHTML = kenyaLeagues.map(() => '<div class="empty-state">Loading…</div>').join('');
    const details = await Promise.all(kenyaLeagues.map((l) => fetchLeagueDetail(l.slug)));
    kenyaEl.innerHTML = details.map(leagueDetailHtml).join('<hr style="border-color:var(--border); margin:2.5rem 0;">');
  } else {
    kenyaEl.innerHTML = '<p class="empty-state">No Kenyan leagues added for this sport yet.</p>';
  }

  if (globalLeagues.length) {
    const pillsEl = panelEl.querySelector('[data-global-pills]');
    const detailEl = panelEl.querySelector('[data-global-detail]');
    pillsEl.innerHTML = globalLeagues
      .map((l) => `<button class="filter-pill" data-slug="${escapeHtml(l.slug)}">${escapeHtml(l.name)}</button>`)
      .join('');

    pillsEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      pillsEl.querySelectorAll('.filter-pill').forEach((p) => p.classList.toggle('active', p === btn));
      detailEl.innerHTML = '<div class="empty-state">Loading…</div>';
      try {
        const league = await fetchLeagueDetail(btn.dataset.slug);
        detailEl.innerHTML = leagueDetailHtml(league);
      } catch (err) {
        detailEl.innerHTML = `<div class="empty-state">Could not load this league: ${escapeHtml(err.message)}</div>`;
      }
    });
  }
}

async function loadScores() {
  const root = document.getElementById('scores-root');
  const { leagues } = await api('/api/leagues');

  if (!leagues.length) {
    root.innerHTML = '<p class="empty-state">No leagues have been added yet.</p>';
    return;
  }

  const bySport = new Map();
  leagues.forEach((l) => {
    if (!bySport.has(l.sport.slug)) bySport.set(l.sport.slug, { label: l.sport.name, leagues: [] });
    bySport.get(l.sport.slug).leagues.push(l);
  });
  const categories = Array.from(bySport, ([key, { label, leagues }]) => ({ key, label, items: leagues }));

  renderCategoryToggle({
    container: root,
    categories,
    // renderItem is unused here — the sport panel renders its own
    // Kenya/Global structure via afterRender instead of one row per item.
    renderItem: () => '',
    afterRender: (panelEl, category) => {
      panelEl.innerHTML = '';
      renderScoresSportPanel(panelEl, category.items).catch((err) => {
        panelEl.innerHTML = `<div class="empty-state">Could not load scores: ${escapeHtml(err.message)}</div>`;
      });
    },
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('scores-root')) return;
  loadScores().catch((err) => {
    document.getElementById('scores-root').innerHTML = `<div class="empty-state">Could not load scores: ${escapeHtml(err.message)}</div>`;
  });
});
