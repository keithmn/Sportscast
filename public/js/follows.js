// Lightweight, no-account "Follow" system — team/player/competition
// preferences stored in the visitor's own browser (localStorage) for
// instant, no-network reads, AND mirrored to the server (server/routes/
// follows.js, Follow model) so they survive a storage wipe. No visitor
// accounts exist yet — anonymousId identifies a device, not a person, and
// is generated once per browser, never derived from anything identifying.
// The interaction pattern (and its markup/data attributes) is unchanged
// from the original localStorage-only version, so this can carry over
// unchanged again if it ever becomes a real authenticated preference.
//
// Usage: followButtonHtml('club', club.slug, club.name, `/club.html?slug=${club.slug}`)
// dropped into any header; the delegated click listener at the bottom of
// this file handles every follow button on the page, no per-button wiring
// needed by the caller.

const FOLLOWS_KEY = 'sc_follows_v1';
const ANON_ID_KEY = 'sc_anon_id_v1';

function getAnonymousId() {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g, '');
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return null; // private browsing / storage disabled — sync is skipped, local-only behavior unchanged
  }
}

// Fire-and-forget: a slow/offline/blocked request must never delay or
// break the instant local toggle above it — this is a durability mirror,
// not the source of truth for the current page's UI.
function syncFollowToServer(nowFollowing, type, slug, name, href) {
  const anonymousId = getAnonymousId();
  if (!anonymousId) return;
  if (nowFollowing) {
    api('/api/follows', { method: 'POST', body: JSON.stringify({ anonymousId, entityType: type, entitySlug: slug, name, href }) }).catch(() => {});
  } else {
    api('/api/follows', { method: 'DELETE', body: JSON.stringify({ anonymousId, entityType: type, entitySlug: slug }) }).catch(() => {});
  }
}

function getFollows() {
  try {
    const raw = localStorage.getItem(FOLLOWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFollows(follows) {
  try {
    localStorage.setItem(FOLLOWS_KEY, JSON.stringify(follows));
  } catch {
    // Private browsing / storage disabled — the button just won't persist
    // across reloads. Not worth surfacing an error to the visitor for this.
  }
}

function isFollowed(type, slug) {
  return getFollows().some((f) => f.type === type && f.slug === slug);
}

// Returns the new state (true = now following) so a caller can update its
// own UI immediately without re-reading storage.
function toggleFollow(type, slug, name, href) {
  const follows = getFollows();
  const idx = follows.findIndex((f) => f.type === type && f.slug === slug);
  if (idx >= 0) {
    follows.splice(idx, 1);
    saveFollows(follows);
    return false;
  }
  follows.push({ type, slug, name, href });
  saveFollows(follows);
  return true;
}

function followButtonHtml(type, slug, name, href) {
  const following = isFollowed(type, slug);
  return `<button type="button" class="follow-btn${following ? ' following' : ''}"
    data-follow-type="${escapeHtml(type)}" data-follow-slug="${escapeHtml(slug)}"
    data-follow-name="${escapeHtml(name)}" data-follow-href="${escapeHtml(href)}">${following ? 'Following' : 'Follow'}</button>`;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.follow-btn');
  if (!btn) return;
  const { followType, followSlug, followName, followHref } = btn.dataset;
  const nowFollowing = toggleFollow(followType, followSlug, followName, followHref);
  btn.classList.toggle('following', nowFollowing);
  btn.textContent = nowFollowing ? 'Following' : 'Follow';
  syncFollowToServer(nowFollowing, followType, followSlug, followName, followHref);
});
