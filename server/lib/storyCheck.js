// Stories checked against the data (2026-10-20): a match report that
// says "Gor Mahia 2-1 AFC Leopards" while the result on the site is 2-2
// is caught before it's published. Reads the scores in the title, dek and
// body with the same parser as X Watch, keeps those naming the linked
// match's two teams, and compares them with the fixture.

const { parsePost } = require('./postParser');
const { sameTeam } = require('./watchMatching');

// Returns [warning] — empty when nothing disagrees.
function storyScoreProblems(article, fixture) {
  if (!fixture || fixture.status !== 'FINISHED' || fixture.homeScore == null) return [];
  const text = [article.title, article.dek, article.body].filter(Boolean).join('\n');
  const { items } = parsePost(text);
  const problems = [];
  for (const item of items) {
    const straight = sameTeam(item.homeTeam, fixture.homeTeam) && sameTeam(item.awayTeam, fixture.awayTeam);
    const reversed = sameTeam(item.homeTeam, fixture.awayTeam) && sameTeam(item.awayTeam, fixture.homeTeam);
    if (!straight && !reversed) continue;
    const [h, a] = reversed ? [item.awayScore, item.homeScore] : [item.homeScore, item.awayScore];
    if (h !== fixture.homeScore || a !== fixture.awayScore) {
      problems.push(`The story says ${item.homeTeam} ${item.homeScore}–${item.awayScore} ${item.awayTeam}; the result on the site is ${fixture.homeTeam} ${fixture.homeScore}–${fixture.awayScore} ${fixture.awayTeam}.`);
    }
  }
  return [...new Set(problems)];
}

module.exports = { storyScoreProblems };
