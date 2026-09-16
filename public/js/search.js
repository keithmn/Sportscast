// search.html's bootstrap. Wave 4 — this app had no public search page at
// all before this file; see server/routes/publicSearch.js for the API
// side and why Fixture/match search isn't included yet.
const SEARCH_SECTIONS = [
  { key: 'articles', label: 'Stories', hrefPrefix: '/article.html?slug=' },
  { key: 'shows', label: 'Shows', hrefPrefix: '/show.html?slug=' },
  { key: 'clubs', label: 'Teams', hrefPrefix: '/club.html?slug=' },
  { key: 'players', label: 'Players', hrefPrefix: '/player.html?slug=' },
  { key: 'competitions', label: 'Competitions', hrefPrefix: '/competition.html?slug=' },
];

function searchResultRowHtml(item, hrefPrefix) {
  return `
    <li>
      <a href="${hrefPrefix}${encodeURIComponent(item.slug)}">${escapeHtml(item.name)}</a>
      ${item.sportName ? `<span class="meta"> · ${escapeHtml(item.sportName)}</span>` : ''}
      ${item.isVideo ? '<span class="pill" style="margin-left:0.4rem;">Video</span>' : ''}
    </li>`;
}

// Wave 9 §8.3 — canonical (Data Platform) results have no local page to
// link to, unlike the site-content sections above — plain labeled text,
// not a link, same "don't link what doesn't resolve" precedent already
// used for local Athlete/Venue results (no detail route exists for
// either here). Clearly tagged "Sports Data" so a reader never confuses
// it for this site's own content.
function canonicalResultRowHtml(item) {
  return `<li>${escapeHtml(item.name)}${item.sportName ? `<span class="meta"> · ${escapeHtml(item.sportName)}</span>` : ''}</li>`;
}

const CANONICAL_SEARCH_SECTIONS = [
  { key: 'teams', label: 'Teams (Sports Data)' },
  { key: 'athletes', label: 'Athletes (Sports Data)' },
  { key: 'competitions', label: 'Competitions (Sports Data)' },
];

async function loadSearch() {
  const root = document.getElementById('search-results');
  const q = qs('q');

  document.getElementById('search-input').value = q || '';

  if (!q) {
    root.innerHTML = '<p class="empty-state">Enter a search term above.</p>';
    return;
  }
  // Checked here too, not just server-side — catches this before it ever
  // becomes an API round trip that would otherwise come back as a 400
  // and get shown as a generic "unavailable" message, which would be a
  // misleading answer to a validation problem, not a real outage.
  if (q.trim().length < 2) {
    root.innerHTML = '<p class="empty-state">Type at least 2 characters to search.</p>';
    return;
  }

  document.title = `Search: ${q} — The Sportscast`;
  root.innerHTML = '<div class="empty-state">Searching…</div>';

  let results = {};
  try {
    ({ results } = await api(`/api/search?q=${encodeURIComponent(q)}`));
  } catch (err) {
    // The real message, not a hardcoded guess — this is either a genuine
    // fetch failure (err.message from the browser, e.g. "Failed to
    // fetch") or the server's own validation message; either way it's
    // more honest than assuming "temporarily unavailable" for both.
    root.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    return;
  }

  const localCount = SEARCH_SECTIONS.reduce((sum, s) => sum + (results[s.key]?.length ?? 0), 0);
  const canonicalCount = CANONICAL_SEARCH_SECTIONS.reduce((sum, s) => sum + (results.canonical?.[s.key]?.length ?? 0), 0);

  if (localCount === 0 && canonicalCount === 0) {
    root.innerHTML = `<p class="empty-state">No matches found for &ldquo;${escapeHtml(q)}&rdquo;.</p>`;
    return;
  }

  const localHtml = SEARCH_SECTIONS
    .map(({ key, label, hrefPrefix }) => {
      const items = results[key];
      if (!items || items.length === 0) return '';
      return `
        <section style="margin-bottom:2rem;">
          <span class="section-label">${label}</span>
          <ul>${items.map((item) => searchResultRowHtml(item, hrefPrefix)).join('')}</ul>
        </section>`;
    })
    .join('');

  // results.canonical is null when the Data Platform had nothing to
  // offer OR was unreachable — indistinguishable to this page on purpose
  // (server/routes/publicSearch.js's fail-soft contract), and correctly
  // so: a reader searching sees "no canonical matches," not an alarming
  // "Sports Data is down" message for what's very likely just no results.
  const canonicalHtml = CANONICAL_SEARCH_SECTIONS
    .map(({ key, label }) => {
      const items = results.canonical?.[key];
      if (!items || items.length === 0) return '';
      return `
        <section style="margin-bottom:2rem;">
          <span class="section-label">${label}</span>
          <ul>${items.map(canonicalResultRowHtml).join('')}</ul>
        </section>`;
    })
    .join('');

  root.innerHTML = localHtml + canonicalHtml;
}

document.addEventListener('DOMContentLoaded', () => {
  loadSearch().catch((err) => {
    document.getElementById('search-results').innerHTML = `<div class="empty-state">Could not load search results: ${escapeHtml(err.message)}</div>`;
  });
});
