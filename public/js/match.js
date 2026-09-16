// match.html's bootstrap (Wave 4 — Match Hub, the one hub this app had
// no detail page for at all before this file).
//
// Canonical Fixture/Match linking (Wave 9 pre-OS refinement §8.2): unlike
// club.js/player.js/competition.js, this page can't offer a name-search
// picker — Fixture has no name field on either side of this ecosystem
// (see UNDERDAWGS_DOMAIN_CONTRACT.md) — so the admin link is built by
// browsing candidates between the fixture's two Clubs' already-linked
// canonical Teams instead (server/routes/competitions.js's canonical-
// fixture-candidates endpoint). This page just reads whatever
// GET /api/fixtures/:id already embeds (fixture.canonicalFixture, fails
// soft to null) and prefers it for status/score when present, always
// falling back to local data — same fail-soft contract as every other
// canonical integration in this app.
// No "Player of the Match" poll either — Poll is Article-scoped only
// (server/routes/polls.js), there's no fixture-scoped poll target to
// reuse; a real addition, not something to bolt on as a fake here.

function teamSideHtml(name, club) {
  if (!club) return `<span class="fixture-teams">${escapeHtml(name)}</span>`;
  return `
    <a href="/club.html?slug=${encodeURIComponent(club.slug)}" style="display:flex; align-items:center; gap:0.5rem; text-decoration:none; color:inherit;">
      ${club.crestUrl ? `<img loading="lazy" src="${escapeHtml(club.crestUrl)}" alt="" style="width:28px; height:28px; object-fit:contain;" onerror="this.remove()">` : ''}
      <span class="fixture-teams">${escapeHtml(name)}</span>
    </a>`;
}

// Real, not fabricated: Competition.source (MANUAL/API/SCRAPED) plus
// externalProvider, the same fields club.js's own "Wikidata · synced…"
// tag already surfaces for API-sourced clubs — same idea, applied here.
function provenanceLineHtml(competition) {
  if (competition.source === 'API') {
    return `<p class="source-note">Source: ${escapeHtml(competition.externalProvider || 'external provider')} (synced)</p>`;
  }
  if (competition.source === 'SCRAPED') {
    return `<p class="source-note">Source: scraped from ${escapeHtml(competition.externalProvider || 'a public source')}</p>`;
  }
  return `<p class="source-note">Source: entered by The Sportscast newsroom</p>`;
}

// Wave 4 — Article.fixtureId (a real, direct link, distinct from the club/
// competition heuristic below). Excluded from "Related Coverage" via the
// Set of ids passed in, since a direct match report shouldn't also appear
// a second time in the generic heuristic list underneath it.
async function loadMatchReports(fixture) {
  const { articles } = await api(`/api/articles?fixture=${encodeURIComponent(fixture.id)}`).catch(() => ({ articles: [] }));
  return articles;
}

async function loadRelatedArticles(fixture, excludeIds) {
  // No direct Article<->Fixture link exists for these (Article tags a Club
  // or Competition, never a specific Fixture) — this is the same honest
  // heuristic club.js's own hub strip already uses: whatever's tagged to
  // either side's Club, or the competition itself, most recent first.
  // Deduped by id since a story could be tagged to both a club and the
  // competition at once.
  const queries = [];
  if (fixture.homeClub) queries.push(api(`/api/articles?club=${encodeURIComponent(fixture.homeClub.slug)}&limit=4`));
  if (fixture.awayClub) queries.push(api(`/api/articles?club=${encodeURIComponent(fixture.awayClub.slug)}&limit=4`));
  queries.push(api(`/api/articles?competition=${encodeURIComponent(fixture.competition.slug)}&limit=4`));

  const results = await Promise.all(queries.map((p) => p.catch(() => ({ articles: [] }))));
  const byId = new Map();
  for (const { articles } of results) {
    for (const a of articles) if (!excludeIds.has(a.id)) byId.set(a.id, a);
  }
  return [...byId.values()].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 4);
}

