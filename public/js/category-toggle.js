// Shared "pick a category, see its items" toggle — used by Shows (sport →
// shows), Scores & Fixtures (sport → league), and Shop (sport → team).
// Top level reuses the exact filter-pill mechanism already built for News
// (news.js): a delegated click listener, single-select .active swap. The
// nested items panel underneath the active pill is the one genuinely new
// piece — built once here rather than three times in each consuming page.
//
// Usage:
//   renderCategoryToggle({
//     container: document.getElementById('...'),
//     categories: [{ key, label, items: [...] }, ...],
//     renderItem: (item) => '<div>...</div>',   // returns one item's HTML
//     defaultKey: 'kenya',                       // optional — pill open on first render
//     afterRender: (panelEl, category) => {},    // optional — runs after each (re)render, e.g. to fetch per-item badges/data
//   });

function renderCategoryToggle({ container, categories, renderItem, defaultKey, afterRender }) {
  if (!container) return;

  const pillsHtml = categories
    .map((c) => `<button class="filter-pill" data-key="${escapeHtml(c.key)}">${escapeHtml(c.label)}</button>`)
    .join('');

  container.innerHTML = `
    <div class="filter-row" data-toggle-pills></div>
    <div data-toggle-panels></div>`;

  const pillsEl = container.querySelector('[data-toggle-pills]');
  const panelsEl = container.querySelector('[data-toggle-panels]');
  pillsEl.innerHTML = pillsHtml;

  function renderPanel(category) {
    panelsEl.innerHTML = `
      <div class="toggle-panel open">
        ${category.items.map((item) => `<div class="toggle-panel-item">${renderItem(item)}</div>`).join('')}
      </div>`;
    if (afterRender) afterRender(panelsEl.querySelector('.toggle-panel'), category);
  }

  function open(key) {
    const category = categories.find((c) => c.key === key);
    if (!category) return;
    pillsEl.querySelectorAll('.filter-pill').forEach((p) => p.classList.toggle('active', p.dataset.key === key));
    renderPanel(category);
  }

  pillsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    open(btn.dataset.key);
  });

  const initialKey = (defaultKey && categories.some((c) => c.key === defaultKey)) ? defaultKey : categories[0]?.key;
  if (initialKey) open(initialKey);
}
