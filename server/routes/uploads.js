// Wave 4 — real image upload for article cover images. Before this,
// coverImageUrl was a raw URL text field only — a non-technical newsroom
// staffer needed an already-hosted image URL in hand, which the directive's
// "non-technical content management" checklist explicitly calls out as a
// gap ("upload image/video"). Video stays YouTube-ID-based (public/js/
// site.js's whole video model is built around it, and native video
// file hosting is a materially bigger, costlier undertaking — transcoding,
// storage, bandwidth — not something this pass takes on).
//
// Stored on the same persistent volume the SQLite DB and sessions already
// live on (see server/index.js's dbDir derivation) — confirmed via
// `railway ssh ... df -h /data` before building this: 421MB actually free
// (the volume's "478MB/500MB" in `railway status` is a different, higher-
// level metric, not live disk usage). Every image is resized/compressed on
// ingest via sharp, same discipline BLUEPRINT.md §35 already established
// by hand for the one real photo in this repo — this makes it automatic.
//
// sharp history: it was pinned to 0.33.x after sharp >=0.34 (which needs
// Node >=20.9) crashed the whole process on boot in production, where the
// Railway container ran Node 18.20.8. 2026-10-17: package.json's engines
// now pins Node 24.x (Node 18 and 20 are both end-of-life), so sharp was
// moved to 0.35.x, picking up the patched libvips. Don't lower the engines
// pin without re-pinning sharp below 0.34 at the same time — server/
// index.js requires this file unconditionally at startup, so a mismatch
// takes the whole site down, not just this route.
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');
const path = require('path');
const { requireRole } = require('../middleware/auth');

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // raw upload cap, well above what any real photo needs pre-compression
const MAX_WIDTH = 1600;
const ALLOWED_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function buildUploadsRouter(uploadsDir) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (req, file, cb) => cb(null, ALLOWED_MIMETYPES.has(file.mimetype)),
  });

  router.post('/image', requireRole('ADMIN', 'EDITOR'), upload.single('image'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided (or its type isn\'t JPEG/PNG/WebP).' });
    }

    // ?keep=transparent (club crests, sponsor logos): a PNG/WebP keeps its
    // transparency as a small PNG instead of becoming a JPEG on a solid
    // background.
    const transparent = req.query.keep === 'transparent' && req.file.mimetype !== 'image/jpeg';
    const filename = `${crypto.randomUUID()}.${transparent ? 'png' : 'jpg'}`;
    try {
      const image = sharp(req.file.buffer)
        .rotate() // applies EXIF orientation before resizing — a sideways phone photo would otherwise stay sideways
        .resize({ width: transparent ? 512 : MAX_WIDTH, withoutEnlargement: true });
      await (transparent ? image.png({ compressionLevel: 9 }) : image.jpeg({ quality: 82 })).toFile(path.join(uploadsDir, filename));
    } catch (err) {
      console.error('[uploads] Failed to process image:', err.message);
      return res.status(422).json({ error: 'Could not process that image — it may be corrupted.' });
    }

    res.status(201).json({ url: `/uploads/${filename}` });
  });

  return router;
}

module.exports = { buildUploadsRouter };
