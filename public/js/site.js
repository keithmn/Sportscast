// Shared helpers used across the public site pages.

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function readTime(body) {
  const words = (body || '').trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? '1 month ago' : `${months} months ago`;
}

// Shared by both shows.html (shows.js) and the homepage (home.js): fetches
// each show card's latest episode and injects a "Episode 023 · 3 days ago"
// badge, or removes the badge slot if the show has no episodes yet.
async function loadLatestBadges(container) {
  const cards = container.querySelectorAll('[data-video-series]');
  await Promise.all(Array.from(cards).map(async (card) => {
    const badge = card.querySelector('[data-latest-badge]');
    if (!badge) return;
    try {
      const { articles } = await api(`/api/articles?contentType=VIDEO_POST&videoSeries=${encodeURIComponent(card.dataset.videoSeries)}&limit=1`);
      if (articles.length) {
        const ep = articles[0];
        badge.textContent = `${ep.episodeLabel || 'Latest'} · ${relativeTime(ep.publishedAt)}`;
      } else {
        badge.remove();
      }
    } catch (err) {
      badge.remove();
    }
  }));
}

function formatMoney(amount, currency) {
  if (amount == null) return '—';
  return `${currency || ''} ${Number(amount).toLocaleString()}`.trim();
}

function confidencePill(confidence) {
  const cls = (confidence || '').toLowerCase();
  return `<span class="pill ${cls}">${escapeHtml(confidence || 'Unverified')}</span>`;
}

const NAV_LINKS = [
  { href: '/index.html', label: 'Home' },
  { href: '/shows.html', label: 'Shows' },
  { href: '/news.html', label: 'News & Articles' },
  { href: '/scores.html', label: 'Scores & Fixtures' },
  { href: '/shop.html', label: 'Shop' },
  { href: '/index.html#about', label: 'Contact' },
];

function renderNav(activeHref) {
  const el = document.getElementById('nav-placeholder');
  if (!el) return;
  el.innerHTML = `
    <nav class="nav">
      <a href="/index.html" class="nav-logo" aria-label="The Sportscast — Home">
        <span class="logo-wrap">
          <span class="nav-logo-mark">THE SPORTSCAST</span>
          <span class="logo-badge"><span class="logo-badge-by">by</span><span class="logo-badge-brand">Underdawgs</span></span>
        </span>
      </a>
      <ul class="nav-links" role="list">
        ${NAV_LINKS.map((l) => `<li><a href="${l.href}" class="${activeHref === l.href ? 'active' : ''}">${l.label}</a></li>`).join('')}
      </ul>
    </nav>`;
}

function renderFooter() {
  const el = document.getElementById('footer-placeholder');
  if (!el) return;
  el.innerHTML = `
    <footer class="footer-simple">
      <div class="container">&copy; 2026 The Sportscast, by Underdawgs. Where Kenyan sports live.</div>
    </footer>`;
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  renderFooter();
});
