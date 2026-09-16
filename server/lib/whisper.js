// Wave 5 — Content Transformation Engine. OpenAI's hosted Whisper API, not
// a local model — this app has no GPU and Railway's container isn't sized
// to run a multi-hundred-MB speech model. Fails soft (throws a clear
// error, never silently fakes a transcript) when OPENAI_API_KEY isn't
// set — same convention as this app's other optional integrations
// (ANTHROPIC_API_KEY, YOUTUBE_API_KEY).
const fs = require('fs');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const configured = Boolean(OPENAI_API_KEY);

if (!configured) {
  console.warn('[whisper] OPENAI_API_KEY not set — automated transcription disabled. Editors can still paste a transcript manually, and everything downstream of a transcript (AI clip suggestions, rendering) still works off that.');
}

// Whisper's API caps a single upload at 25MB — see server/lib/contentEngine.js's
// splitAudioIfNeeded for how a longer recording gets chunked before this is called.
async function transcribeAudioChunk(filePath) {
  if (!configured) throw new Error('Automated transcription is not configured (OPENAI_API_KEY missing).');

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(filePath)]), 'audio.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Whisper transcription failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    text: data.text,
    // {start, end, text} in seconds, relative to the start of THIS chunk —
    // the caller (contentEngine.js) offsets these by the chunk's real
    // position in the full recording.
    segments: (data.segments || []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })),
  };
}

module.exports = { transcribeAudioChunk, whisperConfigured: configured };
