// Client-side-only cart (localStorage) — no DB-backed cart model, since
// this is a small single-storefront catalog, not a multi-vendor cart
// system. The server only ever sees a finished checkout attempt (see
// server/routes/orders.js), and re-computes prices from the database
// itself rather than trusting anything stored here.

const CART_KEY = 'sportscast_cart';

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch (err) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

// item: { kitId, teamName, label, priceKesCents, size, quantity }
function addToCart(item) {
  const cart = getCart();
  const existing = cart.find((c) => c.kitId === item.kitId && c.size === item.size);
  if (existing) {
    existing.quantity += item.quantity || 1;
  } else {
    cart.push({ ...item, quantity: item.quantity || 1 });
  }
  saveCart(cart);
  return cart;
}

function removeFromCart(kitId, size) {
  const cart = getCart().filter((c) => !(c.kitId === kitId && c.size === size));
  saveCart(cart);
  return cart;
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
}

function cartTotalKesCents() {
  return getCart().reduce((sum, c) => sum + c.priceKesCents * c.quantity, 0);
}
