// Shared search-picker widget for admin canonical-mapping links — Club-
// >Team and Player->Athlete (public/admin/js/clubs.js) were the first two
// users; Competition->Competition (public/admin/js/competitions.js) is
// the third, which is what made a shared file worth extracting to rather
// than pasting a third near-copy. Backed by the generic
// /api/canonical-search?type= proxy (server/routes/canonicalSearch.js).
//
// Loaded via <script src="/js/canonicalLinkWidget.js">, same plain-script
// convention as everything else on these pages (no bundler, no modules) —
// must be included after site.js (needs escapeHtml, api) and before
// whichever page script calls these.

const CANONICAL_LINK_KIND_CONFIG = {
  team: {
    label: 'Canonical Team',
    placeholder: 'Search Data Platform teams…',
    displayLine: (c) => `${escapeHtml(c.name)}${c.clubName ? ` — ${escapeHtml(c.clubName)}` : ''}`,
  },
  athlete: {
    label: 'Canonical Athlete',
    placeholder: 'Search Data Platform athletes…',
    displayLine: (c) => `${escapeHtml(c.fullName)}${c.currentTeamName ? ` — ${escapeHtml(c.currentTeamName)}` : ''}`,
  },
  competition: {
    label: 'Canonical Competition',
    placeholder: 'Search Data Platform competitions…',
    displayLine: (c) => `${escapeHtml(c.name)}${c.sportName ? ` — ${escapeHtml(c.sportName)}` : ''}`,
  },
};

function canonicalLinkWidgetHtml(kind, localId, current) {
  const cfg = CANONICAL_LINK_KIND_CONFIG[kind];
  const currentLine = current ? cfg.displayLine(current) : null;
  return `
    <div class="canonical-link-widget" data-kind="${kind}" data-local-id="${localId}" style="margin-top:0.5rem; font-size:var(--text-small);">
      <span style="color:var(--text-secondary);">${cfg.label}:</span>
      ${currentLine
        ? `<span class="pill">${currentLine}</span> <button type="button" class="btn-outline-sm canonical-unlink-btn" style="margin-left:0.35rem; padding:0.15rem 0.5rem;">Unlink</button>`
        : `<span style="color:var(--text-secondary);">not linked</span>`}
      <div style="position:relative; margin-top:0.25rem; max-width:340px;">
        <input type="text" class="canonical-search-input" placeholder="${cfg.placeholder}" style="width:100%; font-size:var(--text-small);" autocomplete="off">
        <div class="canonical-results" style="display:none; position:absolute; z-index:10; width:100%; background:var(--bg-surface); border:1px solid var(--border); border-radius:var(--radius); max-height:180px; overflow-y:auto;"></div>
      </div>
    </div>`;
}

// Wires every `.canonical-link-widget` currently in `root` — call this
// again after any re-render, same "reload and rewire" convention the
// rest of these admin pages already follow (see clubs.js's loadClubs).
// `endpointFor(kind, localId)` returns the page-specific route to PUT/
// DELETE against (e.g. `/api/clubs/${id}/canonical-team`); `onChange` is
// called after a successful link/unlink so the caller can reload its
// own data (each page already has its own reload function, no single
// shared one to call generically).
function wireCanonicalLinkWidgets(root, { endpointFor, onChange }) {
  root.querySelectorAll('.canonical-link-widget').forEach((widget) => {
    const kind = widget.dataset.kind;
    const localId = widget.dataset.localId;
    const input = widget.querySelector('.canonical-search-input');
    const resultsEl = widget.querySelector('.canonical-results');
    let searchToken = 0;

    input.addEventListener('input', (e) => {
      clearTimeout(input._debounceTimer);
      const q = e.target.value;
      input._debounceTimer = setTimeout(async () => {
        const token = ++searchToken;
        if (q.trim().length < 2) {
          resultsEl.style.display = 'none';
          resultsEl.innerHTML = '';
          return;
        }
        const { results } = await api(`/api/canonical-search?type=${kind}&q=${encodeURIComponent(q.trim())}`);
        if (token !== searchToken) return;
        const matches = results[`${kind}s`] || [];
        if (!matches.length) {
          resultsEl.innerHTML = `<div style="padding:0.5rem 0.7rem; color:var(--text-secondary);">No matches found.</div>`;
        } else {
          resultsEl.innerHTML = matches
            .map((m) => `
              <button type="button" class="canonical-result-btn" data-id="${m.id}"
                style="display:block; width:100%; text-align:left; padding:0.5rem 0.7rem; border:none; border-bottom:1px solid var(--border); background:none; cursor:pointer; font-family:inherit; font-size:var(--text-small);">
                ${escapeHtml(m.name)}${m.sportName ? ` <span style="color:var(--text-secondary);">— ${escapeHtml(m.sportName)}</span>` : ''}
              </button>`)
            .join('');
          resultsEl.querySelectorAll('.canonical-result-btn').forEach((resultBtn) => {
            resultBtn.addEventListener('click', async () => {
              const idField = `canonical${kind.charAt(0).toUpperCase()}${kind.slice(1)}Id`;
              await api(endpointFor(kind, localId), { method: 'PUT', body: JSON.stringify({ [idField]: resultBtn.dataset.id }) });
              onChange();
            });
          });
        }
        resultsEl.style.display = 'block';
      }, 300);
    });
  });

  root.querySelectorAll('.canonical-unlink-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const widget = btn.closest('.canonical-link-widget');
      await api(endpointFor(widget.dataset.kind, widget.dataset.localId), { method: 'DELETE' });
      onChange();
    });
  });
}

// Call once per page (not per render) — closes any open results dropdown
// on an outside click. A per-widget listener re-added on every reload
// would stack a new permanent document-level listener each time.
function initCanonicalLinkOutsideClickHandler() {
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.canonical-link-widget').forEach((widget) => {
      if (!widget.contains(e.target)) {
        const resultsEl = widget.querySelector('.canonical-results');
        if (resultsEl) resultsEl.style.display = 'none';
      }
    });
  });
}
