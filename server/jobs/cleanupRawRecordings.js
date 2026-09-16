// Wave 5 — safety net for raw show recordings. An editor can explicitly
// delete one via DELETE /api/episodes/:id/recording once they're done
// extracting clips, but a raw recording is genuinely large (hundreds of
// MB) sitting on the same persistent volume the SQLite DB and sessions
// live on — this app doesn't have room to let them accumulate forever if
// someone forgets. Anything older than 48h is removed automatically,
// regardless of whether its clips were ever rendered.
const fs = require('fs');
const path = require('path');

const MAX_AGE_MS = 48 * 60 * 60 * 1000;

function cleanupRawRecordings(rawRecordingsDir) {
  if (!fs.existsSync(rawRecordingsDir)) return;
  const now = Date.now();
  let removed = 0;
  for (const file of fs.readdirSync(rawRecordingsDir)) {
    const filePath = path.join(rawRecordingsDir, file);
    const { mtimeMs } = fs.statSync(filePath);
    if (now - mtimeMs > MAX_AGE_MS) {
      fs.unlinkSync(filePath);
      removed += 1;
    }
  }
  if (removed) console.log(`[cleanupRawRecordings] Removed ${removed} raw recording(s) older than 48h.`);
}

module.exports = { cleanupRawRecordings };
