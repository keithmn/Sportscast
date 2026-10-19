// X watch: reads match updates out of a journalist's post text with plain
// patterns — no AI, no network. Match-day accounts write scores in a few
// recurring shapes, which this covers:
//
//   "FT: Gor Mahia 2-1 AFC Leopards #FKFPL"
//   "HT | Tusker 0-0 Bandari"
//   "67' Shabana 1–0 Posta Rangers"
//   a matchday roundup with one "Home 1-0 Away" per line
//
// Returns { kind, items }, where each item is
// { homeTeam, awayTeam, homeScore, awayScore, status, minute, hasMarker }.
// hasMarker says the line itself carried FT/HT/a minute/"goal" — the
// matcher (server/lib/watchMatching.js) only keeps marker-less items when
// a team name is one we know, which is what stops "Matchday 2 runs 17-18
// October" from reading as a score.

const STATUS_PATTERNS = [
  { status: 'FT', re: /\b(FT|F\.T\.|full[\s-]?time|final\s+score|result)\b/i },
  { status: 'HT', re: /\b(HT|H\.T\.|half[\s-]?time)\b/i },
];
const MINUTE_RE = /(?:^|\s|\()(\d{1,3})(?:\+(\d{1,2}))?\s*['’′]/;
const GOAL_RE = /\bgo+a+l+\b/i;

// "Team 2-1 Team": dash or en/em dash only — a colon would also match
// kick-off times ("15:00 at Kasarani").
const SCORE_LINE_RE = /^(.*?[A-Za-z].*?)\s+(\d{1,3})\s*[-–—]\s*(\d{1,3})\s+(.*?[A-Za-z].*)$/;

const KIND_PATTERNS = [
  { kind: 'LINEUP', re: /\b(starting\s*(xi|eleven|line-?up)|line-?ups?|\bXI\b|team\s+news)\b/i },
  { kind: 'TRANSFER', re: /\b(signs?|signed|joins?|joined|transfer|on\s+loan|unveil(s|ed)?|deal\s+(with|for))\b/i },
  { kind: 'INJURY', re: /\b(injur(y|ed|ies)|ruled\s+out|sidelined|suspended|red\s+card\s+ban)\b/i },
];
const FIXTURE_RE = /\b(vs?\.?|versus)\b/i;
const KICKOFF_RE = /\b(kick-?off|ko)\b|\b\d{1,2}(:\d{2})?\s?(am|pm)\b|\b\d{1,2}:\d{2}\b/i;

function lineStatus(line) {
  for (const { status, re } of STATUS_PATTERNS) if (re.test(line)) return { status, minute: null };
  const m = line.match(MINUTE_RE);
  if (m) return { status: 'LIVE', minute: m[2] ? `${m[1]}+${m[2]}` : m[1] };
  if (GOAL_RE.test(line)) return { status: 'LIVE', minute: null };
  return null;
}

// Strips what surrounds a team name in a post: status words, minutes,
// hashtags, handles, emoji/punctuation, and trailing notes like "(4-3 pens)".
function cleanTeam(raw, side) {
  let t = ` ${raw} `;
  t = t.replace(/\([^)]*\)/g, ' '); // "(4-3 pens)", "(FT)"
  t = t.replace(/https?:\/\/\S+/g, ' ');
  t = t.replace(/#\w+/g, ' '); // hashtags are tags (#FKFPL), not names
  t = t.replace(/@(\w+)/g, ' $1 '); // "@GorMahia" — the matcher compares names without spaces
  t = t.replace(/\b(FT|F\.T\.|HT|H\.T\.|full[\s-]?time|half[\s-]?time|final\s+score|result|results|live|goal+)\b/gi, ' ');
  t = t.replace(/(\d{1,3})(\+\d{1,2})?\s*['’′]/g, ' ');
  t = t.replace(/[’‘]/g, "'"); // Murang’a
  t = t.replace(/[^\p{L}\p{N}'.&\s-]/gu, ' '); // emoji, pipes, colons, bullets
  t = t.replace(/^[\s.\-–—]+|[\s.\-–—]+$/g, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  // A leading "Matchday 2" / "MW2" label before the home team.
  if (side === 'home') t = t.replace(/^(match\s?(day|week)|md|mw|round)\s*\d+\s*/i, '').trim();
  return t;
}

function parsePost(text) {
  const items = [];
  const postStatus = lineStatus(text);
  for (const rawLine of String(text || '').split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(SCORE_LINE_RE);
    if (!m) continue;
    const homeTeam = cleanTeam(m[1], 'home');
    const awayTeam = cleanTeam(m[4], 'away');
    const homeScore = Number(m[2]);
    const awayScore = Number(m[3]);
    if (!/[A-Za-z]{2}/.test(homeTeam) || !/[A-Za-z]{2}/.test(awayTeam)) continue;
    if (homeTeam.length > 40 || awayTeam.length > 40) continue;
    if (homeScore > 199 || awayScore > 199) continue;
    // A per-line marker wins; a roundup's "FT" heading applies to its lines.
    const own = lineStatus(line);
    const st = own || postStatus;
    const pens = line.match(/\((\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(pens?|p|penalties|on\s+penalties)\)/i);
    items.push({
      homeTeam, awayTeam, homeScore, awayScore,
      status: st ? st.status : 'UNKNOWN',
      minute: st ? st.minute : null,
      penalties: pens ? `${pens[1]}-${pens[2]}` : null,
      hasMarker: Boolean(st),
    });
  }
  return { kind: classifyKind(text, items), items };
}

// The post type, from the scores that survived (the matcher calls this
// again after dropping unrecognised, marker-less "scores").
function classifyKind(text, items) {

  if (items.some((i) => i.status === 'FT')) return 'RESULT';
  if (items.some((i) => i.status === 'HT' || i.status === 'LIVE')) return 'LIVE';
  if (items.length) return 'RESULT';
  const hit = KIND_PATTERNS.find(({ re }) => re.test(text));
  if (hit) return hit.kind;
  if (FIXTURE_RE.test(text) && KICKOFF_RE.test(text)) return 'FIXTURE';
  return 'NEWS';
}

module.exports = { parsePost, classifyKind, cleanTeam };
