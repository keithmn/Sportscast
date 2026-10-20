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

// Basketball and rugby score points, not goals — label the columns to
// match (StandingRow's goalsFor/goalsAgainst hold either).
const POINTS_SCORING_SPORTS = new Set(['basketball', 'rugby']);

// Mirrors server/lib/pointsRules.js — the sports whose table points
// follow a fixed rule from W/D/L. Used only to flag rows where the
// official points differ (a deduction or award by the league), never to
// change them.
const TABLE_POINTS_RULES = { football: { win: 3, draw: 1, loss: 0 }, hockey: { win: 3, draw: 1, loss: 0 } };

function pointsAdjustment(row, sportSlug) {
  const rule = TABLE_POINTS_RULES[sportSlug];
  if (!rule || row.played !== row.won + row.drawn + row.lost) return 0;
  return row.points - (row.won * rule.win + row.drawn * rule.draw + row.lost * rule.loss);
}

// "Final table · 2025/26" above a table whose season is over — a past
// season, or the current one after its end date — so a finished table
// isn't read as the live one (the NSL showed last season's final table as
// "current"). Planned seasons are never shown publicly.
function seasonTableLabel(detail) {
  const seasons = detail.seasons || [];
  const season = seasons.find((x) => x.id === detail.viewingSeasonId) || seasons.find((x) => x.isCurrent);
  if (!season) return '';
  const ended = !season.isCurrent || (season.endsOn && new Date(season.endsOn).getTime() < Date.now());
  return ended
    ? `<p class="season-table-label"><strong>Final table</strong> · ${escapeHtml(season.label)}</p>`
    : (season.label && season.label !== 'Current Season' ? `<p class="season-table-label">${escapeHtml(season.label)}</p>` : '');
}

function standingsTableHtml(standings, sportSlug) {
  if (!standings.length) {
    return '<p class="empty-state">Standings haven\'t been entered for this competition yet.</p>';
  }
  const scoredPoints = POINTS_SCORING_SPORTS.has(sportSlug);
  const basketball = sportSlug === 'basketball';
  // Basketball tables are often published as win-loss only; when no row
  // has a points-for/against figure, leave those columns out rather than
  // show zeros as if they were real. Only basketball — a football or hockey
  // table really can be all zeros (before the first goal of a season).
  const hasScoring = !basketball || standings.some((r) => r.goalsFor || r.goalsAgainst);
  // `col-detail` columns drop out on phones (see .standings-table in
  // site.css): Sky Sports' mobile tables keep Pos/Team/P/GD/Pts. A
  // basketball table is read by wins and losses, so W/L stay visible there.
  const cols = [
    { head: '#', cls: 'num', cell: (r) => r.position },
    { head: 'Team', cls: 'team', cell: (r) => escapeHtml(r.teamName) },
    // In basketball P is just W + L, so phones drop it to give names room.
    { head: 'P', cls: basketball ? 'num col-detail' : 'num', cell: (r) => r.played },
    { head: 'W', cls: basketball ? 'num' : 'num col-detail', cell: (r) => r.won },
    ...(basketball ? [] : [{ head: 'D', cls: 'num col-detail', cell: (r) => r.drawn }]),
    { head: 'L', cls: basketball ? 'num' : 'num col-detail', cell: (r) => r.lost },
    ...(hasScoring ? [
      { head: scoredPoints ? 'PF-PA' : 'GF-GA', cls: 'num col-detail', cell: (r) => `${r.goalsFor}-${r.goalsAgainst}` },
      { head: scoredPoints ? 'PD' : 'GD', cls: 'num', cell: (r) => { const d = r.goalsFor - r.goalsAgainst; return `${d > 0 ? '+' : ''}${d}`; } },
    ] : []),
    { head: 'Pts', cls: 'num', cell: (r) => `<strong>${r.points}</strong>${pointsAdjustment(r, sportSlug) ? '<sup class="pts-adj" aria-hidden="true">*</sup>' : ''}` },
  ];
  const adjusted = standings
    .map((r) => ({ name: r.teamName, adj: pointsAdjustment(r, sportSlug) }))
    .filter((r) => r.adj);
  const adjustmentNote = adjusted.length
    ? `<p class="source-note pts-adj-note">* Points differ from the win/draw record — usually a deduction or award by the league: ${adjusted.map((r) => `${escapeHtml(r.name)} ${r.adj > 0 ? '+' : '−'}${Math.abs(r.adj)}`).join(', ')}.</p>`
    : '';
  const th = cols.map((c) => `<th class="${c.cls === 'team' ? '' : c.cls}">${c.head}</th>`).join('');
  const rows = standings.map((r) => `<tr>${cols.map((c) => `<td class="${c.cls}">${c.cell(r)}</td>`).join('')}</tr>`).join('');
  return `
    <div class="table-wrap">
      <table class="data-table standings-table">
        <thead><tr>${th}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${adjustmentNote}`;
}

