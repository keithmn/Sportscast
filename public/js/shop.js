function kesFromCents(cents) {
  return Number(cents / 100).toLocaleString();
}

function kitTileHtml(kit, teamName) {
  const sizes = (kit.sizesAvailable || '').split(',').map((s) => s.trim()).filter(Boolean);
  return `
    <div class="kit-tile" data-kit-id="${kit.id}">
      ${kit.photoUrl
        ? `<img class="kit-tile-photo" src="${escapeHtml(kit.photoUrl)}" alt="${escapeHtml(kit.label)}" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'kit-tile-photo-empty', textContent:'Kit photo to be added'}))">`
        : `<div class="kit-tile-photo-empty">Kit photo to be added</div>`}
      <div class="kit-tile-label">${escapeHtml(kit.label)}</div>
      <div class="kit-tile-price">KES ${kesFromCents(kit.priceKesCents)}</div>
      ${sizes.length ? `
        <select class="kit-size-select" style="margin-top:0.5rem; width:100%;">
          ${sizes.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
        </select>` : ''}
      <button type="button" class="btn-outline-sm add-to-cart-btn" style="margin-top:0.6rem; width:100%;"
        data-kit-id="${kit.id}" data-team-name="${escapeHtml(teamName)}" data-label="${escapeHtml(kit.label)}" data-price="${kit.priceKesCents}">
        Add to Cart
      </button>
    </div>`;
}

function teamCardHtml(team) {
  return `
    <div class="card team-card" data-team-card data-slug="${escapeHtml(team.slug)}">
      ${team.crestUrl ? `<img class="team-crest" src="${escapeHtml(team.crestUrl)}" alt="" onerror="this.remove()">` : ''}
      <span class="card-eyebrow">${escapeHtml(team.sport.name)}</span>
      <h3 class="card-title">${escapeHtml(team.name)}</h3>
      <div class="kit-grid" data-kit-grid style="display:none;"></div>
    </div>`;
}

function wireAddToCartButtons(container) {
  container.querySelectorAll('.add-to-cart-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // don't also collapse the team card's kit grid
      const tile = btn.closest('.kit-tile');
      const sizeSelect = tile.querySelector('.kit-size-select');
      addToCart({
        kitId: btn.dataset.kitId,
        teamName: btn.dataset.teamName,
        label: btn.dataset.label,
        priceKesCents: Number(btn.dataset.price),
        size: sizeSelect ? sizeSelect.value : null,
      });
      renderCart();
      btn.textContent = 'Added ✓';
      setTimeout(() => { btn.textContent = 'Add to Cart'; }, 1200);
    });
  });
}

async function loadTeamKits(container, slug) {
  container.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const { team } = await api(`/api/shop/teams/${encodeURIComponent(slug)}`);
    container.innerHTML = team.kits.length
      ? team.kits.map((k) => kitTileHtml(k, team.name)).join('')
      : '<p class="empty-state">No kits added for this team yet.</p>';
    wireAddToCartButtons(container);
  } catch (err) {
    container.innerHTML = `<p class="empty-state">Could not load kits: ${escapeHtml(err.message)}</p>`;
  }
}

function renderTeamGrid(panelEl, teams) {
  if (!teams.length) {
    panelEl.innerHTML = '<p class="empty-state">No teams added for this sport yet.</p>';
    return;
  }
  panelEl.innerHTML = `<div class="card-grid">${teams.map(teamCardHtml).join('')}</div>`;

  panelEl.querySelectorAll('[data-team-card]').forEach((card) => {
    card.addEventListener('click', () => {
      const grid = card.querySelector('[data-kit-grid]');
      const isOpen = grid.style.display !== 'none';
      if (isOpen) {
        grid.style.display = 'none';
        return;
      }
      grid.style.display = 'grid';
      if (!grid.dataset.loaded) {
        grid.dataset.loaded = 'true';
        loadTeamKits(grid, card.dataset.slug);
      }
    });
  });
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
    <p style="font-family:'Barlow Condensed',sans-serif; font-weight:800; font-size:1.25rem; margin-bottom:2rem;">
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
  loadShop().catch((err) => {
    document.getElementById('shop-root').innerHTML = `<div class="empty-state">Could not load the shop: ${escapeHtml(err.message)}</div>`;
  });
  renderCart();
});
