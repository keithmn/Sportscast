function kesFromCents(cents) {
  return Number(cents / 100).toLocaleString();
}

// Kits lookbook (2026-08-19): display-only for now — no price, no Add to
// Cart. The commercial checkout underneath (Order/OrderItem, orders.js,
// cart.js) is untouched and easy to re-enable later; this is a front-end
// descope, not a rebuild. See BLUEPRINT.md.
function kitTileHtml(kit, teamName) {
  return `
    <div class="kit-tile" data-kit-id="${kit.id}">
      ${kit.photoUrl
        ? `<img class="kit-tile-photo" src="${escapeHtml(kit.photoUrl)}" alt="${escapeHtml(kit.label)}" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'kit-tile-photo-empty', textContent:'Kit photo to be added'}))">`
        : `<div class="kit-tile-photo-empty">Kit photo to be added</div>`}
      <div class="kit-tile-label">${escapeHtml(kit.label)}</div>
    </div>`;
}

// Gallery card (2026-08-19): kits render up-front, grouped by league —
// no click-to-expand. This is the pitch surface for the "we'll merchandise
// this for a kickback" business conversation with clubs, so every kit
// needs to be visible without an extra step, not tucked behind a click.
function teamGalleryCardHtml(team) {
  return `
    <div class="card team-card">
      <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.25rem;">
        ${team.crestUrl ? `<img class="team-crest" src="${escapeHtml(team.crestUrl)}" alt="" onerror="this.remove()" style="margin-bottom:0;">` : ''}
        <h3 class="card-title">${escapeHtml(team.name)}</h3>
      </div>
      ${team.kits.length
        ? `<div class="kit-grid">${team.kits.map((k) => kitTileHtml(k, team.name)).join('')}</div>`
        : '<p class="empty-state">No kits added for this team yet.</p>'}
    </div>`;
}

// Groups by league within a sport (Kenyan Premier League clubs together,
// National Super League clubs together, ...) — same grouping shape as
// clubs.js's renderClubsSportPanel. A team with no league set (leagueId
// null) falls into a plain "Other" bucket rather than being dropped.
function renderTeamGrid(panelEl, teams) {
  if (!teams.length) {
    panelEl.innerHTML = '<p class="empty-state">No teams added for this sport yet.</p>';
    return;
  }

  const byLeague = new Map();
  teams.forEach((t) => {
    const key = t.league ? t.league.slug : '__other__';
    const label = t.league ? t.league.name : 'Other';
    if (!byLeague.has(key)) byLeague.set(key, { label, teams: [] });
    byLeague.get(key).teams.push(t);
  });

  panelEl.innerHTML = Array.from(byLeague.values()).map(({ label, teams }) => `
    <div style="margin-bottom:2.5rem;">
      <span class="section-label">${escapeHtml(label)}</span>
      <div class="card-grid">${teams.map(teamGalleryCardHtml).join('')}</div>
    </div>`).join('');
}

async function loadShop() {
  const root = document.getElementById('shop-root');
  const { teams } = await api('/api/shop/teams');

  if (!teams.length) {
    root.innerHTML = '<p class="empty-state">No teams added to the shop yet.</p>';
    return;
  }

  const bySport = new Map();
  teams.forEach((t) => {
    if (!bySport.has(t.sport.slug)) bySport.set(t.sport.slug, { label: t.sport.name, teams: [] });
    bySport.get(t.sport.slug).teams.push(t);
  });
  const categories = Array.from(bySport, ([key, { label, teams }]) => ({ key, label, items: teams }));

  renderCategoryToggle({
    container: root,
    categories,
    renderItem: () => '', // the sport panel renders its own team grid via afterRender
    afterRender: (panelEl, category) => {
      renderTeamGrid(panelEl, category.items);
    },
  });
}

// ---------------- Cart + checkout ----------------

function cartRowHtml(item) {
  return `
    <div class="fixture-row" data-cart-kit-id="${escapeHtml(item.kitId)}" data-cart-size="${escapeHtml(item.size || '')}">
      <span class="fixture-teams">${escapeHtml(item.teamName)} — ${escapeHtml(item.label)}${item.size ? ` (${escapeHtml(item.size)})` : ''} × ${item.quantity}</span>
      <span>
        <span class="fixture-meta">KES ${kesFromCents(item.priceKesCents * item.quantity)}</span>
        <button type="button" class="btn-outline-sm remove-cart-item-btn" style="margin-left:0.75rem; color:var(--danger); border-color:var(--danger);">Remove</button>
      </span>
    </div>`;
}

function renderCart() {
  const root = document.getElementById('cart-root');
  if (!root) return;
  const cart = getCart();

  if (!cart.length) {
    root.innerHTML = `
      <span class="section-label">Your Cart</span>
      <p class="empty-state">Your cart is empty — add a kit above to get started.</p>`;
    return;
  }

  root.innerHTML = `
    <span class="section-label">Your Cart</span>
    <div style="margin-bottom:1.5rem;">${cart.map(cartRowHtml).join('')}</div>
    <p style="font-family:'Montserrat',sans-serif; font-weight:800; font-size:1.25rem; margin-bottom:2rem;">
      Total: KES ${kesFromCents(cartTotalKesCents())}
    </p>

    <span class="section-label">Checkout</span>
    <form id="checkout-form" class="form-grid" style="max-width:480px;">
      <div class="form-field">
        <label for="co-name">Name</label>
        <input type="text" id="co-name" required>
      </div>
      <div class="form-field">
        <label for="co-email">Email</label>
        <input type="email" id="co-email" required>
      </div>
      <div class="form-field">
        <label for="co-phone">Phone (for M-Pesa)</label>
        <input type="tel" id="co-phone" placeholder="0712345678" required>
      </div>
      <button type="submit" class="btn-red" style="width:fit-content;">Pay Now — KES ${kesFromCents(cartTotalKesCents())}</button>
      <p class="form-error" id="checkout-error" style="display:none;"></p>
    </form>`;

  root.querySelectorAll('.remove-cart-item-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('[data-cart-kit-id]');
      removeFromCart(row.dataset.cartKitId, row.dataset.cartSize || null);
      renderCart();
    });
  });

  document.getElementById('checkout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('checkout-error');
    errorEl.style.display = 'none';
    const customerName = document.getElementById('co-name').value.trim();
    const customerEmail = document.getElementById('co-email').value.trim();
    const customerPhone = document.getElementById('co-phone').value.trim();
    const items = getCart().map((c) => ({ kitId: c.kitId, size: c.size, quantity: c.quantity }));

    try {
      const { paymentLink } = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ customerName, customerEmail, customerPhone, items }),
      });
      clearCart();
      window.location.href = paymentLink;
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('shop-root')) return;
  loadShop().catch((err) => {
    document.getElementById('shop-root').innerHTML = `<div class="empty-state">Could not load the shop: ${escapeHtml(err.message)}</div>`;
  });
  // renderCart() no longer called — Kits is display-only for now (see
  // kitTileHtml above). Cart/checkout code below stays dormant, not deleted.
});
