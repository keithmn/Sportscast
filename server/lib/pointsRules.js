// How each sport's league table awards points, keyed by Sport.slug — the
// one place both the admin "Recalculate table from results" button
// (routes/competitions.js) and the results desk's reconcile step
// (scripts/results-desk/desk.js) read it from, so the two can never
// disagree about a rule.
//
// Only sports whose table can be rebuilt from final scores alone are
// listed. Basketball isn't yet: the KBF publishes no table, and its
// playoff games share the competition, so a rebuilt table would count
// them. Rugby isn't: Kenya Cup tables include try and losing bonus
// points, which need more than the score. A sport that isn't listed keeps
// manual standings entry. Add a sport only with a sourced rule.

const POINTS_RULES = {
  football: { win: 3, draw: 1, loss: 0, source: 'FKF competition rules (3/1/0), as on footballkenya.org league tables' },
  // KHU publishes no written rule; every row of its official PLM 2026 table
  // satisfies Pts = 3W + D, and the table rebuilds exactly from its 66
  // published results (checked 2026-10-17).
  hockey: { win: 3, draw: 1, loss: 0, source: 'Kenya Hockey Union PLM 2026 table, kenyahockeyunion.org (derived: Pts = 3W + D on every row)' },
};

function pointsRuleFor(sportSlug) {
  return POINTS_RULES[sportSlug] || null;
}

// Builds table rows from finished results ([{ home, away, homeScore,
// awayScore }]). goalsFor/goalsAgainst hold whatever the sport scores —
// goals, or points in basketball — matching StandingRow's generic columns.
function computeTable(results, rule) {
  const t = new Map();
  const row = (name) => {
    if (!t.has(name)) t.set(name, { teamName: name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 });
    return t.get(name);
  };
  for (const { home, away, homeScore, awayScore } of results) {
    const h = row(home); const a = row(away);
    h.played++; a.played++;
    h.goalsFor += homeScore; h.goalsAgainst += awayScore;
    a.goalsFor += awayScore; a.goalsAgainst += homeScore;
    if (homeScore > awayScore) { h.won++; a.lost++; h.points += rule.win; a.points += rule.loss; }
    else if (homeScore < awayScore) { a.won++; h.lost++; a.points += rule.win; h.points += rule.loss; }
    else { h.drawn++; a.drawn++; h.points += rule.draw; a.points += rule.draw; }
  }
  // Points, then score difference, then scored, then name — the name only
  // so re-running on unchanged data always gives the same order.
  return [...t.values()].sort((x, y) =>
    y.points - x.points
    || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst)
    || y.goalsFor - x.goalsFor
    || x.teamName.localeCompare(y.teamName));
}

module.exports = { POINTS_RULES, pointsRuleFor, computeTable };
