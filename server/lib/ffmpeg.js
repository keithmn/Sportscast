// Wave 5 — Content Transformation Engine. Thin wrapper around the real
// ffmpeg/ffprobe CLI binaries (execFile, not a wrapper library — this is a
// handful of well-documented, fixed command shapes, not worth a new
// dependency for). Requires ffmpeg on PATH — see nixpacks.toml for how
// Railway's build gets it (this app has no build step of its own, so
// there's nowhere else to declare a system dependency).
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';

async function getDurationSeconds(filePath) {
  const { stdout } = await execFileAsync(FFPROBE_BIN, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

// Mono, low-bitrate — this is purely a transcription input, never played
// back or shown to anyone; keeping it small is what lets a single Whisper
// API call (or the fewest possible chunked calls, see splitAudioIntoChunks)
// cover as much of the recording as possible.
async function extractCompressedAudio(inputPath, outputPath) {
  await execFileAsync(FFMPEG_BIN, [
    '-y', '-i', inputPath,
    '-vn', '-ac', '1', '-b:a', '64k',
    outputPath,
  ]);
}

// Splits into <= chunkSeconds pieces via ffmpeg's own segment muxer (exact
// cuts, not an approximation) — used only when extractCompressedAudio's
// output is still over Whisper's 25MB single-upload cap. Returns
// [{path, offsetSeconds}], sorted, so the caller can re-align each chunk's
// segment timestamps back onto the full recording's real timeline.
async function splitAudioIntoChunks(audioPath, chunkSeconds, outputDir) {
  const pattern = `${outputDir}/chunk-%03d.mp3`;
  await execFileAsync(FFMPEG_BIN, [
    '-y', '-i', audioPath,
    '-f', 'segment', '-segment_time', String(chunkSeconds),
    '-c', 'copy',
    pattern,
  ]);
  const fs = require('fs');
  const files = fs.readdirSync(outputDir).filter((f) => f.startsWith('chunk-')).sort();
  return files.map((f, i) => ({ path: `${outputDir}/${f}`, offsetSeconds: i * chunkSeconds }));
}

function buildCutArgs(inputPath, startSeconds, endSeconds, outputPath, srtPath) {
  const duration = endSeconds - startSeconds;
  const args = ['-y', '-ss', String(startSeconds), '-i', inputPath, '-t', String(duration)];
  if (srtPath) {
    // subtitles= needs its own path escaping (colons especially, common on
    // absolute paths) — wrapping in single quotes and escaping any that
    // appear in the path itself is ffmpeg's own documented convention.
    const escaped = srtPath.replace(/:/g, '\\:').replace(/'/g, "\\'");
    args.push('-vf', `subtitles='${escaped}'`);
  }
  args.push('-c:v', 'libx264', '-c:a', 'aac', outputPath);
  return args;
}

// Cuts [startSeconds, endSeconds) from the ORIGINAL raw recording (video
// preserved if the source has one — clips are for short-form video
// distribution, not just audio) and, when srtPath is given, burns those
// captions into the frame. -ss before -i is ffmpeg's fast-seek path
// (seeks the container before decoding, not frame-accurate to the
// millisecond but more than good enough for a 30-75s social clip, and
// dramatically faster than decoding the whole file up to that point).
//
// The subtitles filter needs ffmpeg built with libass — confirmed by
// hitting this directly in development (Homebrew's plain `ffmpeg` formula
// doesn't include it; `ffmpeg-full` does). Whether Railway's Nixpacks
// build includes it isn't something this code can assume either way, so a
// caption-burn failure falls back to a plain (uncaptioned) cut rather
// than failing the whole render — a clip with no captions is still useful;
// a render that hard-fails because of an environment gap isn't.
async function cutClip(inputPath, startSeconds, endSeconds, outputPath, srtPath) {
  const args = buildCutArgs(inputPath, startSeconds, endSeconds, outputPath, srtPath);
  try {
    await execFileAsync(FFMPEG_BIN, args);
  } catch (err) {
    if (!srtPath) throw err;
    console.warn('[ffmpeg] Caption burn-in failed (likely no libass in this ffmpeg build) — rendering without captions instead:', err.message.slice(0, 300));
    const fallbackArgs = buildCutArgs(inputPath, startSeconds, endSeconds, outputPath, null);
    await execFileAsync(FFMPEG_BIN, fallbackArgs);
  }
}

module.exports = { getDurationSeconds, extractCompressedAudio, splitAudioIntoChunks, cutClip };