async function loadMatch() {
  const root = document.getElementById('match-root');
  const id = qs('id');
  if (!id) {
    root.innerHTML = '<p class="empty-state">No match specified.</p>';
    return;
  }

  let fixture;
  try {
    ({ fixture } = await api(`/api/fixtures/${encodeURIComponent(id)}`));
  } catch (err) {
    root.innerHTML = `<p class="empty-state">Match not found.</p>`;
    return;
  }

  document.title = `${fixture.homeTeam}${fixture.awayTeam ? ` vs ${fixture.awayTeam}` : ''} — The Sportscast`;

  // Prefer the canonical Data Platform score once one exists there — it's
  // the verified, source-tracked record; local score stays the fallback
  // whenever no canonical link exists yet, or the Data Platform hasn't
  // recorded a result on its side either. Deliberately NOT swapping in
  // the canonical `status` string for the status badge below — the two
  // platforms' FixtureStatus enums differ (this app has LIVE/FINISHED,
  // the Data Platform has PLAYED/CANCELLED, no LIVE) and this app's own
  // CSS classes (.fixture-status.FINISHED etc.) are keyed to its own
  // vocabulary; the status badge stays local, only the score is shared.
  const canonical = fixture.canonicalFixture;
  const canonicalHasScore = canonical && (canonical.homeScore != null || canonical.awayScore != null);
  const hasRealScore = canonicalHasScore || fixture.homeScore != null || fixture.awayScore != null;
  const displayHomeScore = canonicalHasScore ? canonical.homeScore : fixture.homeScore;
  const displayAwayScore = canonicalHasScore ? canonical.awayScore : fixture.awayScore;
  const scoreHtml = (canonicalHasScore || fixture.status === 'FINISHED') && hasRealScore
    ? `<p style="font-size:2rem; font-weight:800; margin:1rem 0;">${displayHomeScore ?? 0} – ${displayAwayScore ?? 0}</p>
       ${canonicalHasScore ? '<p class="source-note">Verified via the Underdawgs Sports Data platform</p>' : ''}`
    : `<p class="empty-state">${fixture.status === 'POSTPONED' ? 'Postponed' : 'No result yet'}</p>`;

  const postponedNote = fixture.status === 'POSTPONED' && fixture.originalKickoff
    ? `<p class="source-note">Was ${formatDate(fixture.originalKickoff)} — now ${formatDate(fixture.kickoff)}</p>`
    : '';

  root.innerHTML = `
    <span class="card-eyebrow">${escapeHtml(fixture.competition.sport.name)}</span>
    <p class="sub" style="margin-top:0.5rem;">
      <a href="/competition.html?slug=${encodeURIComponent(fixture.competition.slug)}">${escapeHtml(fixture.competition.name)}</a>
    </p>

    <div style="display:flex; align-items:center; justify-content:space-between; gap:1.5rem; flex-wrap:wrap; margin-top:1rem;">
      ${teamSideHtml(fixture.homeTeam, fixture.homeClub)}
      ${fixture.awayTeam ? '<span style="font-weight:700; color:var(--text-secondary);">vs</span>' : ''}
      ${fixture.awayTeam ? teamSideHtml(fixture.awayTeam, fixture.awayClub) : ''}
    </div>

    ${scoreHtml}
    <p class="sub">${formatDate(fixture.kickoff)} · <span class="fixture-status ${escapeHtml(fixture.status)}">${escapeHtml(fixture.status)}</span></p>
    ${postponedNote}
    ${provenanceLineHtml(fixture.competition)}

    <div style="margin-top:2rem;" id="match-report-root"></div>

    <div style="margin-top:2rem;" id="related-articles-root">
      <span class="section-label">Related Coverage</span>
      <div class="empty-state">Loading…</div>
    </div>`;

  const matchReports = await loadMatchReports(fixture);
  const matchReportEl = document.getElementById('match-report-root');
  if (matchReports.length) {
    matchReportEl.innerHTML = `
      <span class="section-label">Match Report</span>
      <div class="card-grid">${matchReports.map(articleCardHtml).join('')}</div>`;
  }

  const related = await loadRelatedArticles(fixture, new Set(matchReports.map((a) => a.id)));
  const relatedEl = document.getElementById('related-articles-root');
  relatedEl.innerHTML = `
    <span class="section-label">Related Coverage</span>
    ${related.length
      ? `<div class="card-grid">${related.map(articleCardHtml).join('')}</div>`
      : '<p class="empty-state">No stories or episodes tagged to this match yet.</p>'}`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadMatch().catch((err) => {
    document.getElementById('match-root').innerHTML = `<div class="empty-state">Could not load this match: ${escapeHtml(err.message)}</div>`;
  });
});
