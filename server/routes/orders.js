// Checkout — Flutterwave (card + M-Pesa in one integration, per the
// client's choice). Cart lives client-side only (public/js/cart.js,
// localStorage); this route only ever sees a finished checkout attempt.
//
// Needs FLW_SECRET_KEY (and FLW_SECRET_HASH for the webhook) in .env —
// sign up free at https://dashboard.flutterwave.com/signup, use the test/
// sandbox keys from Settings > API Keys to begin with. Nothing here can be
// tested end-to-end without those; POST / will fail loudly (not silently
// fake success) if FLW_SECRET_KEY is missing.

const express = require('express');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const FLW_BASE = 'https://api.flutterwave.com/v3';

function siteBaseUrl(req) {
  return process.env.SITE_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

// ---- Public: create an order, initiate a Flutterwave payment, return the
// hosted checkout link the browser should redirect to. ----
router.post('/', async (req, res) => {
  const { customerName, customerEmail, customerPhone, items } = req.body;
  if (!customerName || !customerEmail || !customerPhone) {
    return res.status(400).json({ error: 'customerName, customerEmail, and customerPhone are required' });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }

  const kitIds = items.map((i) => i.kitId);
  const kits = await prisma.kit.findMany({ where: { id: { in: kitIds }, active: true }, include: { team: true } });
  const kitById = new Map(kits.map((k) => [k.id, k]));

  // Prices are computed from the database, never trusted from the client —
  // a tampered client-sent price is simply ignored.
  const orderItemsData = [];
  let totalKesCents = 0;
  for (const item of items) {
    const kit = kitById.get(item.kitId);
    if (!kit) return res.status(400).json({ error: `Kit ${item.kitId} not found or inactive` });
    const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
    totalKesCents += kit.priceKesCents * quantity;
    orderItemsData.push({
      kitId: kit.id,
      size: item.size || null,
      quantity,
      unitPriceKesCents: kit.priceKesCents,
    });
  }

  const order = await prisma.order.create({
    data: {
      customerName,
      customerEmail,
      customerPhone,
      totalKesCents,
      items: { create: orderItemsData },
    },
    include: { items: { include: { kit: { include: { team: true } } } } },
  });

  if (!process.env.FLW_SECRET_KEY) {
    return res.status(500).json({
      error: 'Payment is not configured yet (FLW_SECRET_KEY missing) — the order was saved as PENDING but no payment link could be created.',
      order,
    });
  }

  try {
    const flwRes = await fetch(`${FLW_BASE}/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: order.id,
        amount: (totalKesCents / 100).toFixed(2),
        currency: 'KES',
        redirect_url: `${siteBaseUrl(req)}/order-confirmation.html?orderId=${order.id}`,
        customer: { email: customerEmail, phonenumber: customerPhone, name: customerName },
        customizations: { title: 'The Sportscast Shop', description: `Order ${order.id}` },
      }),
    });
    const flwData = await flwRes.json();
    if (!flwRes.ok || flwData.status !== 'success') {
      throw new Error(flwData.message || `Flutterwave responded ${flwRes.status}`);
    }
    res.status(201).json({ order, paymentLink: flwData.data.link });
  } catch (err) {
    console.error('[orders] Flutterwave initiation failed:', err.message);
    res.status(502).json({ error: `Could not start payment: ${err.message}`, order });
  }
});

// ---- Flutterwave webhook — the authoritative source of truth for payment
// status, not the browser redirect (which can be spoofed or interrupted).
// Verifies the "verif-hash" header against FLW_SECRET_HASH before trusting
// anything in the body. ----
router.post('/webhook', async (req, res) => {
  const signature = req.headers['verif-hash'];
  if (!process.env.FLW_SECRET_HASH || signature !== process.env.FLW_SECRET_HASH) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  const txRef = event?.data?.tx_ref;
  if (!txRef) return res.status(400).json({ error: 'Missing tx_ref' });

  const order = await prisma.order.findUnique({ where: { id: txRef } });
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const status = event.data.status === 'successful' ? 'PAID' : 'FAILED';
  await prisma.order.update({
    where: { id: order.id },
    data: { status, paymentRef: String(event.data.id ?? '') },
  });

  res.json({ ok: true });
});

// ---- Public: order status, for the confirmation page to poll ----
router.get('/:id', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: { include: { kit: { include: { team: true } } } } },
  });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order });
});

// ---- Admin: list orders ----
router.get('/', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const orders = await prisma.order.findMany({
    include: { items: { include: { kit: { include: { team: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ orders });
});

module.exports = router;
