// Wave 5 — Content Transformation Engine. Orchestrates the pipeline the
// master directive describes: LONG-FORM RECORDING -> transcript -> AI-
// suggested clips -> human review -> rendered clip. Every piece that
// touches what was actually said is a literal slice of the real Whisper
// transcript (buildSrtForRange below) — the LLM only ever picks WHICH
// time range is worth clipping and says why; it never generates caption
// text itself. This is the direct implementation of the directive's own
// rule: "Never allow AI to invent... quotations."
const fs = require('fs');
const os = require('os');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { transcribeAudioChunk, whisperConfigured } = require('./whisper');
const { getDurationSeconds, extractCompressedAudio, splitAudioIntoChunks, cutClip } = require('./ffmpeg');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
// Comfortably under Whisper's 25MB single-upload cap for a 64kbps mono
// MP3 (~9.4MB for 20 minutes) — leaves real margin rather than cutting it
// close.
const CHUNK_SECONDS = 20 * 60;
const MAX_SINGLE_UPLOAD_BYTES = 24 * 1024 * 1024;

// Same explicit apiKey pattern as server/jobs/runMonitoringEnrich.js
// (the SDK's implicit env-var pickup doesn't reliably work in every
// context this runs in — confirmed directly, not assumed).
function anthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('AI clip suggestions/social assets need ANTHROPIC_API_KEY to be set.');
  return new Anthropic({ apiKey });
}

// Full pipeline from a raw recording file to a transcript with real,
// second-accurate segment timestamps across the WHOLE recording (chunked
// transcription re-aligned onto one timeline, not per-chunk-relative).
async function transcribeRecording(rawFilePath) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-transcribe-'));
  try {
    const audioPath = path.join(workDir, 'audio.mp3');
    await extractCompressedAudio(rawFilePath, audioPath);

    const { size } = fs.statSync(audioPath);
    let chunks;
    if (size <= MAX_SINGLE_UPLOAD_BYTES) {
      chunks = [{ path: audioPath, offsetSeconds: 0 }];
    } else {
      chunks = await splitAudioIntoChunks(audioPath, CHUNK_SECONDS, workDir);
    }

    const allSegments = [];
    const textParts = [];
    for (const chunk of chunks) {
      const { text, segments } = await transcribeAudioChunk(chunk.path);
      textParts.push(text);
      for (const s of segments) {
        allSegments.push({ start: s.start + chunk.offsetSeconds, end: s.end + chunk.offsetSeconds, text: s.text });
      }
    }
    return { text: textParts.join(' '), segments: allSegments };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// Renders the segments as a numbered, timestamped script Claude can
// reference precisely (so a suggested clip's startSeconds/endSeconds
// lines up with a real segment boundary, not a guess).
function segmentsToScript(segments) {
  return segments.map((s, i) => `[${i}] ${Math.round(s.start)}s-${Math.round(s.end)}s: ${s.text}`).join('\n');
}

// Asks Claude to flag 3-5 shareable moments from the REAL transcript.
// Returns raw suggestions {title, startSeconds, endSeconds, reason} — the
// caller is responsible for clamping these against the real segment
// range before trusting them (never assume the model's numbers are
// perfectly in-bounds).
async function suggestClipMoments(segments) {
  if (!segments.length) return [];
  const anthropic = anthropicClient();
  const script = segmentsToScript(segments);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      'You help a Kenyan sports podcast find its most shareable short-form moments. ' +
      'You are given a real, timestamped transcript segment list — every timestamp and ' +
      'word in it is real, already recorded, and verified. Never invent, paraphrase, or ' +
      'guess at anything that was said — only reference what literally appears in the ' +
      'segments given to you. Pick moments a viewer would actually share: a strong opinion, ' +
      'a surprising fact, a funny exchange, a clear soundbite — not a random 45-second window.',
    messages: [
      {
        role: 'user',
        content:
          `Transcript segments (index, start-end in seconds, text):\n${script}\n\n` +
          'Suggest 3-5 clip-worthy moments, each 20-75 seconds long, using the record_clip_suggestions tool. ' +
          'startSeconds/endSeconds must align to real segment boundaries from the list above.',
      },
    ],
    tools: [
      {
        name: 'record_clip_suggestions',
        description: 'Record the suggested shareable clip moments.',
        input_schema: {
          type: 'object',
          properties: {
            clips: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'A short, punchy working title for this clip.' },
                  startSeconds: { type: 'integer' },
                  endSeconds: { type: 'integer' },
                  reason: { type: 'string', description: 'One sentence on why this moment is shareable, referencing only what was actually said.' },
                },
                required: ['title', 'startSeconds', 'endSeconds', 'reason'],
              },
            },
          },
          required: ['clips'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'record_clip_suggestions' },
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) return [];

  const totalDuration = segments[segments.length - 1].end;
  return (toolUse.input.clips || [])
    .map((c) => ({
      title: c.title,
      startSeconds: Math.max(0, Math.min(c.startSeconds, totalDuration)),
      endSeconds: Math.max(0, Math.min(c.endSeconds, totalDuration)),
      reason: c.reason,
    }))
    .filter((c) => c.endSeconds > c.startSeconds);
}

