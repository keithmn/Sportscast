// Lightweight fan engagement (e.g. "Player of the Match") — see the Poll
// model's schema comment. Voting is anonymous (Follow's same anonymousId
// scheme, a device token not an account); one vote per poll per device,
// enforced at the DB level (PollVote's unique constraint), not just here.

const express = require('express');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const ANON_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function validId(anonymousId) {
  return typeof anonymousId === 'string' && ANON_ID_RE.test(anonymousId);
}

function serializePoll(poll, anonymousId) {
  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);
  const myVote = anonymousId ? poll.votes.find((v) => v.anonymousId === anonymousId) : null;
  return {
    id: poll.id,
    question: poll.question,
    totalVotes,
    myOptionId: myVote ? myVote.pollOptionId : null,
    options: poll.options.map((o) => ({ id: o.id, label: o.label, votes: o.votes.length })),
  };
}

router.get('/articles/:articleId/poll', async (req, res) => {
  const { anonymousId } = req.query;
  const poll = await prisma.poll.findUnique({
    where: { articleId: req.params.articleId },
    include: { options: { include: { votes: true } }, votes: true },
  });
  if (!poll) return res.json({ poll: null });
  res.json({ poll: serializePoll(poll, typeof anonymousId === 'string' ? anonymousId : null) });
});

router.post('/articles/:articleId/poll', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { question, options } = req.body || {};
  if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: 'question is required' });
  if (!Array.isArray(options) || options.length < 2 || options.some((o) => typeof o !== 'string' || !o.trim())) {
    return res.status(400).json({ error: 'options must be an array of at least 2 non-empty labels' });
  }

  const article = await prisma.article.findUnique({ where: { id: req.params.articleId } });
  if (!article) return res.status(404).json({ error: 'Article not found' });

  const existing = await prisma.poll.findUnique({ where: { articleId: article.id } });
  if (existing) return res.status(409).json({ error: 'This article already has a poll — delete it first to replace it' });

  const poll = await prisma.poll.create({
    data: {
      articleId: article.id,
      question: question.trim(),
      options: { create: options.map((label) => ({ label: label.trim() })) },
    },
    include: { options: { include: { votes: true } }, votes: true },
  });
  res.status(201).json({ poll: serializePoll(poll, null) });
});

router.delete('/articles/:articleId/poll', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await prisma.poll.deleteMany({ where: { articleId: req.params.articleId } });
  res.json({ ok: true });
});

router.post('/polls/:pollId/vote', async (req, res) => {
  const { anonymousId, pollOptionId } = req.body || {};
  if (!validId(anonymousId)) return res.status(400).json({ error: 'A valid anonymousId is required' });
  if (typeof pollOptionId !== 'string' || !pollOptionId) return res.status(400).json({ error: 'pollOptionId is required' });

  const option = await prisma.pollOption.findUnique({ where: { id: pollOptionId } });
  if (!option || option.pollId !== req.params.pollId) {
    return res.status(404).json({ error: 'That option does not belong to this poll' });
  }

  const vote = await prisma.pollVote
    .create({ data: { pollId: req.params.pollId, pollOptionId, anonymousId } })
    .catch((err) => {
      if (err.code === 'P2002') return null; // unique constraint — already voted
      throw err;
    });
  if (!vote) return res.status(409).json({ error: 'This device has already voted in this poll' });

  const poll = await prisma.poll.findUnique({
    where: { id: req.params.pollId },
    include: { options: { include: { votes: true } }, votes: true },
  });
  res.status(201).json({ poll: serializePoll(poll, anonymousId) });
});

module.exports = router;
