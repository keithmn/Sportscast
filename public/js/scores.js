function standingsTableHtml(standings) {
  if (!standings.length) {
    return '<p class="empty-state">Standings haven\'t been entered for this competition yet.</p>';
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
  // A "FINISHED" status doesn't always mean a real two-sided score exists —
  // PDC Darts tournament-day events (no awayTeam, see below) come back FT
  // with no score at all, so a 0-0 fallback there would be actively
  // misleading rather than just unknown. Show the date instead whenever
  // there's no real score to show, regardless of status.
  const hasRealScore = f.homeScore != null || f.awayScore != null;
  const scoreOrTime = f.status === 'FINISHED' && hasRealScore
    ? `<span class="fixture-score">${f.homeScore ?? 0} – ${f.awayScore ?? 0}</span>`
    : `<span class="fixture-meta">${formatDate(f.kickoff)}</span>`;
  const postponedNote = f.status === 'POSTPONED' && f.originalKickoff
    ? `<div class="fixture-meta" style="margin-top:0.2rem;">Was ${formatDate(f.originalKickoff)} — now ${formatDate(f.kickoff)}</div>`
    : '';
  // Most fixtures are two-sided (X vs Y); a few synced competitions (PDC
  // Darts tournament-day events) have no real "away" side at all — see
  // syncTheSportsDB.js's 'event' kind — so awayTeam is blank on purpose,
  // not a data error, and just shows the event name alone.
  const teamsLabel = f.awayTeam ? `${escapeHtml(f.homeTeam)} vs ${escapeHtml(f.awayTeam)}` : escapeHtml(f.homeTeam);
  return `
    <div class="fixture-row" style="flex-wrap:wrap;">
      <span class="fixture-teams">${teamsLabel}</span>
      <span>${scoreOrTime}<span class="fixture-status ${escapeHtml(f.status)}">${escapeHtml(f.status)}</span></span>
      ${postponedNote}
    </div>`;
}

function fixturesListHtml(fixtures) {
  if (!fixtures.length) {
    return '<p class="empty-state">No fixtures entered for this competition yet.</p>';
  }
  return fixtures.map(fixtureRowHtml).join('');
}

function competitionTitleHtml(competition) {
  return `<h3 class="story-hl" style="margin-bottom:1rem; display:flex; align-items:baseline; gap:0.75rem; flex-wrap:wrap;">
    ${escapeHtml(competition.name)}
    <a class="btn-link" href="/competition.html?slug=${encodeURIComponent(competition.slug)}" style="font-size:0.85rem;">View full competition →</a>
  </h3>`;
}

// Fixtures + results only, for the sport hub's "Scores & Fixtures" tab and
// the flat Scores & Fixtures page's fixtures view.
function competitionFixturesHtml(competition) {
  const upcoming = competition.fixtures.filter((f) => f.status !== 'FINISHED');
  const recent = competition.fixtures.filter((f) => f.status === 'FINISHED').slice(-8).reverse();
  return `
    <div class="competition-detail">
      ${competitionTitleHtml(competition)}
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

// Standings only, for the sport hub's "Tables" tab.
function competitionTableHtml(competition) {
  return `
    <div class="competition-detail">
      ${competitionTitleHtml(competition)}
      ${standingsTableHtml(competition.standings)}
    </div>`;
}

// Standings + fixtures together — the flat Scores & Fixtures page's
// original combined view.
function competitionDetailHtml(competition) {
  const upcoming = competition.fixtures.filter((f) => f.status !== 'FINISHED');
  const recent = competition.fixtures.filter((f) => f.status === 'FINISHED').slice(-8).reverse();
  return `
    <div class="competition-detail">
      ${competitionTitleHtml(competition)}
      <div style="margin-bottom:2rem;">
        <span class="section-label">Standings</span>
        ${standingsTableHtml(competition.standings)}
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

function competitionCardHtml(c) {
  return `
    <a href="/competition.html?slug=${encodeURIComponent(c.slug)}" style="display:contents;">
      <div class="card">
        <span class="card-eyebrow">${escapeHtml(c.region === 'KENYA' ? 'Kenya' : 'Global')}</span>
        <h3 class="card-title">${escapeHtml(c.name)}</h3>
      </div>
    </a>`;
}

async function fetchCompetitionDetail(slug) {
  const { competition } = await api(`/api/competitions/${encodeURIComponent(slug)}`);
  return competition;
}

// One sport's full Scores/Tables view: Kenyan competitions (KPL, NSL, ...)
// shown expanded by default — the client's explicit ask was that these not
// get lost in the noise of a much longer global list — then a secondary,
// single-select picker for the region:GLOBAL competitions in that sport,
// lazy-loaded one at a time on click rather than fetching all of them.
// `detailRenderer` decides whether each competition renders fixtures,
// standings, or both — same fetch either way, just a different view of it.
async function renderCompetitionsSportPanel(panelEl, sportCompetitions, detailRenderer) {
  const kenyaCompetitions = sportCompetitions.filter((c) => c.region === 'KENYA');
  const globalCompetitions = sportCompetitions.filter((c) => c.region === 'GLOBAL');

  panelEl.innerHTML = `
    <div data-kenya-competitions></div>
    ${globalCompetitions.length ? `
      <div style="margin-top:3rem;">
        <span class="section-label">Other Competitions</span>
        <div class="filter-row" data-global-pills></div>
        <div data-global-detail></div>
      </div>` : ''}`;

  const kenyaEl = panelEl.querySelector('[data-kenya-competitions]');
  if (kenyaCompetitions.length) {
    kenyaEl.innerHTML = kenyaCompetitions.map(() => '<div class="empty-state">Loading…</div>').join('');
    const details = await Promise.all(kenyaCompetitions.map((c) => fetchCompetitionDetail(c.slug)));
    kenyaEl.innerHTML = details.map(detailRenderer).join('<hr style="border-color:var(--border); margin:2.5rem 0;">');
  } else {
    kenyaEl.innerHTML = '<p class="empty-state">No Kenyan competitions added for this sport yet.</p>';
  }

  if (globalCompetitions.length) {
    const pillsEl = panelEl.querySelector('[data-global-pills]');
    const detailEl = panelEl.querySelector('[data-global-detail]');
    pillsEl.innerHTML = globalCompetitions
      .map((c) => `<button class="filter-pill" data-slug="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</button>`)
      .join('');

    pillsEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      pillsEl.querySelectorAll('.filter-pill').forEach((p) => p.classList.toggle('active', p === btn));
      detailEl.innerHTML = '<div class="empty-state">Loading…</div>';
      try {
        const competition = await fetchCompetitionDetail(btn.dataset.slug);
        detailEl.innerHTML = detailRenderer(competition);
      } catch (err) {
        detailEl.innerHTML = `<div class="empty-state">Could not load this competition: ${escapeHtml(err.message)}</div>`;
      }
    });
  }
}

async function loadScores() {
  const root = document.getElementById('scores-root');
  const { competitions } = await api('/api/competitions');

  if (!competitions.length) {
    root.innerHTML = '<p class="empty-state">No competitions have been added yet.</p>';
    return;
  }

  const bySport = new Map();
  competitions.forEach((c) => {
    if (!bySport.has(c.sport.slug)) bySport.set(c.sport.slug, { label: c.sport.name, competitions: [] });
    bySport.get(c.sport.slug).competitions.push(c);
  });
  const categories = Array.from(bySport, ([key, { label, competitions }]) => ({ key, label, items: competitions }));

  renderCategoryToggle({
    container: root,
    categories,
    // renderItem is unused here — the sport panel renders its own
    // Kenya/Global structure via afterRender instead of one row per item.
    renderItem: () => '',
    afterRender: (panelEl, category) => {
      panelEl.innerHTML = '';
      renderCompetitionsSportPanel(panelEl, category.items, competitionDetailHtml).catch((err) => {
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