function fixtureRowHtml(f) {
  // A "FINISHED" status doesn't always mean a real two-sided score exists —
  // PDC Darts tournament-day events (no awayTeam, see below) come back FT
  // with no score at all, so a 0-0 fallback there would be actively
  // misleading rather than just unknown. Show the date instead whenever
  // there's no real score to show, regardless of status.
  const hasRealScore = f.homeScore != null || f.awayScore != null;
  const scoreOrTime = (f.status === 'FINISHED' || f.status === 'ABANDONED') && hasRealScore
    ? `<span class="fixture-score">${f.homeScore ?? 0} – ${f.awayScore ?? 0}${outcomeText(f) ? ` <span class="fixture-outcome">${escapeHtml(outcomeText(f))}</span>` : ''}</span>`
    : `<span class="fixture-meta">${formatDate(f.kickoff)}</span>`;
  const postponedNote = f.status === 'POSTPONED'
    ? `<div class="fixture-meta" style="margin-top:0.2rem;">${escapeHtml(postponedText(f))}</div>`
    : '';
  // Most fixtures are two-sided (X vs Y); a few synced competitions (PDC
  // Darts tournament-day events) have no real "away" side at all — see
  // syncTheSportsDB.js's 'event' kind — so awayTeam is blank on purpose,
  // not a data error, and just shows the event name alone.
  const teamsLabel = f.awayTeam ? `${escapeHtml(f.homeTeam)} vs ${escapeHtml(f.awayTeam)}` : escapeHtml(f.homeTeam);
  // Wave 4 — every fixture row site-wide now links to its own Match Hub
  // page (this function is shared across club.js/home.js/scores.js/
  // sport.js, so this one change reaches all of them).
  return `
    <a href="/match.html?id=${encodeURIComponent(f.id)}" class="fixture-row" style="flex-wrap:wrap; text-decoration:none; color:inherit;">
      <span class="fixture-teams">${teamsLabel}</span>
      <span>${scoreOrTime}${(() => { const st = fixtureDisplayStatus(f); return `<span class="fixture-status ${escapeHtml(st.key)}">${escapeHtml(st.label)}</span>`; })()}</span>
      ${postponedNote}
      ${(() => { const d = fixtureDetailParts(f); return d.length ? `<div class="fixture-details">${d.map(escapeHtml).join(' · ')}</div>` : ''; })()}
    </a>`;
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
      ${standingsTableHtml(competition.standings, competition.sport?.slug)}
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
        ${standingsTableHtml(competition.standings, competition.sport?.slug)}
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
        <span class="card-eyebrow">${escapeHtml(competitionMetaLine(c))}</span>
        <h3 class="card-title">${escapeHtml(c.name)}</h3>
      </div>
    </a>`;
}

// seasonId is optional — omitted, the server defaults to the competition's
// current season. Only competition.html's own season selector ever passes
// one; every other caller (club.js, sport.js, home page tables) keeps
// getting "whatever's current" exactly as before.
async function fetchCompetitionDetail(slug, seasonId) {
  const qsSeason = seasonId ? `?season=${encodeURIComponent(seasonId)}` : '';
  const { competition } = await api(`/api/competitions/${encodeURIComponent(slug)}${qsSeason}`);
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
  const shown = withData(sportCompetitions).sort(compareMatchday);
  const kenyaCompetitions = shown.filter((c) => c.region === 'KENYA');
  const globalCompetitions = shown.filter((c) => c.region === 'GLOBAL');
  if (!shown.length) {
    panelEl.innerHTML = '<p class="empty-state">No scores or tables for this sport yet.</p>';
    return;
  }

  // Both branches are conditionally rendered — neither shows an "empty"
  // message for a branch that's structurally guaranteed to have nothing
  // (renderGroupedCompetitionsPanel always calls this with an already
  // single-region bucket, where one branch is empty by construction; an
  // "empty" message there would be pure noise, not information).
  const kenyaWithData = kenyaCompetitions.filter((c) => c.hasData !== false);
  const kenyaEmpty = kenyaCompetitions.filter((c) => c.hasData === false);
  panelEl.innerHTML = `
    ${kenyaWithData.length ? '<div data-kenya-competitions></div>' : ''}
    ${kenyaEmpty.length ? `<div style="margin-top:${kenyaWithData.length ? '3rem' : '0'};">${notStartedListHtml(kenyaEmpty, 'More Kenyan competitions — nothing entered yet this season')}</div>` : ''}
    ${globalCompetitions.length ? `<div style="margin-top:3rem;">${collapsedCompetitionsHtml(globalCompetitions)}</div>` : ''}`;

  if (globalCompetitions.length) wireCollapsedCompetitions(panelEl, detailRenderer);

  if (kenyaWithData.length) {
    const kenyaEl = panelEl.querySelector('[data-kenya-competitions]');
    kenyaEl.innerHTML = kenyaWithData.map(() => '<div class="empty-state">Loading…</div>').join('');
    const details = await Promise.all(kenyaWithData.map((c) => fetchCompetitionDetail(c.slug)));
    kenyaEl.innerHTML = details.map(detailRenderer).join('<hr style="border-color:var(--border); margin:2.5rem 0;">');
  }
}

// Kenyan-first tables (2026-10-19): every non-Kenyan competition (Euros,
// World Cup, Six Nations, …) sits collapsed under "Other competitions" —
// a one-line row that loads its table only when tapped — so nothing
// foreign competes with the KPL for the first screen.
function collapsedCompetitionsHtml(competitions) {
  return `
    <span class="section-label">Other competitions</span>
    <div class="collapsed-competitions">
      ${competitions.map((c) => `
        <details class="collapsed-competition" data-slug="${escapeHtml(c.slug)}">
          <summary>
            <span class="collapsed-competition-name">${escapeHtml(c.name)}</span>
            <span class="collapsed-competition-meta">${escapeHtml(competitionMetaLine(c))}</span>
          </summary>
          <div class="collapsed-competition-body"></div>
        </details>`).join('')}
    </div>`;
}

function wireCollapsedCompetitions(rootEl, renderer) {
  rootEl.querySelectorAll('details.collapsed-competition').forEach((el) => {
    el.addEventListener('toggle', async () => {
      const body = el.querySelector('.collapsed-competition-body');
      if (!el.open || body.dataset.loaded) return;
      body.dataset.loaded = '1';
      body.innerHTML = '<div class="empty-state">Loading…</div>';
      try {
        body.innerHTML = renderer(await fetchCompetitionDetail(el.dataset.slug));
      } catch (err) {
        delete body.dataset.loaded;
        body.innerHTML = `<div class="empty-state">Could not load this competition: ${escapeHtml(err.message)}</div>`;
      }
    });
  });
}

// Jurisdictional categorization (2026-10-17). Keys and labels mirror
// JURISDICTIONS / FORMATS / TEAM_TYPES in server/lib/competitionClassification.js,
// which also travel with every /api/competitions response. Order = tab order,
// grassroots up.
const JURISDICTION_ORDER = ['COUNTY', 'SCHOOLS', 'NATIONAL', 'REGIONAL', 'CONTINENTAL', 'GLOBAL'];
const JURISDICTION_LABELS = {
  COUNTY: 'County', SCHOOLS: 'Schools & Universities', NATIONAL: 'National',
  REGIONAL: 'Regional', CONTINENTAL: 'Continental', GLOBAL: 'Global',
};
const FORMAT_ORDER = ['LEAGUE', 'CUP', 'TOURNAMENT'];
const FORMAT_LABELS = { LEAGUE: 'League', CUP: 'Cup', TOURNAMENT: 'Tournament' };
const TEAM_TYPE_LABELS = { CLUB: 'Clubs', NATIONAL_TEAM: 'National teams', INDIVIDUAL: 'Individuals' };
// The level the tabs open on — the Kenyan pyramid's top flight lives here,
// even for a sport that also has county or schools competitions.
const DEFAULT_JURISDICTION = 'NATIONAL';

// Match-day priority, for lists that mix levels (Scores page, the sport
// hub's date strip): Kenyan first, then National → Regional → Continental
// → Global → County → Schools, then league before cup, then tier. So the
// KPL leads, ahead of AFCON qualifiers and the World Cup.
const MATCHDAY_LEVEL_ORDER = ['NATIONAL', 'REGIONAL', 'CONTINENTAL', 'GLOBAL', 'COUNTY', 'SCHOOLS'];
function matchdayRank(c) {
  const level = MATCHDAY_LEVEL_ORDER.indexOf(c.jurisdiction);
  return [c.region === 'KENYA' ? 0 : 1, level === -1 ? 0 : level, FORMAT_ORDER.indexOf(c.format), c.tier == null ? Infinity : c.tier];
}
function compareMatchday(a, b) {
  const ra = matchdayRank(a);
  const rb = matchdayRank(b);
  for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return a.name.localeCompare(b.name);
}

// Fixed sport order for pages that list several sports: Kenya's biggest
// audiences first. Sports not listed follow, alphabetically.
const SPORT_ORDER = ['football', 'rugby', 'athletics', 'basketball', 'volleyball', 'hockey', 'boxing'];
function sportRank(slug) {
  const i = SPORT_ORDER.indexOf(slug);
  return i === -1 ? SPORT_ORDER.length : i;
}

// Which competitions the public lists show (2026-10-19, revised the same
// day): every Kenyan competition, always — an empty one is still a
// Kenyan league readers expect to find (Division One, CHAN, CECAFA…) and
// renders as a compact "no table yet" line, not a big empty block. A
// non-Kenyan competition only shows once its current season has data
// (hasData from /api/competitions). Older responses without the flag
// keep everything.
function withData(competitions) {
  return competitions.filter((c) => c.region === 'KENYA' || c.hasData !== false);
}

// One line for a Kenyan competition with nothing entered this season yet.
function notStartedListHtml(competitions, label) {
  if (!competitions.length) return '';
  return `
    <div class="not-started">
      <span class="section-label">${escapeHtml(label)}</span>
      <div class="not-started-list">
        ${competitions.map((c) => `
          <a class="not-started-item" href="/competition.html?slug=${encodeURIComponent(c.slug)}">
            <span class="not-started-name">${escapeHtml(c.name)}</span>
            <span class="collapsed-competition-meta">${escapeHtml(competitionMetaLine(c))}</span>
          </a>`).join('')}
      </div>
    </div>`;
}

// "CAF · Tournament", or "Continental · Tournament" when the governing body
// isn't recorded.
function competitionMetaLine(c) {
  return [c.governingBody || JURISDICTION_LABELS[c.jurisdiction], FORMAT_LABELS[c.format]].filter(Boolean).join(' · ');
}

// Inside one level: Kenyan competitions first (KPL before the Premier
// League if an editor ever switches that back on, AFCON before the Euros),
// then league → cup → tournament, then down the pyramid by tier (KPL 1,
// NSL 2, Division One 3; no tier last), then by name.
function sortWithinLevel(items, getCompetition) {
  const rank = (c) => [c.region === 'KENYA' ? 0 : 1, FORMAT_ORDER.indexOf(c.format), c.tier == null ? Infinity : c.tier];
  return [...items].sort((a, b) => {
    const ca = getCompetition(a);
    const cb = getCompetition(b);
    const ra = rank(ca);
    const rb = rank(cb);
    for (let i = 0; i < ra.length; i += 1) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return ca.name.localeCompare(cb.name);
  });
}

// Buckets `items` by their competition's jurisdiction, in JURISDICTION_ORDER,
// dropping empty levels — shared by Tables, Competitions, Teams and Players.
// A competition with an unrecognised level falls into National rather than
// disappearing.
function groupByJurisdiction(items, getCompetition = (c) => c) {
  const levelOf = (i) => (JURISDICTION_ORDER.includes(getCompetition(i).jurisdiction) ? getCompetition(i).jurisdiction : DEFAULT_JURISDICTION);
  return JURISDICTION_ORDER
    .map((key) => ({
      key,
      label: JURISDICTION_LABELS[key],
      items: sortWithinLevel(items.filter((i) => levelOf(i) === key), getCompetition),
    }))
    .filter((level) => level.items.length);
}

// One tab per level when a sport spans more than one; a sport with a
// single level (darts) skips the pointless single tab.
function renderByJurisdiction(panelEl, levels, renderLevel) {
  if (levels.length > 1) {
    renderCategoryToggle({
      container: panelEl,
      categories: levels,
      defaultKey: DEFAULT_JURISDICTION,
      renderItem: () => '', // unused — renderLevel does the real rendering
      afterRender: (levelEl, level) => renderLevel(levelEl, level.items),
    });
  } else {
    renderLevel(panelEl, levels[0] ? levels[0].items : []);
  }
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
        : latestResultsHtml(competition)}
      <a class="btn-link" href="/competition.html?slug=${encodeURIComponent(competition.slug)}">${rows.length ? 'View full table →' : 'View competition →'}</a>
    </div>`;
}