// Loose containment check for verifying an AI-returned quote actually
// appears in the transcript — normalizes whitespace/case/punctuation
// since Claude may reasonably clean up filler-word spacing or a stray
// Whisper transcription quirk without changing what was actually said,
// but this must still catch genuine invention.
function normalizeForMatch(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Asks Claude for standout QUOTE_CARD-worthy lines from the real
// transcript. Every returned quote is verified as a real (normalized)
// substring of the transcript before it's trusted — one that doesn't
// verify is dropped, never saved. This is the directive's "never invent
// quotations" rule enforced as code, not just a prompt instruction.
async function suggestSocialAssets(transcript) {
  const anthropic = anthropicClient();
  const normalizedTranscript = normalizeForMatch(transcript);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      'You find standout, shareable quote-card lines from a real podcast transcript. ' +
      'Every quote you return must be copied EXACTLY (verbatim, word-for-word) from the ' +
      'transcript you are given — never paraphrase, summarize, combine separate sentences, ' +
      'or invent anything. If nothing genuinely stands out, return fewer quotes rather than ' +
      'stretching for a count.',
    messages: [
      { role: 'user', content: `Transcript:\n${transcript}\n\nPick 2-4 standout verbatim quotes using the record_quotes tool.` },
    ],
    tools: [
      {
        name: 'record_quotes',
        description: 'Record standout verbatim quotes from the transcript.',
        input_schema: {
          type: 'object',
          properties: {
            quotes: { type: 'array', items: { type: 'string' }, description: 'Each quote copied exactly from the transcript.' },
          },
          required: ['quotes'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'record_quotes' },
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  const rawQuotes = toolUse?.input.quotes || [];
  // The actual enforcement: drop anything that isn't really in the transcript.
  return rawQuotes.filter((q) => normalizedTranscript.includes(normalizeForMatch(q)));
}

function srtTimestamp(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  const pad = (n, len) => String(n).padStart(len, '0');
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(millis, 3)}`;
}

// A literal slice of the real transcript, re-timed to the clip's own
// 0-based timeline — this is the ONLY thing that ever becomes a clip's
// caption text. No LLM call, no paraphrasing: exactly what the segments
// already say, in the order they were actually said.
function buildSrtForRange(segments, startSeconds, endSeconds) {
  const inRange = segments.filter((s) => s.end > startSeconds && s.start < endSeconds);
  return inRange
    .map((s, i) => {
      const relStart = Math.max(0, s.start - startSeconds);
      const relEnd = Math.min(endSeconds - startSeconds, s.end - startSeconds);
      return `${i + 1}\n${srtTimestamp(relStart)} --> ${srtTimestamp(relEnd)}\n${s.text}\n`;
    })
    .join('\n');
}

// Cuts and (if captions is given) burns them into the actual clip file,
// writing directly to `outputPath` (the caller resolves this — see
// server/routes/episodes.js — to the persistent volume's uploads
// directory, same storage convention Wave 4's image upload already uses).
async function renderClip(rawFilePath, startSeconds, endSeconds, srtContent, outputPath) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-render-'));
  try {
    let srtPath;
    if (srtContent) {
      srtPath = path.join(workDir, 'captions.srt');
      fs.writeFileSync(srtPath, srtContent);
    }
    await cutClip(rawFilePath, startSeconds, endSeconds, outputPath, srtPath);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = {
  transcribeRecording,
  suggestClipMoments,
  suggestSocialAssets,
  buildSrtForRange,
  renderClip,
  getDurationSeconds,
  whisperConfigured,
};
