// The Flutterwave redirect back to this page is a UX convenience, not proof
// of payment — the webhook (server/routes/orders.js) is what actually flips
// an order to PAID. This page polls the order's real status rather than
// trusting the redirect alone, since the webhook can arrive a moment later
// (or, rarely, not at all if something goes wrong on Flutterwave's side).

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20; // ~1 minute of polling before giving up and saying so

function orderItemRowHtml(item) {
  return `
    <div class="fixture-row">
      <span class="fixture-teams">${escapeHtml(item.kit.team.name)} — ${escapeHtml(item.kit.label)}${item.size ? ` (${escapeHtml(item.size)})` : ''} × ${item.quantity}</span>
      <span class="fixture-meta">KES ${Number((item.unitPriceKesCents * item.quantity) / 100).toLocaleString()}</span>
    </div>`;
}

function statusMessageHtml(order) {
  if (order.status === 'PAID') {
    return `
      <div class="contact-success" style="max-width:100%;">
        <h3>Payment received.</h3>
        <p>Thanks, ${escapeHtml(order.customerName)} — your order is confirmed. A confirmation has been sent to ${escapeHtml(order.customerEmail)}.</p>
      </div>`;
  }
  if (order.status === 'FAILED') {
    return `<div class="form-error" style="font-size:1rem;">Payment did not go through. Nothing was charged — you can try again from the Shop.</div>`;
  }
  return `<div class="empty-state">Waiting for payment confirmation… this updates automatically.</div>`;
}

async function pollOrder(orderId, attempt = 0) {
  const root = document.getElementById('confirmation-root');
  let order;
  try {
    ({ order } = await api(`/api/orders/${encodeURIComponent(orderId)}`));
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Could not find this order: ${escapeHtml(err.message)}</div>`;
    return;
  }

  root.innerHTML = `
    ${statusMessageHtml(order)}
    <div style="margin-top:2rem;">
      <span class="section-label">Order ${escapeHtml(order.id)}</span>
      ${order.items.map(orderItemRowHtml).join('')}
      <p style="font-family:'Montserrat',sans-serif; font-weight:800; font-size:1.15rem; margin-top:1rem;">
        Total: KES ${Number(order.totalKesCents / 100).toLocaleString()}
      </p>
    </div>`;

  if (order.status === 'PENDING' && attempt < MAX_POLLS) {
    setTimeout(() => pollOrder(orderId, attempt + 1), POLL_INTERVAL_MS);
  } else if (order.status === 'PENDING') {
    root.insertAdjacentHTML('beforeend', '<p class="empty-state" style="margin-top:1rem;">Still waiting — if this doesn\'t update soon, contact us from the footer with your order number.</p>');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const orderId = qs('orderId');
  if (!orderId) {
    document.getElementById('confirmation-root').innerHTML = '<div class="empty-state">No order specified.</div>';
    return;
  }
  pollOrder(orderId);
});
