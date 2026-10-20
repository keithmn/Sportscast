// Rules for entering a result (2026-10-19), shared by the result routes.
//
// Outcomes: a game can finish in normal time, after extra time, on
// penalties (the shoot-out is kept separately from the score), be awarded
// by the league or given as a walkover, or be abandoned. Before this a cup
// tie settled on penalties showed as a plain draw.
//
// Sanity checks: things that are almost always a typo get a warning the
// editor must confirm (not a refusal — the odd 9-0 does happen).

const DECIDED_BY = ['EXTRA_TIME', 'PENALTIES', 'AWARDED', 'WALKOVER'];

// Scores above these get "Is that right?" — per sport, by one side.
const HIGH_SCORE = { football: 8, hockey: 10, rugby: 100, basketball: 160, volleyball: 4 };

const isScore = (n) => Number.isInteger(n) && n >= 0 && n <= 999;

// Returns an error message for an impossible combination, or null.
function outcomeProblem(row) {
  if (row.decidedBy != null && row.decidedBy !== '' && !DECIDED_BY.includes(row.decidedBy)) {
    return `"How it was decided" must be one of ${DECIDED_BY.join(', ')}`;
  }
  if (row.decidedBy === 'PENALTIES') {
    if (row.homeScore !== row.awayScore) return 'A penalty shoot-out only follows a level score — enter the score after extra time';
    if (!isScore(row.homePenalties) || !isScore(row.awayPenalties) || row.homePenalties > 50 || row.awayPenalties > 50) return 'Enter both penalty shoot-out scores';
    if (row.homePenalties === row.awayPenalties) return "A shoot-out can't end level";
  }
  return null;
}

// Warnings for a result about to be saved: [string]. `fixture` is the
// stored fixture (kickoff, teams), `sportSlug` its sport.
function sanityWarnings(fixture, row, sportSlug, now = Date.now()) {
  const warnings = [];
  const game = `${fixture.homeTeam} v ${fixture.awayTeam}`;
  const limit = HIGH_SCORE[sportSlug];
  if (limit && (row.homeScore >= limit || row.awayScore >= limit)) {
    warnings.push(`${game} ${row.homeScore}–${row.awayScore}: an unusually high ${sportSlug} score. Is it right?`);
  }
  if (sportSlug === 'basketball' && row.homeScore != null && (row.homeScore < 20 || row.awayScore < 20)) {
    warnings.push(`${game} ${row.homeScore}–${row.awayScore}: an unusually low basketball score. Is it right?`);
  }
  if (new Date(fixture.kickoff).getTime() > now + 30 * 60 * 1000) {
    warnings.push(`${game} hasn't kicked off yet (it's set for ${new Date(fixture.kickoff).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}). Is the date right?`);
  }
  return warnings;
}

// Warnings for a new game being added: an odd kick-off hour, or a team
// that already plays that day in the competition.
function newGameWarnings(game, sameDayGames) {
  const warnings = [];
  const hour = Number(new Date(game.kickoff.getTime() + 3 * 3600000).toISOString().slice(11, 13));
  if (hour < 7) warnings.push(`${game.homeTeam} v ${game.awayTeam} kicks off at ${String(hour).padStart(2, '0')}:00 Nairobi time. Is the time right?`);
  const teams = [game.homeTeam.toLowerCase(), game.awayTeam.toLowerCase()];
  sameDayGames.forEach((g) => {
    const clash = [g.homeTeam, g.awayTeam].map((t) => (t || '').toLowerCase()).find((t) => teams.includes(t));
    if (clash) warnings.push(`${clash} already plays that day (${g.homeTeam} v ${g.awayTeam}). Is the date right?`);
  });
  return warnings;
}

// How a result reads publicly, after the score: "(4–3 pens)", "a.e.t." …
function outcomeSuffix(f) {
  if (f.decidedBy === 'PENALTIES' && f.homePenalties != null) return ` (${f.homePenalties}–${f.awayPenalties} pens)`;
  if (f.decidedBy === 'EXTRA_TIME') return ' a.e.t.';
  if (f.decidedBy === 'AWARDED') return ' (awarded)';
  if (f.decidedBy === 'WALKOVER') return ' (walkover)';
  return '';
}

module.exports = { DECIDED_BY, outcomeProblem, sanityWarnings, newGameWarnings, outcomeSuffix, isScore };