// A cup or tournament has no table: its preview shows the latest three
// results (or the next fixtures) instead of "No standings yet".
function latestResultsHtml(competition) {
  const fixtures = competition.fixtures || [];
  const finished = fixtures.filter((f) => f.status === 'FINISHED' && f.homeScore != null).slice(-3).reverse();
  const shown = finished.length ? finished : fixtures.filter((f) => f.status !== 'FINISHED').slice(0, 3);
  if (!shown.length) return '<p class="empty-state">No table yet.</p>';
  return `
    <span class="source-note">${finished.length ? 'Latest results' : 'Next fixtures'}</span>
    <table class="mini-table">
      <tbody>
        ${shown.map((f) => `
          <tr>
            <td>${escapeHtml(f.homeTeam)}</td>
            <td class="num"><strong>${f.status === 'FINISHED' ? `${f.homeScore}–${f.awayScore}` : 'v'}</strong></td>
            <td>${escapeHtml(f.awayTeam || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
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

// Shared by the Teams and Players tabs (subnav.js/clubs.js) — already
// Kenya-only by the time either calls this. Groups `items` by their own
// competition, then those competition-groups by jurisdiction (one tab per
// level), each competition a plain heading over a card-grid of
// `cardRenderer(item)`.
function renderCompetitionCategorizedGrid(panelEl, items, getCompetition, cardRenderer, emptyMessage) {
  if (!items.length) {
    panelEl.innerHTML = `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  const byCompetition = new Map();
  items.forEach((item) => {
    const competition = getCompetition(item);
    if (!byCompetition.has(competition.slug)) byCompetition.set(competition.slug, { competition, items: [] });
    byCompetition.get(competition.slug).items.push(item);
  });
  const levels = groupByJurisdiction(Array.from(byCompetition.values()), (g) => g.competition);

  renderByJurisdiction(panelEl, levels, (el, groups) => {
    el.innerHTML = groups.map(({ competition, items }) => `
      <div style="margin-bottom:2.5rem;">
        <span class="section-label">${escapeHtml(competition.name)}</span>
        <div class="card-grid">${items.map(cardRenderer).join('')}</div>
      </div>`).join('');
  });
}

// Tables tab (2026-10-19, replaces the per-level tabs here): Kenyan
// competitions open, most important first — the lead one (the KPL for
// football) as its full table, the rest as top-five previews — then every
// non-Kenyan table collapsed. The Competitions tab keeps the level headings.
async function renderGroupedCompetitionsPanel(panelEl, sportCompetitions) {
  const shown = withData(sportCompetitions).sort(compareMatchday);
  if (!shown.length) {
    panelEl.innerHTML = '<p class="empty-state">No tables for this sport yet.</p>';
    return;
  }
  // Kenya first: Kenyan tables with data (lead one in full), then every
  // Kenyan competition with no table yet as a compact list, then the
  // non-Kenyan tables collapsed.
  const kenyan = shown.filter((c) => c.region === 'KENYA' && c.hasData !== false);
  const kenyanEmpty = shown.filter((c) => c.region === 'KENYA' && c.hasData === false);
  const others = shown.filter((c) => c.region !== 'KENYA');

  panelEl.innerHTML = `
    ${kenyan.length ? '<div data-kenya-tables><div class="empty-state">Loading…</div></div>' : ''}
    ${kenyanEmpty.length ? `<div style="margin-top:${kenyan.length ? '3rem' : '0'};">${notStartedListHtml(kenyanEmpty, 'More Kenyan competitions — no table yet this season')}</div>` : ''}
    ${others.length ? `<div style="margin-top:${kenyan.length || kenyanEmpty.length ? '3rem' : '0'};">${collapsedCompetitionsHtml(others)}</div>` : ''}`;
  if (others.length) wireCollapsedCompetitions(panelEl, (c) => `${standingsTableHtml(c.standings, c.sport && c.sport.slug)}<a class="btn-link" href="/competition.html?slug=${encodeURIComponent(c.slug)}">View competition →</a>`);

  if (kenyan.length) {
    const el = panelEl.querySelector('[data-kenya-tables]');
    try {
      const details = await Promise.all(kenyan.map((c) => fetchCompetitionDetail(c.slug)));
      const [lead, ...rest] = details;
      el.innerHTML = `
        <div class="lead-table">
          <span class="card-eyebrow">${escapeHtml(competitionMetaLine(lead))}</span>
          <h3 class="card-title" style="margin:0.25rem 0 0.75rem;">${escapeHtml(lead.name)}</h3>
          ${standingsTableHtml(lead.standings, lead.sport && lead.sport.slug)}
          <a class="btn-link" href="/competition.html?slug=${encodeURIComponent(lead.slug)}">Fixtures, results &amp; more →</a>
        </div>
        ${rest.length ? `<div class="card-grid" style="margin-top:2.5rem;">${rest.map(miniTableCardHtml).join('')}</div>` : ''}`;
    } catch (err) {
      el.innerHTML = `<p class="empty-state">Could not load tables: ${escapeHtml(err.message)}</p>`;
    }
  }
}

// Competitions tab ("browse what exists," not full tables/fixtures) —
// every level listed at once as a heading over its cards, so the whole
// pyramid is visible on one screen; synchronous, no detail fetch needed.
function renderGroupedCompetitionCards(panelEl, sportCompetitions) {
  const levels = groupByJurisdiction(withData(sportCompetitions));
  if (!levels.length) {
    panelEl.innerHTML = '<p class="empty-state">No competitions added for this sport yet.</p>';
    return;
  }

  panelEl.innerHTML = levels.map((level, i) => `
    <div class="jurisdiction-level" data-jurisdiction="${level.key}" style="${i > 0 ? 'margin-top:3rem;' : ''}">
      <span class="section-label" style="font-size:1rem;">${escapeHtml(level.label)}</span>
      <div class="card-grid">${level.items.map(competitionCardHtml).join('')}</div>
    </div>`).join('');
}

async function loadScores() {
  const root = document.getElementById('scores-root');
  const { competitions } = await api('/api/competitions');

  if (!competitions.length) {
    root.innerHTML = '<p class="empty-state">No competitions have been added yet.</p>';
    return;
  }

  // Only sports with something to show, in a fixed editorial order —
  // football first. (Sorting by competition alone put basketball first:
  // "KBF Premier League" is alphabetically ahead of "Kenyan Premier League".)
  const bySport = new Map();
  withData(competitions).sort((a, b) => sportRank(a.sport.slug) - sportRank(b.sport.slug) || compareMatchday(a, b)).forEach((c) => {
    if (!bySport.has(c.sport.slug)) bySport.set(c.sport.slug, { label: c.sport.name, competitions: [] });
    bySport.get(c.sport.slug).competitions.push(c);
  });
  const categories = Array.from(bySport, ([key, { label, competitions }]) => ({ key, label, items: competitions }));
  if (!categories.length) {
    root.innerHTML = '<p class="empty-state">No scores or tables have been entered yet.</p>';
    return;
  }

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
