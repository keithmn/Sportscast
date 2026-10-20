// The newsroom menu — one definition for every admin page (2026-10-19).
// It used to be hand-copied into each HTML file, so pages drifted apart
// (a link added to some pages and not others). Each page now carries an
// empty <aside class="admin-sidebar" id="admin-nav"> and loads this file
// before guard.js, which wires the "Log out" link.
//
// Grouped by the editor's job. On phones the menu is a scrolling strip
// across the top (site.css), and the group labels are hidden there.

const ADMIN_NAV = [
  { items: [{ href: '/admin/dashboard.html', label: 'Dashboard' }] },
  { label: 'Match day', items: [
    { href: '/admin/results.html', label: 'Results' },
    { href: '/admin/competitions.html', label: 'Competitions' },
  ] },
  { label: 'Stories', items: [
    { href: '/admin/articles.html', label: 'Articles' },
    { href: '/admin/submissions.html', label: 'Submissions' },
  ] },
  { label: 'Leads', items: [
    { href: '/admin/monitoring.html', label: 'Monitoring' },
    { href: '/admin/watch.html', label: 'X Watch' },
    { href: '/admin/sources.html', label: 'Sources' },
  ] },
  { label: 'Setup', items: [
    { href: '/admin/clubs.html', label: 'Clubs & Players' },
    { href: '/admin/sports.html', label: 'Sports' },
  ] },
];

function renderAdminNav() {
  const aside = document.getElementById('admin-nav');
  if (!aside) return;
  const here = window.location.pathname;
  const link = ({ href, label }) => `<a href="${href}"${href === here ? ' class="active" aria-current="page"' : ''}>${escapeHtml(label)}</a>`;
  aside.innerHTML = `
    <div class="nav-logo admin-nav-logo">
      <div><img src="/brand/logo/lockup-lower-black.png" alt="The Sportscast" style="height:26px; width:auto; display:block;"><span class="admin-nav-sub">Newsroom</span></div>
    </div>
    ${ADMIN_NAV.map((group) => `
      ${group.label ? `<span class="admin-nav-group">${escapeHtml(group.label)}</span>` : ''}
      ${group.items.map(link).join('')}`).join('')}
    <span class="admin-nav-group">Site</span>
    <a href="/index.html">View site</a>
    <a href="#" id="logout-link">Log out</a>`;
}

renderAdminNav();
