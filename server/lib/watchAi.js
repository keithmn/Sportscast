// X watch: "Ask Claude" for a post the pattern parser couldn't read
// (unusual wording, a score inside a sentence, Swahili/Sheng). Run only
// when an editor clicks it — never automatically — so the cost stays at a
// fraction of a cent per click. Same model and tool-call pattern as
// server/jobs/runMonitoringEnrich.js. It only reads the post's own text;
// it never looks anything up, and its output is a lead, not a source.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const KINDS = ['RESULT', 'LIVE', 'LINEUP', 'FIXTURE', 'TRANSFER', 'INJURY', 'NEWS'];

async function analysePost(text) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY is not set on the server, so "Ask Claude" is unavailable.');
    err.status = 400;
    throw err;
  }
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system:
      'You read posts by Kenyan sports journalists and extract match scores exactly as stated. ' +
      'Never guess a score, a team or a status that the post does not state. Posts may mix English, Swahili and Sheng.',
    messages: [{
      role: 'user',
      content: `Post:\n"""\n${String(text).slice(0, 4000)}\n"""\n\nRecord what it reports with the record_post tool. Leave matches empty if it states no score.`,
    }],
    tools: [{
      name: 'record_post',
      description: 'Record the post type, every match score it states, and a one-line note.',
      input_schema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: KINDS },
          matches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                homeTeam: { type: 'string' },
                awayTeam: { type: 'string' },
                homeScore: { type: 'integer', minimum: 0 },
                awayScore: { type: 'integer', minimum: 0 },
                status: { type: 'string', enum: ['FT', 'HT', 'LIVE', 'UNKNOWN'] },
                minute: { type: ['string', 'null'] },
                penalties: { type: ['string', 'null'], description: 'e.g. "4-3" if a shootout is stated' },
              },
              required: ['homeTeam', 'awayTeam', 'homeScore', 'awayScore', 'status'],
            },
          },
          note: { type: 'string', description: 'One short factual line on what the post says.' },
        },
        required: ['kind', 'matches', 'note'],
      },
    }],
    tool_choice: { type: 'tool', name: 'record_post' },
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) throw new Error('Claude did not return a result for this post.');
  const { kind, matches, note } = toolUse.input;
  return {
    kind: KINDS.includes(kind) ? kind : 'NEWS',
    items: (Array.isArray(matches) ? matches : []).slice(0, 20).map((m) => ({
      homeTeam: String(m.homeTeam).slice(0, 60),
      awayTeam: String(m.awayTeam).slice(0, 60),
      homeScore: Math.max(0, Math.round(Number(m.homeScore) || 0)),
      awayScore: Math.max(0, Math.round(Number(m.awayScore) || 0)),
      status: ['FT', 'HT', 'LIVE'].includes(m.status) ? m.status : 'UNKNOWN',
      minute: m.minute ? String(m.minute).slice(0, 8) : null,
      penalties: m.penalties ? String(m.penalties).slice(0, 8) : null,
      hasMarker: true, // Claude read it as a score on purpose
    })),
    aiNote: String(note || '').slice(0, 500),
  };
}

module.exports = { analysePost };
