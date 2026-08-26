// East Africa Time is a fixed UTC+3 offset (no DST) — the same reasoning
// as server/routes/fixtures.js's eatDayWindow(). A visitor's browser could
// be in any timezone; "today" for the date-filtered Scores & Fixtures tab
// needs to mean Nairobi's today, not the visitor's.
function nairobiToday() {
  const shifted = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function addDaysToDateStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(dateStr) {
  // Noon UTC avoids any date-boundary edge case when formatting a plain
  // calendar-date string for display — there's no real time-of-day here.
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

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

  // Both branches are conditionally rendered — neither shows an "empty"
  // message for a branch that's structurally guaranteed to have nothing
  // (renderGroupedCompetitionsPanel always calls this with an already
  // single-region bucket, where one branch is empty by construction; an
  // "empty" message there would be pure noise, not information).
  panelEl.innerHTML = `
    ${kenyaCompetitions.length ? '<div data-kenya-competitions></div>' : ''}
    ${globalCompetitions.length ? `
      <div style="margin-top:${kenyaCompetitions.length ? '3rem' : '0'};">
        ${kenyaCompetitions.length ? '<span class="section-label">Other Competitions</span>' : ''}
        <div class="filter-row" data-global-pills></div>
        <div data-global-detail></div>
      </div>` : ''}`;

  if (kenyaCompetitions.length) {
    const kenyaEl = panelEl.querySelector('[data-kenya-competitions]');
    kenyaEl.innerHTML = kenyaCompetitions.map(() => '<div class="empty-state">Loading…</div>').join('');
    const details = await Promise.all(kenyaCompetitions.map((c) => fetchCompetitionDetail(c.slug)));
    kenyaEl.innerHTML = details.map(detailRenderer).join('<hr style="border-color:var(--border); margin:2.5rem 0;">');
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

const CATEGORY_ORDER = ['LEAGUE', 'CUP', 'CONTINENTAL', 'INTERNATIONAL'];
const CATEGORY_LABELS = { LEAGUE: 'Leagues', CUP: 'Cups', CONTINENTAL: 'Continental', INTERNATIONAL: 'International' };
const REGION_LABELS = { KENYA: 'Kenya', GLOBAL: 'Global' };

// Region-first (Kenya, then Global), category-second grouping used by the
// sport hub's Tables and Competitions tabs. Sky Sports's own category
// names (Domestic Leagues, Europe, ...) only work as a flat list because
// their site is implicitly England-centric — "Domestic" already means
// English. This site needs Kenyan competitions visually separated from
// foreign/global ones first, with category as a secondary grouping within
// each region — otherwise KPL would render under the same heading as the
// Premier League. A category sub-heading only appears when a region
// actually spans more than one category, so a sport with just Kenyan
// leagues doesn't get a pointless single-item "Leagues" heading.
function groupCompetitionsByRegionThenCategory(sportCompetitions) {
  return ['KENYA', 'GLOBAL']
    .map((region) => ({ region, items: sportCompetitions.filter((c) => c.region === region) }))
    .filter((s) => s.items.length)
    .map((s) => ({
      ...s,
      categories: CATEGORY_ORDER
        .map((category) => ({ category, items: s.items.filter((c) => c.category === category) }))
        .filter((c) => c.items.length),
    }));
}

// Compact preview — competition name + top 5 standings rows (position/team/
// played/points only, no GD, to stay narrow) + a link into the full table.
// Deliberately its own class, not a reuse of .data-table (site.css's
// full-standings table has min-width:560px for its own .table-wrap
// horizontal-scroll context — reused as-is here it would force scrolling
// inside every card instead of the compact preview this is for).
function miniTableCardHtml(competition) {
  const rows = competition.standings.slice(0, 5);
  return `
    <div class="card mini-table-card">
      <h3 class="card-title">${escapeHtml(competition.name)}</h3>
      ${rows.length ? `
        <table class="mini-table">
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td class="num">${r.position}</td>
                <td>${escapeHtml(r.teamName)}</td>
                <td class="num">${r.played}</td>
                <td class="num"><strong>${r.points}</strong></td>
              </tr>`).join('')}
          </tbody>
        </table>`
        : '<p class="empty-state">No standings yet.</p>'}
      <a class="btn-link" href="/competition.html?slug=${encodeURIComponent(competition.slug)}">View full table →</a>
    </div>`;
}

// Sky Sports-style compact grid — every competition in this (region ×
// category) bucket fetched in parallel and rendered as a mini-table-card,
// not the full stacked-table treatment. Region no longer matters once
// we're inside a single bucket (that split already happened one level up),
// so Kenya and Global competitions render identically here.
async function renderMiniTablesGrid(panelEl, sportCompetitions) {
  panelEl.innerHTML = '<div class="empty-state">Loading…</div>';
  const details = await Promise.all(sportCompetitions.map((c) => fetchCompetitionDetail(c.slug)));
  panelEl.innerHTML = `<div class="card-grid">${details.map(miniTableCardHtml).join('')}</div>`;
}

// Tables tab — each region (Kenya, then Global) keeps its own heading;
// within a region, a category tab bar (category-toggle.js, the site's
// existing shared "pick a category, see its items" component) replaces the
// old plain subheading, but only when the region actually spans more than
// one category (unchanged guard — a sport with just Kenyan leagues still
// doesn't get a pointless single-item "Leagues" pill).
async function renderGroupedCompetitionsPanel(panelEl, sportCompetitions) {
  const sections = groupCompetitionsByRegionThenCategory(sportCompetitions);
  if (!sections.length) {
    panelEl.innerHTML = '<p class="empty-state">No competitions added for this sport yet.</p>';
    return;
  }

  panelEl.innerHTML = sections.map((s, i) => `
    <div style="${i > 0 ? 'margin-top:3rem;' : ''}">
      <span class="section-label" style="font-size:1rem;">${escapeHtml(REGION_LABELS[s.region])}</span>
      <div data-region-panel="${s.region}"></div>
    </div>`).join('');

  await Promise.all(sections.map(async ({ region, categories }) => {
    const regionEl = panelEl.querySelector(`[data-region-panel="${region}"]`);

    if (categories.length > 1) {
      renderCategoryToggle({
        container: regionEl,
        categories: categories.map(({ category, items }) => ({ key: category, label: CATEGORY_LABELS[category], items })),
        renderItem: () => '', // unused — afterRender does the real rendering, same pattern as this file's own sport-level toggle
        afterRender: (toggledPanelEl, category) => {
          renderMiniTablesGrid(toggledPanelEl, category.items).catch((err) => {
            toggledPanelEl.innerHTML = `<p class="empty-state">Could not load tables: ${escapeHtml(err.message)}</p>`;
          });
        },
      });
    } else {
      await renderMiniTablesGrid(regionEl, categories[0].items);
    }
  }));
}

// Card-grid version (Competitions tab — "browse what exists," not full
// tables/fixtures) — synchronous, no per-competition detail fetch needed.
function renderGroupedCompetitionCards(panelEl, sportCompetitions) {
  const sections = groupCompetitionsByRegionThenCategory(sportCompetitions);
  if (!sections.length) {
    panelEl.innerHTML = '<p class="empty-state">No competitions added for this sport yet.</p>';
    return;
  }

  panelEl.innerHTML = sections.map((s, i) => {
    const showCategoryHeadings = s.categories.length > 1;
    const catSections = s.categories.map(({ category, items }) => `
      <div style="margin-top:1.5rem;">
        ${showCategoryHeadings ? `<span class="section-label" style="font-size:0.75rem; opacity:0.75;">${escapeHtml(CATEGORY_LABELS[category])}</span>` : ''}
        <div class="card-grid">${items.map(competitionCardHtml).join('')}</div>
      </div>`).join('');
    return `
      <div style="${i > 0 ? 'margin-top:3rem;' : ''}">
        <span class="section-label" style="font-size:1rem;">${escapeHtml(REGION_LABELS[s.region])}</span>
        ${catSections}
      </div>`;
  }).join('');
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
