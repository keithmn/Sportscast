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

// News and Clubs dropped 2026-08-19 — they live inside each sport's own
// hub now (Home | News | Watch | Scores & Fixtures | Teams tabs), rather
// than being re-selected per top-level page. Sports/Scores/Kits are
// dropdowns (see nav-dropdown.js) that jump straight into a sport's hub,
// each opened on a different tab — Watch stays a plain link since it
// isn't sport-hub-scoped content in the same way.
const NAV_LINKS = [
  { type: 'link', href: '/index.html', label: 'Home' },
  { type: 'dropdown', key: 'sports', label: 'Sports', tab: null },
  { type: 'link', href: '/shows.html', label: 'Watch' },
  { type: 'dropdown', key: 'scores', label: 'Scores', tab: 'scores' },
  { type: 'dropdown', key: 'kits', label: 'Kits', tab: 'shop' },
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
        ${NAV_LINKS.map((l) => l.type === 'dropdown'
          ? navDropdownTriggerHtml(l.key, l.label)
          : `<li><a href="${l.href}" class="${activeHref === l.href ? 'active' : ''}">${l.label}</a></li>`
        ).join('')}
      </ul>
    </nav>`;

  const navEl = el.querySelector('.nav-links');
  wireNavDropdownToggles(navEl);
  const tabByKey = Object.fromEntries(NAV_LINKS.filter((l) => l.type === 'dropdown').map((l) => [l.key, l.tab]));
  loadNavDropdowns(navEl, tabByKey).catch((err) => console.warn('Could not load nav dropdowns:', err));
}

// Consolidated 2026-08-19: this used to be a bare one-line copyright bar
// used by every page except index.html, which hardcoded its own richer
// footer (logo, socials, footer-nav) — now every page gets the same rich
// footer, and Contact/Tip/Partnership (previously index.html's #about
// section) is folded in here too, since Contact dropped out of the
// top-level nav.
function renderFooter() {
  const el = document.getElementById('footer-placeholder');
  if (!el) return;
  el.innerHTML = `
    <footer class="footer" aria-label="Site footer">
      <div class="container">
        <div class="footer-top">
          <div>
            <span class="logo-wrap">
              <a href="/" class="footer-logo">The Sportscast</a>
              <span class="logo-badge"><span class="logo-badge-by">by</span><span class="logo-badge-brand">Underdawgs</span></span>
            </span>
            <span class="footer-tl" style="display:block; margin-top:0.5rem;">Where Kenyan sports live.</span>
          </div>
          <div class="footer-socials" aria-label="Social media links">
            <a href="#" aria-label="Follow us on X"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.836L2.25 2.25h6.977l4.26 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
            <a href="#" aria-label="Watch on YouTube"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>
            <a href="#" aria-label="Follow us on Instagram"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg></a>
            <a href="#" aria-label="Listen on Spotify"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg></a>
          </div>
        </div>

        <div class="footer-contact" id="contact">
          <span class="section-label">Get In Touch</span>
          <div class="contact-tabs" role="tablist">
            <button class="contact-tab active" data-type="CONTACT" role="tab" aria-selected="true">Contact</button>
            <button class="contact-tab" data-type="TIP" role="tab" aria-selected="false">Submit a Tip</button>
            <button class="contact-tab" data-type="PARTNERSHIP" role="tab" aria-selected="false">Work With Us</button>
          </div>
          <form class="contact-form" id="contact-form" data-type="CONTACT">
            <div class="form-row">
              <div class="form-field">
                <label for="c-name">Name</label>
                <input type="text" id="c-name" required>
              </div>
              <div class="form-field">
                <label for="c-email">Email</label>
                <input type="email" id="c-email" required>
              </div>
            </div>
            <div class="form-field">
              <label for="c-message" id="c-message-label">Message</label>
              <textarea id="c-message" rows="5" required></textarea>
            </div>
            <button type="submit" class="btn-red" style="width:fit-content;">Send</button>
            <p class="form-error" id="contact-error" style="display:none;"></p>
          </form>
          <div class="contact-success" id="contact-success" style="display:none;">
            <h3>Message received.</h3>
            <p id="contact-success-text"></p>
          </div>
        </div>

        <nav class="footer-nav" aria-label="Footer navigation">
          <a href="/">Home</a>
          <a href="/sports.html">Sports</a>
          <a href="/shows.html">Watch</a>
          <a href="/show.html?slug=the-sportscast">The Sportscast</a>
          <a href="/scores.html">Scores &amp; Fixtures</a>
          <a href="/shop.html">Kits</a>
          <a href="/admin/index.html">Newsroom Login</a>
        </nav>

        <div class="footer-bottom">
          <span class="footer-copy">&copy; 2026 The Sportscast, by Underdawgs. All rights reserved.</span>
          <span class="footer-echo">Where Kenyan Sports Live.</span>
        </div>
      </div>
    </footer>`;
}

// Contact / Submit a Tip / Work With Us — one form, three tabs, each tab
// just changes what "type" gets submitted and what the message field is
// asking for. Relocated 2026-08-19 from home.js into the shared footer
// (previously homepage-only, under the old #about section).
const CONTACT_TAB_COPY = {
  CONTACT: { label: 'Message', success: 'Thanks — we\'ll get back to you soon.' },
  TIP: { label: 'What\'s the story?', success: 'Thanks for the tip — our newsroom will take a look.' },
  PARTNERSHIP: { label: 'Tell us about your brand or partnership idea', success: 'Thanks — our team will follow up about working together.' },
};

function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const tabs = document.querySelectorAll('.contact-tab');
  const messageLabel = document.getElementById('c-message-label');
  const errorEl = document.getElementById('contact-error');
  const successEl = document.getElementById('contact-success');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      form.dataset.type = tab.dataset.type;
      messageLabel.textContent = CONTACT_TAB_COPY[tab.dataset.type].label;
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    const type = form.dataset.type;
    const name = document.getElementById('c-name').value.trim();
    const email = document.getElementById('c-email').value.trim();
    const message = document.getElementById('c-message').value.trim();
    try {
      await api('/api/submissions', { method: 'POST', body: JSON.stringify({ type, name, email, message }) });
      form.style.display = 'none';
      document.getElementById('contact-success-text').textContent = CONTACT_TAB_COPY[type].success;
      successEl.style.display = 'block';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  renderFooter();
  initContactForm();
});
