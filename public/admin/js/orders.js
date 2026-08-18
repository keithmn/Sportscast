function orderRowHtml(order) {
  const itemsSummary = order.items
    .map((i) => `${escapeHtml(i.kit.team.name)} ${escapeHtml(i.kit.label)}${i.size ? ` (${escapeHtml(i.size)})` : ''} ×${i.quantity}`)
    .join(', ');
  return `
    <tr>
      <td>${formatDate(order.createdAt)}</td>
      <td>${escapeHtml(order.customerName)}<br><span style="color:var(--text-secondary); font-size:var(--text-micro);">${escapeHtml(order.customerEmail)} · ${escapeHtml(order.customerPhone)}</span></td>
      <td>${escapeHtml(itemsSummary)}</td>
      <td class="num">KES ${Number(order.totalKesCents / 100).toLocaleString()}</td>
      <td><span class="status-badge ${order.status === 'PAID' ? 'published' : ''}">${escapeHtml(order.status)}</span></td>
    </tr>`;
}

async function loadOrders() {
  const { orders } = await api('/api/orders');
  const root = document.getElementById('orders-root');
  if (!orders.length) {
    root.innerHTML = '<p class="empty-state">No orders yet.</p>';
    return;
  }
  root.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Customer</th><th>Items</th><th class="num">Total</th><th>Status</th></tr></thead>
        <tbody>${orders.map(orderRowHtml).join('')}</tbody>
      </table>
    </div>`;
}

async function initOrdersPage() {
  const user = await requireLogin();
  if (!user) return;

  if (!canManageArticles(user)) {
    document.getElementById('access-denied').style.display = 'block';
    return;
  }
  document.getElementById('orders-root').style.display = 'block';
  loadOrders().catch((err) => {
    document.getElementById('orders-root').innerHTML = `<div class="empty-state">Could not load orders: ${escapeHtml(err.message)}</div>`;
  });
}

initOrdersPage();
