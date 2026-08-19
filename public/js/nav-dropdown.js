// Shared by the main nav's Sports/Scores/Kits items (site.js's renderNav())
// — all three drop the same list of active sports, differing only in
// which hub tab a click lands on. Opens on hover (desktop, via CSS) or
// click/keyboard (touch — CSS :hover doesn't fire there).

function navDropdownTriggerHtml(key, label) {
  return `
    <li class="nav-dropdown" data-nav-dropdown-key="${key}">
      <button type="button" class="nav-dropdown-trigger" aria-haspopup="true" aria-expanded="false">${escapeHtml(label)}</button>
      <div class="nav-dropdown-panel"><p class="empty-state" style="padding:0.75rem 1rem; margin:0;">Loading…</p></div>
    </li>`;
}

function sportDropdownLinksHtml(sports, tab) {
  if (!sports.length) return '<p class="empty-state" style="padding:0.75rem 1rem; margin:0;">No sports live yet.</p>';
  const suffix = tab ? `&tab=${encodeURIComponent(tab)}` : '';
  return sports.map((s) => `<a href="/sport.html?sport=${encodeURIComponent(s.slug)}${suffix}">${escapeHtml(s.name)}</a>`).join('');
}

// Populates every nav dropdown panel with the same active-sports list,
// each pointed at a different hub tab via `tabByKey`.
async function loadNavDropdowns(navEl, tabByKey) {
  const { sports } = await api('/api/sports');
  const activeSports = sports.filter((s) => s.isActive);

  navEl.querySelectorAll('[data-nav-dropdown-key]').forEach((li) => {
    const key = li.dataset.navDropdownKey;
    li.querySelector('.nav-dropdown-panel').innerHTML = sportDropdownLinksHtml(activeSports, tabByKey[key]);
  });
}

// Click/keyboard toggle for touch devices — CSS :hover/:focus-within
// handles desktop, this just adds a second way in and closes on outside
// click so it doesn't stay stuck open on a tap-and-scroll.
function wireNavDropdownToggles(navEl) {
  navEl.querySelectorAll('.nav-dropdown').forEach((li) => {
    const trigger = li.querySelector('.nav-dropdown-trigger');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = li.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(isOpen));
      navEl.querySelectorAll('.nav-dropdown').forEach((other) => {
        if (other !== li) {
          other.classList.remove('open');
          other.querySelector('.nav-dropdown-trigger').setAttribute('aria-expanded', 'false');
        }
      });
    });
  });

  document.addEventListener('click', () => {
    navEl.querySelectorAll('.nav-dropdown.open').forEach((li) => {
      li.classList.remove('open');
      li.querySelector('.nav-dropdown-trigger').setAttribute('aria-expanded', 'false');
    });
  });
}
