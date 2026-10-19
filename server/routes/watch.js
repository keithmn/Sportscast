// X watch — internal dashboard API (see the WatchedAccount comment in
// prisma/schema.prisma and scripts/x-watch/README.md). Two kinds of caller:
//   - the watcher script on an editor's machine, authenticated by the
//     WATCH_INGEST_TOKEN header (it has no session): reads the account
//     list, reports posts and its own status;
//   - editors in the admin (session, ADMIN/EDITOR): everything else.
// Nothing here is public.

const crypto = require('crypto');
const express = require('express');
const prisma = require('../db');
const { isEditor, requireRole } = require('../middleware/auth');
const { parsePost } = require('../lib/postParser');
const { annotatePosts } = require('../lib/watchMatching');
const { analysePost } = require('../lib/watchAi');

const router = express.Router();

const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const STATUS_URL_RE = /^https:\/\/(x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/;

function tokenOk(req) {
  const expected = process.env.WATCH_INGEST_TOKEN || '';
  const given = String(req.get('x-watch-token') || '');
  if (expected.length < 24 || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// The watcher (token) or an editor (session).
function watcherOrEditor(req, res, next) {
  if (tokenOk(req) || isEditor(req)) return next();
  return res.status(401).json({ error: 'Needs an editor session or the watcher token' });
}

// ---- Accounts ----
router.get('/accounts', watcherOrEditor, async (req, res) => {
  const accounts = await prisma.watchedAccount.findMany({
    where: tokenOk(req) && !isEditor(req) ? { isActive: true } : {},
    orderBy: { handle: 'asc' },
    include: { _count: { select: { posts: true } } },
  });
  res.json({ accounts });
});

router.post('/accounts', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const handle = String(req.body.handle || '').trim().replace(/^@/, '');
  if (!HANDLE_RE.test(handle)) return res.status(400).json({ error: 'An X handle is 1-15 letters, numbers or underscores' });
  const displayName = String(req.body.displayName || '').trim().slice(0, 80) || null;
  const existing = await prisma.watchedAccount.findUnique({ where: { handle: handle.toLowerCase() } });
  if (existing) return res.status(409).json({ error: `@${handle} is already on the watch list` });
  const account = await prisma.watchedAccount.create({ data: { handle: handle.toLowerCase(), displayName } });
  res.status(201).json({ account });
});

router.put('/accounts/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  if (typeof req.body.isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false' });
  const account = await prisma.watchedAccount.update({ where: { id: req.params.id }, data: { isActive: req.body.isActive } });
  res.json({ account });
});

// ---- Watcher reports ----
// Body: { handle, status: 'OK'|'BLOCKED'|'ERROR', error?, posts?: [{ url, text, postedAt, isRepost }] }
router.post('/ingest', watcherOrEditor, async (req, res) => {
  const handle = String(req.body.handle || '').trim().replace(/^@/, '').toLowerCase();
  const account = await prisma.watchedAccount.findUnique({ where: { handle } });
  if (!account) return res.status(404).json({ error: `@${handle} is not on the watch list` });

  const status = ['OK', 'BLOCKED', 'ERROR'].includes(req.body.status) ? req.body.status : 'OK';
  const posts = Array.isArray(req.body.posts) ? req.body.posts.slice(0, 50) : [];
  let created = 0;
  const rejected = [];
  for (const p of posts) {
    const url = String(p.url || '');
    const m = url.match(STATUS_URL_RE);
    const text = String(p.text || '').slice(0, 4000);
    if (!m || !text.trim()) { rejected.push(url || '(no url)'); continue; }
    const postedAt = p.postedAt && !Number.isNaN(new Date(p.postedAt).getTime()) ? new Date(p.postedAt) : null;
    const existing = await prisma.watchedPost.findUnique({ where: { postId: m[3] } });
    if (existing) continue; // a post doesn't change once fetched; an editor's AI re-read stays
    const { kind, items } = parsePost(text);
    await prisma.watchedPost.create({
      data: {
        accountId: account.id,
        postId: m[3],
        url: `https://x.com/${m[2]}/status/${m[3]}`,
        text,
        postedAt,
        isRepost: Boolean(p.isRepost),
        kind,
        items: JSON.stringify(items),
      },
    });
    created += 1;
  }
  await prisma.watchedAccount.update({
    where: { id: account.id },
    data: { lastCheckedAt: new Date(), lastStatus: status, lastError: status === 'OK' ? null : String(req.body.error || '').slice(0, 300) || null },
  });
  res.json({ created, rejected });
});

// ---- Dashboard ----
// ?status=NEW|DONE|DISMISSED|all (default NEW), ?attention=1 for only the
// posts that disagree with us or that we're behind on.
router.get('/posts', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const status = req.query.status || 'NEW';
  const rows = await prisma.watchedPost.findMany({
    where: status === 'all' ? {} : { status },
    include: { account: { select: { handle: true, displayName: true } } },
    orderBy: [{ postedAt: 'desc' }, { fetchedAt: 'desc' }],
    take: 200,
  });
  let posts = await annotatePosts(rows);
  if (req.query.attention === '1') posts = posts.filter((p) => ['DIFFERS', 'NOT_ENTERED', 'NO_FIXTURE'].includes(p.verdict));
  res.json({ posts });
});

router.put('/posts/:id', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  if (!['NEW', 'DONE', 'DISMISSED'].includes(req.body.status)) return res.status(400).json({ error: 'status must be NEW, DONE or DISMISSED' });
  const post = await prisma.watchedPost.update({ where: { id: req.params.id }, data: { status: req.body.status } });
  res.json({ post });
});

// "Ask Claude" — on demand only.
router.post('/posts/:id/analyse', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const post = await prisma.watchedPost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: 'Post not found' });
  try {
    const { kind, items, aiNote } = await analysePost(post.text);
    const updated = await prisma.watchedPost.update({
      where: { id: post.id },
      data: { kind, items: JSON.stringify(items), aiNote, parsedBy: 'AI' },
      include: { account: { select: { handle: true, displayName: true } } },
    });
    const [annotated] = await annotatePosts([updated]);
    res.json({ post: annotated });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message });
  }
});

module.exports = router;
