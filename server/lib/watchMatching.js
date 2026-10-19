// X watch: compares the scores found in a post (server/lib/postParser.js)
// with our own fixtures, so the dashboard can say "matches", "differs",
// "not entered yet" or "no such fixture". Worked out on every dashboard
// load, against the database as it is now — an editor entering the
// result turns a "not entered" row into "matches" without touching it.

const prisma = require('../db');
const { classifyKind } = require('./postParser');

// Names written differently in posts and in our data. Keys and values are
// normalised (see norm()); each group is one club. Only well-established
// alternatives — add more as they come up.
const ALIAS_GROUPS = [
  ['kcb', 'kenyacommercialbank', 'kcbfc', 'bankers'],
  ['gormahia', 'kogalo', 'gor', 'sirkalaskadogo'],
  ['afcleopards', 'ingwe', 'leopards'],
  ['kenyapolice', 'police', 'policefc'],
  ['ulinzistars', 'ulinzi'],
  ['kakamegahomeboyz', 'homeboyz'],
  ['tusker', 'tuskerfc', 'brewers'],
  ['bandari', 'bandarifc', 'dockers'],
  ['postarangers', 'posta', 'mailmen'],
  ['nairobiunited', 'naiutd', 'nairobiutd'],
  ['muranga seal', 'murangaseal', 'seal'],
  ['mathareunited', 'mathare', 'slumboys'],
  ['shabana', 'shabanafc', 'tore bobe', 'torebobe'],
  ['apsbomet', 'bomet'],
  ['marasugar', 'mara'],
  ['mombasaunited', 'mombasautd'],
  ['migoriyouth', 'migori'],
  ['3k', '3kfc'],
];

function norm(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[’'`.]/g, '')
    .replace(/\b(fc|f c|sc|rfc|bc|hc|club|the)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

const ALIAS = new Map();
ALIAS_GROUPS.forEach((group) => {
  const key = norm(group[0]);
  group.forEach((name) => ALIAS.set(norm(name), key));
});
const canonical = (name) => ALIAS.get(norm(name)) || norm(name);

function sameTeam(a, b) {
  const ca = canonical(a);
  const cb = canonical(b);
  if (!ca || !cb) return false;
  return ca === cb || (ca.length >= 4 && cb.length >= 4 && (ca.startsWith(cb) || cb.startsWith(ca)));
}

// The fixtures a post could be about: Kenyan, active, within two days
// either side of when it was posted.
async function candidateFixtures(posts) {
  const times = posts.map((p) => new Date(p.postedAt || p.fetchedAt).getTime()).filter((t) => !Number.isNaN(t));
  if (!times.length) return [];
  const day = 24 * 60 * 60 * 1000;
  return prisma.fixture.findMany({
    where: {
      kickoff: { gte: new Date(Math.min(...times) - 2 * day), lte: new Date(Math.max(...times) + 2 * day) },
      competition: { region: 'KENYA', isActive: true },
    },
    include: { competition: { select: { name: true, slug: true } } },
  });
}

async function knownTeamNames() {
  const [clubs, rows] = await Promise.all([
    prisma.club.findMany({ where: { competition: { region: 'KENYA' } }, select: { name: true } }),
    prisma.standingRow.findMany({ where: { competition: { region: 'KENYA' } }, select: { teamName: true }, distinct: ['teamName'] }),
  ]);
  return [...clubs.map((c) => c.name), ...rows.map((r) => r.teamName), ...ALIAS_GROUPS.flat()];
}

// Verdict for one item against our data.
function compareItem(item, postTime, fixtures) {
  const near = fixtures
    .map((f) => {
      const straight = sameTeam(item.homeTeam, f.homeTeam) && sameTeam(item.awayTeam, f.awayTeam);
      const reversed = !straight && sameTeam(item.homeTeam, f.awayTeam) && sameTeam(item.awayTeam, f.homeTeam);
      return (straight || reversed) ? { f, reversed, gap: Math.abs(new Date(f.kickoff).getTime() - postTime) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.gap - b.gap);
  if (!near.length) return { verdict: 'NO_FIXTURE', fixture: null };

  const { f, reversed } = near[0];
  const theirs = reversed ? [item.awayScore, item.homeScore] : [item.homeScore, item.awayScore];
  const fixture = {
    id: f.id, homeTeam: f.homeTeam, awayTeam: f.awayTeam, kickoff: f.kickoff, status: f.status,
    homeScore: f.homeScore, awayScore: f.awayScore, competition: f.competition,
  };
  if (f.status === 'FINISHED' && f.homeScore != null) {
    return { verdict: f.homeScore === theirs[0] && f.awayScore === theirs[1] ? 'MATCHES' : 'DIFFERS', fixture, theirs };
  }
  // Ours isn't finished. Only a full-time post means we're behind; a
  // half-time or in-play score is just live information.
  return { verdict: item.status === 'FT' || item.status === 'UNKNOWN' ? 'NOT_ENTERED' : 'LIVE', fixture, theirs };
}

const VERDICT_RANK = { DIFFERS: 0, NOT_ENTERED: 1, NO_FIXTURE: 2, LIVE: 3, MATCHES: 4 };

// Adds `kind` (recomputed), `matches` (one verdict per kept item) and
// `verdict` (the worst) to each post.
async function annotatePosts(posts) {
  const [fixtures, known] = await Promise.all([candidateFixtures(posts), knownTeamNames()]);
  return posts.map((p) => {
    let items = [];
    try { items = JSON.parse(p.items || '[]'); } catch { items = []; }
    // A score with no FT/HT/minute marker only counts when a side is a team we know.
    items = items.filter((i) => i.hasMarker || known.some((k) => sameTeam(k, i.homeTeam) || sameTeam(k, i.awayTeam)));
    const postTime = new Date(p.postedAt || p.fetchedAt).getTime();
    const matches = items.map((item) => ({ item, ...compareItem(item, postTime, fixtures) }));
    const verdict = matches.length
      ? matches.map((m) => m.verdict).sort((a, b) => VERDICT_RANK[a] - VERDICT_RANK[b])[0]
      : 'NONE';
    return { ...p, items: undefined, kind: p.parsedBy === 'AI' ? p.kind : classifyKind(p.text, items), matches, verdict };
  });
}

module.exports = { annotatePosts, sameTeam, norm };
