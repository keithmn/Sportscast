// Wave 5 — Content Transformation Engine. Admin-only throughout (no public
// routes here — clips only ever reach the public site once RENDERED, via
// Episode's own include on GET /api/articles/:slug, same as everything
// else about an episode).
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const prisma = require('../db');
const { requireRole } = require('../middleware/auth');
const contentEngine = require('../lib/contentEngine');

// A raw show recording can be hundreds of MB — well above Wave 4's image
// cap (8MB) by design; this is a different kind of upload entirely.
const MAX_RECORDING_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5GB — generous for a ~60min recording at reasonable quality
const ALLOWED_RECORDING_MIMETYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a',
]);

function buildEpisodesRouter(rawRecordingsDir, uploadsDir) {
  const router = express.Router();
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, rawRecordingsDir),
      filename: (req, file, cb) => cb(null, `${req.params.id}${path.extname(file.originalname) || '.mp4'}`),
    }),
    limits: { fileSize: MAX_RECORDING_BYTES },
    fileFilter: (req, file, cb) => cb(null, ALLOWED_RECORDING_MIMETYPES.has(file.mimetype)),
  });

  function findRawRecordingPath(episodeId) {
    const files = fs.readdirSync(rawRecordingsDir).filter((f) => f.startsWith(episodeId));
    return files.length ? path.join(rawRecordingsDir, files[0]) : null;
  }

  // The actual pipeline — runs after the upload response has already been
  // sent (fire-and-forget from the route below), same "never let a slow
  // side-effect block the response" convention as server/lib/push.js.
  // Keeps the raw recording on disk afterward (rendering a clip needs it
  // later, possibly much later — see the render route and
  // server/jobs/cleanupRawRecordings.js for when it actually gets deleted).
  async function processRecording(episodeId, rawFilePath) {
    try {
      const { text, segments } = await contentEngine.transcribeRecording(rawFilePath);
      await prisma.episode.update({
        where: { id: episodeId },
        data: { transcript: text, transcriptSegments: JSON.stringify(segments), transcriptionStatus: 'DONE', transcriptionError: null },
      });

      const suggestions = await contentEngine.suggestClipMoments(segments).catch((err) => {
        console.error('[contentEngine] Clip suggestion failed (transcription still succeeded):', err.message);
        return [];
      });
      if (suggestions.length) {
        await prisma.clip.createMany({
          data: suggestions.map((s) => ({
            episodeId,
            title: s.title,
            startSeconds: s.startSeconds,
            endSeconds: s.endSeconds,
            reason: s.reason,
            source: 'AI_SUGGESTED',
            status: 'SUGGESTED',
          })),
        });
      }
    } catch (err) {
      console.error('[contentEngine] Transcription failed:', err.message);
      await prisma.episode.update({
        where: { id: episodeId },
        data: { transcriptionStatus: 'FAILED', transcriptionError: err.message.slice(0, 500) },
      }).catch(() => {});
    }
  }

  // ---- Upload a raw recording, kick off transcription + AI clip
  // suggestions in the background. Returns immediately (202) — a 45-60min
  // recording can take well over a minute to process, too long to hold a
  // request open on Railway. The admin UI polls GET /:id/status. ----
  router.post('/:id/recording', requireRole('ADMIN', 'EDITOR'), upload.single('recording'), async (req, res) => {
    const episode = await prisma.episode.findUnique({ where: { id: req.params.id } });
    if (!episode) return res.status(404).json({ error: 'Episode not found' });
    if (!req.file) return res.status(400).json({ error: 'No recording file provided (or its type isn\'t a supported video/audio format).' });

    await prisma.episode.update({
      where: { id: req.params.id },
      data: { transcriptionStatus: 'PROCESSING', transcriptionError: null },
    });
    res.status(202).json({ transcriptionStatus: 'PROCESSING' });

    processRecording(req.params.id, req.file.path);
  });

  // Polled by the admin UI while a recording is processing — includes
  // clips so a freshly-finished transcription's AI suggestions show up
  // without the editor needing to reload the whole article.
  router.get('/:id/status', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    const episode = await prisma.episode.findUnique({
      where: { id: req.params.id },
      select: {
        transcriptionStatus: true,
        transcriptionError: true,
        transcript: true,
        clips: { orderBy: { startSeconds: 'asc' } },
      },
    });
    if (!episode) return res.status(404).json({ error: 'Episode not found' });
    res.json(episode);
  });

  // ---- Delete the raw recording once an editor is done extracting clips
  // from it — explicit cleanup action, see also the automatic 48h cron
  // (server/jobs/cleanupRawRecordings.js) that catches anyone who forgets. ----
  router.delete('/:id/recording', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    const filePath = findRawRecordingPath(req.params.id);
    if (filePath) fs.unlinkSync(filePath);
    res.json({ ok: true });
  });

  // ---- Manual clip: an editor picks the range directly. Skips SUGGESTED
  // entirely (source: MANUAL, status: APPROVED) — a human made this, there's
  // nothing to review. Captions come from the real transcript when one
  // exists; null otherwise (a clip can be created before transcription
  // finishes, e.g. from a chapter timestamp an editor already knows). ----
  router.post('/:id/clips', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    const { title, startSeconds, endSeconds } = req.body;
    if (!title || startSeconds == null || endSeconds == null || endSeconds <= startSeconds) {
      return res.status(400).json({ error: 'title, startSeconds, and endSeconds (endSeconds > startSeconds) are required' });
    }
    const episode = await prisma.episode.findUnique({ where: { id: req.params.id }, select: { transcriptSegments: true } });
    if (!episode) return res.status(404).json({ error: 'Episode not found' });

    const segments = episode.transcriptSegments ? JSON.parse(episode.transcriptSegments) : [];
    const captionsSrt = segments.length ? contentEngine.buildSrtForRange(segments, startSeconds, endSeconds) : null;

    const clip = await prisma.clip.create({
      data: { episodeId: req.params.id, title, startSeconds, endSeconds, captionsSrt: captionsSrt || null, source: 'MANUAL', status: 'APPROVED' },
    });
    res.status(201).json({ clip });
  });

  // ---- Approve/reject an AI-suggested clip, or edit any clip's title/range.
  // Re-derives captions from the real transcript whenever the range changes,
  // so an edited clip's captions never drift from what was actually said. ----
  router.put('/clips/:clipId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    const existing = await prisma.clip.findUnique({ where: { id: req.params.clipId } });
    if (!existing) return res.status(404).json({ error: 'Clip not found' });
    const { title, startSeconds, endSeconds, status } = req.body;
    if (status && !['SUGGESTED', 'APPROVED', 'REJECTED', 'RENDERED'].includes(status)) {
      return res.status(400).json({ error: 'invalid status' });
    }

    const newStart = startSeconds ?? existing.startSeconds;
    const newEnd = endSeconds ?? existing.endSeconds;
    let captionsSrt = existing.captionsSrt;
    if (startSeconds != null || endSeconds != null) {
      const episode = await prisma.episode.findUnique({ where: { id: existing.episodeId }, select: { transcriptSegments: true } });
      const segments = episode?.transcriptSegments ? JSON.parse(episode.transcriptSegments) : [];
      captionsSrt = segments.length ? contentEngine.buildSrtForRange(segments, newStart, newEnd) : null;
    }

    const clip = await prisma.clip.update({
      where: { id: req.params.clipId },
      data: {
        title: title ?? existing.title,
        startSeconds: newStart,
        endSeconds: newEnd,
        captionsSrt,
        status: status ?? existing.status,
      },
    });
    res.json({ clip });
  });

  router.delete('/clips/:clipId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    await prisma.clip.delete({ where: { id: req.params.clipId } });
    res.json({ ok: true });
  });

  // ---- Render an approved clip for real: cuts it from the raw recording
  // (still needed on disk — this is why it isn't deleted right after
  // transcription) and burns in its captions. The output lands in
  // prisma/uploads — same persistent-volume location and /uploads static
  // route Wave 4's image upload already established. ----
  // ---- Admin: every AI-suggested clip still awaiting a human decision,
  // across every episode (Wave 9 §8.8 — no cross-episode clip view
  // existed before this; clips were only ever reachable per-episode).
  // Registered before /clips/:clipId/render so "pending" is never
  // swallowed as a clipId. ----
  router.get('/clips/pending', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    const clips = await prisma.clip.findMany({
      where: { status: 'SUGGESTED' },
      include: { episode: { include: { article: { select: { id: true, title: true, slug: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ clips });
  });

  router.post('/clips/:clipId/render', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    const clip = await prisma.clip.findUnique({ where: { id: req.params.clipId } });
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    if (clip.status !== 'APPROVED') return res.status(400).json({ error: 'Only an APPROVED clip can be rendered.' });

    const rawPath = findRawRecordingPath(clip.episodeId);
    if (!rawPath) {
      return res.status(422).json({ error: 'The raw recording for this episode is no longer available — re-upload it to render more clips.' });
    }

    const filename = `${crypto.randomUUID()}.mp4`;
    const outputPath = path.join(uploadsDir, filename);
    try {
      await contentEngine.renderClip(rawPath, clip.startSeconds, clip.endSeconds, clip.captionsSrt, outputPath);
    } catch (err) {
      console.error('[contentEngine] Render failed:', err.message);
      return res.status(500).json({ error: 'Rendering this clip failed — check server logs.' });
    }

    const rendered = await prisma.clip.update({
      where: { id: req.params.clipId },
      data: { videoUrl: `/uploads/${filename}`, status: 'RENDERED' },
    });
    res.json({ clip: rendered });
  });

  // ---- Social assets: quote cards / social copy / newsletter blocks.
  // Manual create, plus an AI-generate route that pulls real verbatim
  // quotes from the transcript (never paraphrased — see
  // suggestSocialAssets's own comment). ----
  router.post('/:id/social-assets', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    const { type, content } = req.body;
    if (!['QUOTE_CARD', 'SOCIAL_COPY', 'NEWSLETTER_BLOCK'].includes(type) || !content) {
      return res.status(400).json({ error: 'type (QUOTE_CARD | SOCIAL_COPY | NEWSLETTER_BLOCK) and content are required' });
    }
    const asset = await prisma.socialAsset.create({ data: { episodeId: req.params.id, type, content, source: 'MANUAL' } });
    res.status(201).json({ asset });
  });

  router.post('/:id/social-assets/generate', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    const episode = await prisma.episode.findUnique({ where: { id: req.params.id }, select: { transcript: true } });
    if (!episode) return res.status(404).json({ error: 'Episode not found' });
    if (!episode.transcript) return res.status(400).json({ error: 'This episode has no transcript yet — upload a recording or paste one in manually first.' });

    let quotes;
    try {
      quotes = await contentEngine.suggestSocialAssets(episode.transcript);
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
    if (!quotes.length) return res.status(200).json({ assets: [] });

    await prisma.socialAsset.createMany({
      data: quotes.map((q) => ({ episodeId: req.params.id, type: 'QUOTE_CARD', content: q, source: 'AI_GENERATED' })),
    });
    const assets = await prisma.socialAsset.findMany({ where: { episodeId: req.params.id, source: 'AI_GENERATED' }, orderBy: { createdAt: 'desc' }, take: quotes.length });
    res.status(201).json({ assets });
  });

  router.delete('/social-assets/:assetId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    await prisma.socialAsset.delete({ where: { id: req.params.assetId } });
    res.json({ ok: true });
  });

  // ---- Episode sponsor — same CRUD shape as clubs.js's existing Sponsor
  // routes, a distinct model (see EpisodeSponsor's schema comment). ----
  router.post('/:id/sponsors', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    const { name, logoUrl, website } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const sponsor = await prisma.episodeSponsor.create({
      data: { episodeId: req.params.id, name, logoUrl: logoUrl || null, website: website || null },
    });
    res.status(201).json({ sponsor });
  });

  router.put('/sponsors/:sponsorId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    const existing = await prisma.episodeSponsor.findUnique({ where: { id: req.params.sponsorId } });
    if (!existing) return res.status(404).json({ error: 'Sponsor not found' });
    const { name, logoUrl, website } = req.body;
    const sponsor = await prisma.episodeSponsor.update({
      where: { id: req.params.sponsorId },
      data: {
        name: name ?? existing.name,
        logoUrl: logoUrl !== undefined ? (logoUrl || null) : existing.logoUrl,
        website: website !== undefined ? (website || null) : existing.website,
      },
    });
    res.json({ sponsor });
  });

  router.delete('/sponsors/:sponsorId', requireRole('ADMIN', 'EDITOR'), async (req, res) => {
    await prisma.episodeSponsor.delete({ where: { id: req.params.sponsorId } });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { buildEpisodesRouter };
