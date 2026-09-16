// Monitoring engine, fetch stage — pulls new candidate items from every
// active Source into MonitoredItem rows for the newsroom review queue
// (public/admin/monitoring.html). Nothing here ever reaches the public
// site: see prisma/schema.prisma's Source/MonitoredItem comment block and
// BLUEPRINT.md §11 for why that's a deliberate, separate decision.
//
// One file, one function per fetchMethod — flat, matching every other job
// in this directory rather than a subfolder-per-adapter structure.
//
// See server/index.js for why this guard exists — some Node 18 patch
// releases don't expose File as a global even though node:buffer has
// carried it since 18.13, and undici (pulled in by cheerio) needs it at
// require time. Repeated here so this file is also safe to run standalone.
if (typeof globalThis.File === 'undefined') {
  globalThis.File = require('node:buffer').File;
}

const cheerio = require('cheerio');
const RssParser = require('rss-parser');
const prisma = require('../db');
const { assertPublicUrl } = require('../lib/assertPublicUrl');

const USER_AGENT = 'Mozilla/5.0 (compatible; TheSportscastMonitorBot/1.0; +https://sportscast-production-c267.up.railway.app)';

// Category defaults, in minutes — a per-source Source.fetchIntervalCron
// override (a plain cron expression) takes priority when set; these are
// just the fallback cadence. Government/news sources publish often enough
// to justify a shorter poll; the rest change slowly.
const DEFAULT_INTERVAL_MINUTES = {
  NEWS: 30,
  GOVERNMENT: 30,
  CLUB: 60,
  STADIUM_PROJECT: 60,
  CAF: 60,
  SOCIAL: 60,
};

const rssParser = new RssParser();

function isDue(source) {
  if (!source.lastFetchedAt) return true;
  const intervalMinutes = source.fetchIntervalCron
    ? null // a real cron override means "let the scheduler decide", not this interval check
    : DEFAULT_INTERVAL_MINUTES[source.category] || 60;
  if (intervalMinutes === null) return true;
  const dueAt = new Date(source.lastFetchedAt.getTime() + intervalMinutes * 60 * 1000);
  return dueAt <= new Date();
}

async function fetchRss(source) {
  await assertPublicUrl(source.url);
  const feed = await rssParser.parseURL(source.url);
  return (feed.items || [])
    .filter((item) => item.link && item.title)
    .map((item) => ({
      externalUrl: item.link,
      title: item.title.trim(),
      snippet: (item.contentSnippet || item.content || '').trim().slice(0, 500) || null,
      publishedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
    }));
}

async function fetchHtmlList(source) {
  if (!source.listItemSelector || !source.titleSelector || !source.linkSelector) {
    throw new Error('HTML_LIST source is missing listItemSelector/titleSelector/linkSelector.');
  }
  await assertPublicUrl(source.url);
  const res = await fetch(source.url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${source.url} -> ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const items = [];

  $(source.listItemSelector).each((_, el) => {
    const node = $(el);
    const title = node.find(source.titleSelector).first().text().trim();
    const hrefRaw = node.find(source.linkSelector).first().attr('href');
    if (!title || !hrefRaw) return; // malformed row — skip rather than guess

    let externalUrl;
    try {
      externalUrl = new URL(hrefRaw, source.url).toString();
    } catch {
      return; // unparseable href — skip
    }

    const dateText = source.dateSelector ? node.find(source.dateSelector).first().text().trim() : null;
    const parsedDate = dateText ? new Date(dateText) : null;

    items.push({
      externalUrl,
      title,
      snippet: null,
      publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
    });
  });

  return items;
}

// `Source.url` for a YOUTUBE_CHANNEL source holds the channel ID (e.g.
// "UCxxxxxxxxxxxxxxxxxxxxxx"), not a channel URL — see the Sources admin
// form's help text. A channel's "uploads" playlist ID is always the same
// string with the "UC" prefix replaced by "UU" — a well-known YouTube
// convention that lets this use the cheap playlistItems.list endpoint (1
// quota unit) instead of search.list (100 units) for the same result.
async function fetchYoutubeChannel(source) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn('[runMonitoringFetch] YOUTUBE_API_KEY not set — skipping YouTube sources.');
    return [];
  }

  const channelId = source.url.trim();
  if (!channelId.startsWith('UC')) {
    throw new Error(`YOUTUBE_CHANNEL source's url should be a channel ID starting with "UC" (got "${channelId}").`);
  }
  const uploadsPlaylistId = `UU${channelId.slice(2)}`;

  const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=10&playlistId=${uploadsPlaylistId}&key=${apiKey}`;
  const res = await fetch(apiUrl);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube playlistItems -> ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();

  return (data.items || [])
    .filter((item) => item.snippet?.resourceId?.videoId && item.snippet?.title)
    .map((item) => ({
      externalUrl: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
      title: item.snippet.title.trim(),
      snippet: (item.snippet.description || '').trim().slice(0, 500) || null,
      publishedAt: item.snippet.publishedAt ? new Date(item.snippet.publishedAt) : null,
    }));
}

async function fetchForSource(source) {
  switch (source.fetchMethod) {
    case 'RSS':
      return fetchRss(source);
    case 'HTML_LIST':
      return fetchHtmlList(source);
    case 'YOUTUBE_CHANNEL':
      return fetchYoutubeChannel(source);
    case 'MANUAL':
      // Never auto-fetched — an editor adds items directly via
      // POST /api/sources/:id/items (see server/routes/sources.js).
      return [];
    default:
      throw new Error(`Unknown fetchMethod "${source.fetchMethod}".`);
  }
}

async function runMonitoringFetch() {
  const sources = await prisma.source.findMany({ where: { isActive: true, fetchMethod: { not: 'MANUAL' } } });
  const due = sources.filter(isDue);

  let created = 0;
  for (const source of due) {
    try {
      const items = await fetchForSource(source);
      const beforeCount = await prisma.monitoredItem.count({ where: { sourceId: source.id } });
      for (const item of items) {
        await prisma.monitoredItem.upsert({
          where: { sourceId_externalUrl: { sourceId: source.id, externalUrl: item.externalUrl } },
          create: { sourceId: source.id, ...item },
          update: {}, // an item already on file keeps its review status/AI fields untouched — only new items get inserted
        });
      }
      const afterCount = await prisma.monitoredItem.count({ where: { sourceId: source.id } });
      created += afterCount - beforeCount;
      await prisma.source.update({
        where: { id: source.id },
        data: { lastFetchedAt: new Date(), syncStatus: 'OK', lastError: null },
      });
      console.log(`[runMonitoringFetch] OK: ${source.name} (${items.length} items seen).`);
    } catch (err) {
      console.error(`[runMonitoringFetch] FAILED — ${source.name}:`, err.message);
      await prisma.source
        .update({ where: { id: source.id }, data: { lastFetchedAt: new Date(), syncStatus: 'ERROR', lastError: err.message.slice(0, 500) } })
        .catch(() => {});
    }
  }
  console.log(`[runMonitoringFetch] Done: ${due.length} sources checked, ${created} new items.`);
}

module.exports = { runMonitoringFetch };

if (require.main === module) {
  runMonitoringFetch()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
