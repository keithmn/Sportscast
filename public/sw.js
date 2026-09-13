// PWA foundation (gap: Mobile/PWA Strategy, tagged DEFER PWA in the 2026-09
// remediation audit) — deliberately minimal. This is NOT an offline-first
// app: sports scores/articles change constantly, and this site has no
// asset-versioning scheme (no hashed filenames, no cache-busting query
// strings), so anything dynamic staying network-only is a safety choice,
// not an oversight.
//
// Scope is "/" (this file's own location), which means it's active for
// EVERY same-origin request including /admin/* pages that also load
// site.js (see the registration call there) — the explicit bypasses below
// are what keep this from ever intercepting an API call or admin page.
//
// What this actually does: stale-while-revalidate for the small set of
// truly static, rarely-changing brand/style assets, so repeat visits pay
// less network cost and the site keeps working (for already-visited
// static assets only) on a flaky connection. Everything else — API calls,
// admin, and every HTML document/navigation — always goes to the network,
// so a visitor is never shown stale sports data or a stale page shell.

const CACHE_NAME = 'sportscast-static-v1';
const STATIC_PATH_RE = /^\/(css\/|js\/|brand\/|manifest\.json$)/;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return; // never intercept writes
  if (url.origin !== self.location.origin) return; // Google Fonts etc. — leave to the browser's own cache
  if (!STATIC_PATH_RE.test(url.pathname)) return; // /api/*, /admin/*, every HTML document, everything else — network only

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached); // offline and never cached before: this just fails, same as without a service worker
      return cached || networkFetch;
    })
  );
});
