// Jurisdictional categorization (2026-10-17): every competition sits at
// one level of the sporting pyramid it belongs to, which replaces the old
// mixed `category` (LEAGUE | CUP | CONTINENTAL | INTERNATIONAL — a format
// and a level in one field) as the grouping on the sport hubs' Tables,
// Competitions, Teams and Players tabs. Three independent axes:
//
//   jurisdiction — whose competition it is, from the grassroots up:
//     COUNTY → SCHOOLS (schools & universities) → NATIONAL (FKF, KRU, KBF,
//     KHU) → REGIONAL (CECAFA, Six Nations) → CONTINENTAL (CAF, UEFA, FIBA
//     Africa) → GLOBAL (FIFA, World Rugby).
//   format       — LEAGUE (a season-long table), CUP (knockout) or
//                  TOURNAMENT (an event with groups and/or knockouts).
//   teamType     — CLUB, NATIONAL_TEAM or INDIVIDUAL (boxing, darts).
//
// `region` (KENYA | GLOBAL) is unchanged and still means "Kenyan-run or
// Kenya-involved" — it orders Kenyan competitions first inside each level
// and drives sourcing. The order of JURISDICTIONS is the order the tabs show.

const JURISDICTIONS = [
  { key: 'COUNTY', label: 'County' },
  { key: 'SCHOOLS', label: 'Schools & Universities' },
  { key: 'NATIONAL', label: 'National' },
  { key: 'REGIONAL', label: 'Regional' },
  { key: 'CONTINENTAL', label: 'Continental' },
  { key: 'GLOBAL', label: 'Global' },
];
const FORMATS = [
  { key: 'LEAGUE', label: 'League' },
  { key: 'CUP', label: 'Cup' },
  { key: 'TOURNAMENT', label: 'Tournament' },
];
const TEAM_TYPES = [
  { key: 'CLUB', label: 'Clubs' },
  { key: 'NATIONAL_TEAM', label: 'National teams' },
  { key: 'INDIVIDUAL', label: 'Individuals' },
];

