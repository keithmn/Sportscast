const express = require('express');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_TYPES = ['CONTACT', 'TIP', 'PARTNERSHIP', 'SHOP_INTEREST', 'NEWSLETTER'];

// ---- Public: submit a contact message, tip, partnership inquiry, shop-waitlist
// signup, or newsletter signup ----
router.post('/', async (req, res) => {
  const { type, name, email, message } = req.body;
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid submission type' });
  if (!email) return res.status(400).json({ error: 'email is required' });

  // A newsletter signup is a single yes/no relationship, not an incremental
  // message like a Contact/Tip/Partnership row — resubmitting the same
  // email (double-click, revisit) should be idempotent rather than
  // quietly duplicating rows on whatever list eventually gets built from
  // this table.
  if (type === 'NEWSLETTER') {
    const existing = await prisma.submission.findFirst({ where: { type: 'NEWSLETTER', email } });
    if (existing) return res.status(201).json({ submission: existing });
  }

  const submission = await prisma.submission.create({
    data: { type, name: name || null, email, message: message || null },
  });
  res.status(201).json({ submission });
});

// ---- Admin: list all submissions ----
router.get('/', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const submissions = await prisma.submission.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ submissions });
});

// ---- Admin: mark reviewed ----
router.put('/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { status } = req.body;
  const submission = await prisma.submission.update({
    where: { id: req.params.id },
    data: { status: status === 'REVIEWED' ? 'REVIEWED' : 'NEW' },
  });
  res.json({ submission });
});

module.exports = router;
