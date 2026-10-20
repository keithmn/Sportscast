// Uploads one file to S3-compatible storage (Cloudflare R2, AWS S3,
// Backblaze B2, MinIO…) with AWS Signature Version 4 — the few lines it
// takes, instead of the whole AWS SDK. Used by the nightly backup job
// (server/jobs/backupDatabase.js) for an off-site copy. Path-style URLs
// (endpoint/bucket/key) work with all of the services above.
//
// The signer is checked against AWS's published SigV4 test vector in
// e2e/backup.spec.js.

const crypto = require('crypto');

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// RFC 3986 encoding as SigV4 wants it; "/" kept in paths.
function encodePath(path) {
  return path.split('/').map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

// Returns the Authorization header for a request. `headers` must include
// host and x-amz-date (YYYYMMDDTHHMMSSZ); every header given is signed.
function signRequest({ method, path, query = '', headers, payloadHash, region, service, accessKeyId, secretAccessKey }) {
  const amzDate = headers['x-amz-date'];
  const date = amzDate.slice(0, 8);
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const canonicalHeaders = names.map((h) => `${h}:${lower[h]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, encodePath(path), query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kSigning = hmac(hmac(hmac(kDate, region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

// Settings from the environment, or null when off-site backup isn't set up.
function s3ConfigFromEnv(env = process.env) {
  const { BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY } = env;
  if (!BACKUP_S3_ENDPOINT || !BACKUP_S3_BUCKET || !BACKUP_S3_ACCESS_KEY_ID || !BACKUP_S3_SECRET_ACCESS_KEY) return null;
  return {
    endpoint: BACKUP_S3_ENDPOINT.replace(/\/$/, ''),
    bucket: BACKUP_S3_BUCKET,
    region: env.BACKUP_S3_REGION || 'auto', // R2 uses "auto"
    accessKeyId: BACKUP_S3_ACCESS_KEY_ID,
    secretAccessKey: BACKUP_S3_SECRET_ACCESS_KEY,
    prefix: (env.BACKUP_S3_PREFIX || 'sportscast-backups').replace(/^\/|\/$/g, ''),
  };
}

async function putObject(config, key, body) {
  const url = new URL(`${config.endpoint}/${config.bucket}/${config.prefix ? `${config.prefix}/` : ''}${key}`);
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const payloadHash = sha256Hex(body);
  const headers = { host: url.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash, 'content-type': 'application/octet-stream' };
  const authorization = signRequest({
    method: 'PUT', path: url.pathname, headers, payloadHash,
    region: config.region, service: 's3', accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey,
  });
  const res = await fetch(url, { method: 'PUT', headers: { ...headers, authorization }, body, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`off-site upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return url.pathname;
}

module.exports = { signRequest, s3ConfigFromEnv, putObject, sha256Hex };
