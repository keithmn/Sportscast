// Monitoring engine, enrichment stage — summarizes/scores/tags every
// MonitoredItem the fetch stage (runMonitoringFetch.js) has found but this
// job hasn't processed yet. Uses Claude (an existing LLM API, not a
// self-hosted or custom-trained model — see the approved plan) purely to
// help an editor triage faster; it never writes to Article or publishes
// anything itself.

const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../db');

// A lightweight classification/summarization task — Haiku is deliberately
// the default here (fast, cheap, plenty for "summarize this + score
// relevance"), not the flagship model this session itself runs on.
// Override via ANTHROPIC_MODEL if summaries need to be sharper.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 20;
const CALL_DELAY_MS = 400; // plain paced loop, same ethos as syncLeagues.js's football-data.org pacing

const CATEGORY_GUIDANCE = {
  NEWS: 'A general sports news source — most items should already be on-topic; score down only for content unrelated to sport entirely.',
  GOVERNMENT: 'A government press-release source — most output is NOT sports-related. Score strictly: only stadium/sports-fund/sports-ministry/hosting-bid content should score high.',
  CLUB: "A club's own site or feed — almost everything here is relevant by definition; score down only for pure administrative noise (e.g. a generic privacy-policy update).",
  STADIUM_PROJECT: 'Infrastructure/stadium-project tracking — score high for anything about construction, funding, contracts, or hosting readiness.',
  CAF: 'Continental football-governance content (CAF) — score high for hosting decisions, eligibility rulings, competition format changes; score down for unrelated continental-body administrative news.',
  SOCIAL: 'A social/video source — score based on whether the content is substantive sports news, not routine engagement content.',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichOne(anthropic, item) {
  const guidance = CATEGORY_GUIDANCE[item.source.category] || CATEGORY_GUIDANCE.NEWS;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system:
      'You triage sports-news leads for a Kenyan/East African sports newsroom. ' +
      'Be terse and factual — no adjectives, no speculation beyond what the text supports.',
    messages: [
      {
        role: 'user',
        content:
          `Source: ${item.source.name} (category: ${item.source.category}). ${guidance}\n\n` +
          `Title: ${item.title}\n` +
          `Excerpt: ${item.snippet || '(none provided)'}\n\n` +
          'Record your triage of this item using the record_triage tool.',
      },
    ],
    tools: [
      {
        name: 'record_triage',
        description: 'Record a 2-3 sentence summary, a 0-100 sport-relevance score, and free-text category tags for one monitored item.',
        input_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: '2-3 sentence factual summary of the item.' },
            relevanceScore: { type: 'integer', minimum: 0, maximum: 100, description: 'How relevant this is to Kenyan/East African sport specifically, not general newsworthiness.' },
            categoryTags: { type: 'array', items: { type: 'string' }, description: 'Up to 5 short free-text tags (e.g. sport, competition, club names mentioned).' },
          },
          required: ['summary', 'relevanceScore', 'categoryTags'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'record_triage' },
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) throw new Error('Model did not return a record_triage tool call.');

  const { summary, relevanceScore, categoryTags } = toolUse.input;
  return {
    aiSummary: String(summary).slice(0, 1000),
    aiRelevanceScore: Math.max(0, Math.min(100, Math.round(Number(relevanceScore) || 0))),
    aiCategoryTags: Array.isArray(categoryTags) ? categoryTags.slice(0, 5).join(', ') : null,
  };
}

async function runMonitoringEnrich() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[runMonitoringEnrich] ANTHROPIC_API_KEY not set — skipping. Items stay unsummarized in the review queue.');
    return;
  }

  const anthropic = new Anthropic({ apiKey });
  const pending = await prisma.monitoredItem.findMany({
    where: { aiSummary: null },
    include: { source: true },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
  });

  let enriched = 0;
  for (const item of pending) {
    try {
      const result = await enrichOne(anthropic, item);
      await prisma.monitoredItem.update({ where: { id: item.id }, data: result });
      enriched += 1;
    } catch (err) {
      console.error(`[runMonitoringEnrich] FAILED — item ${item.id} (${item.title.slice(0, 60)}):`, err.message);
    }
    await sleep(CALL_DELAY_MS);
  }
  console.log(`[runMonitoringEnrich] Done: ${enriched}/${pending.length} items enriched.`);
}

module.exports = { runMonitoringEnrich };

if (require.main === module) {
  runMonitoringEnrich()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
