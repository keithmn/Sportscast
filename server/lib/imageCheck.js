// Checks an image link before it's published (2026-10-20): a cover image
// that returned HTTP 400 went live and showed broken on the article and
// match pages. Uploaded images (/uploads/…) must exist; outside links must
// be public (assertPublicUrl — no internal addresses), answer within 6
// seconds and actually be an image. Returns an error message, or null.

const fs = require('fs');
const path = require('path');
const { assertPublicUrl } = require('./assertPublicUrl');

// The whole check is capped at 8 seconds (an address lookup alone can hang).
function imageProblem(url, uploadsDir) {
  return Promise.race([
    checkImage(url, uploadsDir),
    new Promise((resolve) => setTimeout(() => resolve("That image link didn't answer in time. Upload the photo instead, or check the link."), 8000)),
  ]);
}

async function checkImage(url, uploadsDir) {
  if (!url) return null;
  const value = String(url).trim();
  if (value.startsWith('/uploads/')) {
    const file = path.join(uploadsDir, path.basename(value));
    return fs.existsSync(file) ? null : 'That uploaded image is missing — upload it again.';
  }
  if (value.startsWith('/')) return null; // the site's own images (/images/…, /brand/…)
  if (!/^https?:\/\//i.test(value)) return 'The image must be uploaded, or a full link starting with https://';
  try {
    await assertPublicUrl(value);
  } catch {
    return "That image link isn't a public web address.";
  }
  try {
    let res = await fetch(value, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6000) });
    if (res.status === 405 || res.status === 403) res = await fetch(value, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(6000) });
    if (!res.ok) return `That image link doesn't open (it answered HTTP ${res.status}). Upload the photo instead, or check the link.`;
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return "That link opens a web page, not an image. Use the image's own address, or upload the photo.";
    return null;
  } catch {
    return "That image link didn't answer. Upload the photo instead, or check the link.";
  }
}

module.exports = { imageProblem };
