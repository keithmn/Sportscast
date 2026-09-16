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

    const filename = `${crypto.randomUUID()}.jpg`;
    try {
      await sharp(req.file.buffer)
        .rotate() // applies EXIF orientation before resizing — a sideways phone photo would otherwise stay sideways
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toFile(path.join(uploadsDir, filename));
    } catch (err) {
      console.error('[uploads] Failed to process image:', err.message);
      return res.status(422).json({ error: 'Could not process that image — it may be corrupted.' });
    }

    res.status(201).json({ url: `/uploads/${filename}` });
  });

  return router;
}

module.exports = { buildUploadsRouter };