// Every competition the site already knows about, by slug. The
// 20261017180000_competition_jurisdiction migration writes the same values
// into existing databases; the seed and the sync jobs use this map for new
// rows. governingBody is only filled where it is certain — null otherwise.
// The optional fifth value is the tier inside the level's pyramid (1 = top
// flight: KPL 1, NSL 2, Division One 3), for leagues only.
const KNOWN = {
  // National — Kenya
  'kenyan-premier-league': ['NATIONAL', 'LEAGUE', 'CLUB', 'FKF', 1],
  'national-super-league': ['NATIONAL', 'LEAGUE', 'CLUB', 'FKF', 2],
  'fkf-division-one-zone-a': ['NATIONAL', 'LEAGUE', 'CLUB', 'FKF', 3],
  'fkf-division-one-zone-b': ['NATIONAL', 'LEAGUE', 'CLUB', 'FKF', 3],
  'fkf-division-one-zone-c': ['NATIONAL', 'LEAGUE', 'CLUB', 'FKF', 3],
  'fkf-division-one-zone-d': ['NATIONAL', 'LEAGUE', 'CLUB', 'FKF', 3],
  'fkf-cup': ['NATIONAL', 'CUP', 'CLUB', 'FKF'],
  'kenya-cup': ['NATIONAL', 'LEAGUE', 'CLUB', 'KRU', 1],
  'kbf-premier-league': ['NATIONAL', 'LEAGUE', 'CLUB', 'KBF', 1],
  'khu-premier-league': ['NATIONAL', 'LEAGUE', 'CLUB', 'KHU', 1],
  'national-boxing-league': ['NATIONAL', 'LEAGUE', 'INDIVIDUAL', null],
  // National — other countries (hidden for Kenyan-first coverage)
  'premier-league': ['NATIONAL', 'LEAGUE', 'CLUB', null, 1],
  'championship': ['NATIONAL', 'LEAGUE', 'CLUB', null, 2],
  'la-liga': ['NATIONAL', 'LEAGUE', 'CLUB', null, 1],
  'bundesliga': ['NATIONAL', 'LEAGUE', 'CLUB', null, 1],
  'serie-a': ['NATIONAL', 'LEAGUE', 'CLUB', null, 1],
  'ligue-1': ['NATIONAL', 'LEAGUE', 'CLUB', null, 1],
  'eredivisie': ['NATIONAL', 'LEAGUE', 'CLUB', null, 1],
  'primeira-liga': ['NATIONAL', 'LEAGUE', 'CLUB', null, 1],
  'campeonato-brasileiro-srie-a': ['NATIONAL', 'LEAGUE', 'CLUB', null, 1],
  'nba': ['NATIONAL', 'LEAGUE', 'CLUB', 'NBA', 1],
  // Regional
  'cecafa-senior-challenge-cup': ['REGIONAL', 'TOURNAMENT', 'NATIONAL_TEAM', 'CECAFA'],
  'six-nations-championship': ['REGIONAL', 'TOURNAMENT', 'NATIONAL_TEAM', 'Six Nations Rugby'],
  // Continental
  'africa-cup-of-nations': ['CONTINENTAL', 'TOURNAMENT', 'NATIONAL_TEAM', 'CAF'],
  'afcon-qualifiers': ['CONTINENTAL', 'TOURNAMENT', 'NATIONAL_TEAM', 'CAF'],
  'chan': ['CONTINENTAL', 'TOURNAMENT', 'NATIONAL_TEAM', 'CAF'],
  'caf-champions-league': ['CONTINENTAL', 'TOURNAMENT', 'CLUB', 'CAF'],
  'caf-confederation-cup': ['CONTINENTAL', 'TOURNAMENT', 'CLUB', 'CAF'],
  'bal-road-to-bal': ['CONTINENTAL', 'TOURNAMENT', 'CLUB', null],
  'rugby-africa-cup': ['CONTINENTAL', 'TOURNAMENT', 'NATIONAL_TEAM', 'Rugby Africa'],
  'european-championship': ['CONTINENTAL', 'TOURNAMENT', 'NATIONAL_TEAM', 'UEFA'],
  'uefa-champions-league': ['CONTINENTAL', 'TOURNAMENT', 'CLUB', 'UEFA'],
  'euroleague-basketball': ['CONTINENTAL', 'LEAGUE', 'CLUB', null],
  // Global
  'fifa-world-cup': ['GLOBAL', 'TOURNAMENT', 'NATIONAL_TEAM', 'FIFA'],
  'world-cup-qualifiers': ['GLOBAL', 'TOURNAMENT', 'NATIONAL_TEAM', 'FIFA'],
  'hsbc-svns-kenya-leg': ['GLOBAL', 'TOURNAMENT', 'NATIONAL_TEAM', 'World Rugby'],
  'pdc-darts': ['GLOBAL', 'TOURNAMENT', 'INDIVIDUAL', 'PDC'],
  'world-championship-boxing': ['GLOBAL', 'TOURNAMENT', 'INDIVIDUAL', null],
};

// {jurisdiction, format, teamType, governingBody, tier} for a known slug, or {}
// for an unknown one (the schema defaults then apply) — spread straight
// into a prisma.competition.create data object.
function classificationFor(slug) {
  const known = KNOWN[slug];
  if (!known) return {};
  const [jurisdiction, format, teamType, governingBody, tier = null] = known;
  return { jurisdiction, format, teamType, governingBody, tier };
}

// Validates an editor-supplied classification. Returns { data } with only
// the fields that were given, or { error }. governingBody '' clears it.
function parseClassification(body) {
  const data = {};
  const checks = [['jurisdiction', JURISDICTIONS], ['format', FORMATS], ['teamType', TEAM_TYPES]];
  for (const [field, options] of checks) {
    if (body[field] === undefined) continue;
    if (!options.some((o) => o.key === body[field])) {
      return { error: `${field} must be one of: ${options.map((o) => o.key).join(', ')}` };
    }
    data[field] = body[field];
  }
  if (body.tier !== undefined) {
    if (body.tier === null || body.tier === '') {
      data.tier = null;
    } else {
      const tier = Number(body.tier);
      if (!Number.isInteger(tier) || tier < 1 || tier > 20) return { error: 'tier must be a whole number from 1 to 20, or empty' };
      data.tier = tier;
    }
  }
  if (body.governingBody !== undefined) {
    if (body.governingBody !== null && typeof body.governingBody !== 'string') return { error: 'governingBody must be text' };
    const value = (body.governingBody || '').trim();
    if (value.length > 60) return { error: 'governingBody must be 60 characters or fewer' };
    data.governingBody = value || null;
  }
  return { data };
}

module.exports = { JURISDICTIONS, FORMATS, TEAM_TYPES, KNOWN, classificationFor, parseClassification };
