// Lightweight, no-account "Follow" system — team/player/competition
// preferences stored in the visitor's own browser (localStorage), not on
// the server. No visitor accounts exist yet; this is deliberately the
// cheapest version of "follow what you care about" so the interaction
// pattern (and its markup/data attributes) can carry over unchanged if it
// ever becomes a real authenticated preference later.
//
// Usage: followButtonHtml('club', club.slug, club.name, `/club.html?slug=${club.slug}`)
// dropped into any header; the delegated click listener at the bottom of
// this file handles every follow button on the page, no per-button wiring
// needed by the caller.

const FOLLOWS_KEY = 'sc_follows_v1';

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
});
