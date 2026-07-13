const express = require('express');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_TYPES = ['CONTACT', 'TIP', 'PARTNERSHIP', 'SHOP_INTEREST'];

// ---- Public: submit a contact message, tip, partnership inquiry, or shop-waitlist signup ----
router.post('/', async (req, res) => {
  const { type, name, email, message } = req.body;
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid submission type' });
  if (!email) return res.status(400).json({ error: 'email is required' });

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
