const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-');
}

async function main() {
  console.log('Seeding database...');

  // ---------------- Users ----------------
  // Data stewards no longer live here — the player/club database (and its
  // accounts) moved to the separate Underdoggs Data service.
  const demoPassword = await bcrypt.hash('underdoggs2026', 10);
  await prisma.user.createMany({
    data: [
      { name: 'Admin', email: 'admin@underdoggs.co.ke', passwordHash: demoPassword, role: 'ADMIN' },
      { name: 'Editor', email: 'editor@underdoggs.co.ke', passwordHash: demoPassword, role: 'EDITOR' },
    ],
  });

  // ---------------- Sports (article-tagging taxonomy) ----------------
  // Boxing, Martial Arts, and Darts are tagged individually even though they
  // all ship under one show ("The Circuit") — a show is a packaging
  // decision, a sport is a data category, and collapsing the two would make
  // boxing/darts coverage unfindable in search and stats.
  const sportNames = [
    'Football', 'Rugby', 'Athletics', 'Hockey', 'Basketball', 'Volleyball',
    'Motorsport', 'University Sports', 'Boxing', 'Martial Arts', 'Darts',
  ];
  const sports = {};
  for (const name of sportNames) {
    sports[name] = await prisma.sport.create({ data: { name, slug: slugify(name) } });
  }

  // ---------------- Authors ----------------
  const authorNames = ['Samuel Njoroge', 'Grace Akinyi', 'Brian Omondi', 'Wanjiru Kamau', 'Derrick Mwangi', 'Eunice Adhiambo', 'The Sportscast Newsroom'];
  const authors = {};
  for (const name of authorNames) {
    authors[name] = await prisma.author.create({ data: { name, slug: slugify(name), bio: `${name} covers Kenyan sport for The Sportscast.` } });
  }

  // ---------------- Tags ----------------
  const tagNames = ['Feature', 'Transfers', 'Analysis', 'Interview'];
  const tags = {};
  for (const name of tagNames) {
    tags[name] = await prisma.tag.create({ data: { name, slug: slugify(name) } });
  }

  // ---------------- Articles (mirrors the static homepage stories) ----------------
  const articleData = [
    {
      title: 'Eliud Kipchoge made a generation believe. Who carries the mantle next?',
      dek: "Kenya's greatest distance runner is approaching the end. The question isn't whether a successor will emerge — it's whether we'll have the systems to find and support them when they do.",
      body: "For two decades, Eliud Kipchoge has been the reference point for what Kenyan distance running can be — not just fast, but disciplined, global, and generational. As his competitive window narrows, the conversation inside Kenyan athletics is shifting from admiration to succession.\n\nThe talent pipeline isn't the problem. Rift Valley training camps continue to produce runners with extraordinary raw ability. What's less certain is whether the surrounding infrastructure — coaching depth, injury management, financial support for athletes before they're famous — can consistently turn that talent into the next Kipchoge rather than another burned-out prospect.\n\nWe spoke to camp coaches and former athletes about what actually needs to change, and why the answer has less to do with talent and more to do with systems.",
      sport: 'Athletics',
      author: 'Samuel Njoroge',
      tag: 'Feature',
    },
    {
      title: 'Harambee Stars need more than hope. Here is what the rebuild actually requires.',
      dek: 'A coaching change is not a strategy. We break down what a credible Harambee Stars rebuild looks like from the ground up.',
      body: "Every Harambee Stars cycle seems to begin the same way: a new coach, a wave of optimism, and a promise that this time will be different. It rarely is, and the reasons have little to do with any single manager.\n\nWe examined the structural issues — inconsistent domestic league scheduling, thin scouting networks abroad, and a federation that has struggled with continuity — that outlast any individual appointment.\n\nA real rebuild means fixing the boring, unglamorous parts of the pipeline long before it means hiring the next big-name coach.",
      sport: 'Football',
      author: 'Grace Akinyi',
      tag: 'Analysis',
    },
    {
      title: "Kenya Sevens is back on the circuit. Inside the Shujaa's preparation.",
      dek: "The Shujaa return to the HSBC Series with something to prove. We went inside their pre-season camp to find out what's changed.",
      body: "The Shujaa's return to the World Series carries more weight than a typical season opener. After a difficult run of results, this camp has been noticeably more focused on conditioning and set-piece discipline than in previous years.\n\nWe sat in on training sessions in Nairobi and spoke with players about what's different this time — and whether it's enough to close the gap with the series' top-tier teams.",
      sport: 'Rugby',
      author: 'Brian Omondi',
      tag: 'Feature',
    },
    {
      title: 'Hockey in Kenya has a visibility problem. The Blackbucks are trying to fix it.',
      dek: 'A sport with genuine depth and a strong club structure — almost invisible to the mainstream. That has to change.',
      body: "Kenyan hockey has a stronger competitive base than most fans realize — a real club league, a national team with continental pedigree, and a growing junior structure. What it doesn't have is coverage.\n\nWe spoke with Blackbucks Hockey Club about their push to get the sport in front of a wider Kenyan audience, from social media strategy to matchday presentation.",
      sport: 'Hockey',
      author: 'Wanjiru Kamau',
      tag: 'Feature',
    },
    {
      title: "Inside the growing basketball movement reshaping Nairobi's youth sport scene.",
      dek: 'From Eastleigh to Karen, courts that did not exist five years ago are now producing players with continental ambitions.',
      body: "A quiet basketball boom is underway in Nairobi. Community courts, weekend leagues, and grassroots academies have multiplied over the past five years, driven largely by young organizers rather than any federation initiative.\n\nWe toured several of these programs to understand what's driving the growth, and what it would take to connect this grassroots energy to a real pathway into the national program.",
      sport: 'Basketball',
      author: 'Derrick Mwangi',
      tag: 'Feature',
    },
    {
      title: "Pipeline is strong. Why Kenyan volleyball's best years might still be ahead.",
      dek: 'Kenya has produced continental champions and Olympic athletes from this sport for decades. The next generation is even more talented.',
      body: "Kenyan volleyball doesn't get the attention its results deserve. Continental titles and a deep talent pipeline through schools and universities have quietly built one of the country's most consistent sporting programs.\n\nWe look at what's fueling the current generation of talent, and the investment gaps that still stand between steady success and true global relevance.",
      sport: 'Volleyball',
      author: 'Eunice Adhiambo',
      tag: 'Analysis',
    },
  ];

  const now = new Date();
  for (let i = 0; i < articleData.length; i++) {
    const a = articleData[i];
    const publishedAt = new Date(now.getTime() - (articleData.length - i) * 86400000);
    await prisma.article.create({
      data: {
        title: a.title,
        slug: slugify(a.title).slice(0, 80),
        dek: a.dek,
        body: a.body,
        sportId: sports[a.sport].id,
        authorId: authors[a.author].id,
        tags: { connect: [{ id: tags[a.tag].id }] },
        status: 'PUBLISHED',
        contentType: 'ARTICLE',
        publishedAt,
      },
    });
  }

  // ---------------- The Sportscast (flagship, video post) ----------------
  // Four episodes seeded (not just one) so the homepage's featured carousel
  // (js/home.js loadFlagshipCarousel, limit=4) has real slides to scroll
  // through instead of degrading to its single-card fallback.
  const flagshipEpisodes = [
    {
      title: 'The State of Kenyan Football: Where Are We Headed?',
      slug: 'episode-001-state-of-kenyan-football',
      dek: 'Feat. guests from the KPL coaching and player community',
      body: "We open with the hard question: what does Kenyan football actually look like right now? We talk club football, Harambee Stars, what's working in the KPL, and what needs to change. No sugarcoating. No borrowed narratives. Just Kenyan football, from people who know it.",
      sport: 'Football', episodeLabel: 'Episode 001', runtimeLabel: '58 min', daysAgo: 21,
    },
    {
      title: 'Rugby, Respect, and Rebuilding the Shujaa Brand',
      slug: 'episode-002-shujaa-brand',
      dek: 'Feat. a former Sevens international on what the team needs to compete again',
      body: "Kenya Sevens used to be appointment viewing on the World Series. We talk to a former international about what changed, what a real rebuild requires, and why belief alone won't fix it.",
      sport: 'Rugby', episodeLabel: 'Episode 002', runtimeLabel: '52 min', daysAgo: 14,
    },
    {
      title: 'Basketball Is Kenya\'s Quiet Growth Story',
      slug: 'episode-003-basketball-growth-story',
      dek: 'Feat. coaches and organizers from Nairobi\'s grassroots court scene',
      body: "Nobody's talking about it, but basketball in Nairobi has quietly built real depth over the last five years. We sit down with the coaches and organizers actually doing the work at grassroots level.",
      sport: 'Basketball', episodeLabel: 'Episode 003', runtimeLabel: '49 min', daysAgo: 7,
    },
    {
      title: 'Athletics After Kipchoge: Who Actually Carries It Forward?',
      slug: 'episode-004-athletics-after-kipchoge',
      dek: 'Feat. Rift Valley training camp coaches on the next generation',
      body: "Every conversation about Kenyan athletics eventually becomes a conversation about succession. We go to the training camps to ask the people closest to it: who's actually next, and what do they need to get there?",
      sport: 'Athletics', episodeLabel: 'Episode 004', runtimeLabel: '61 min', daysAgo: 1,
    },
  ];
  for (const ep of flagshipEpisodes) {
    await prisma.article.create({
      data: {
        title: ep.title,
        slug: ep.slug,
        dek: ep.dek,
        body: ep.body,
        sportId: sports[ep.sport].id,
        authorId: authors['The Sportscast Newsroom'].id,
        status: 'PUBLISHED',
        contentType: 'VIDEO_POST',
        youtubeId: 'aqz-KE-bpKQ',
        videoSeries: 'The Sportscast',
        episodeLabel: ep.episodeLabel,
        runtimeLabel: ep.runtimeLabel,
        publishedAt: new Date(now.getTime() - ep.daysAgo * 86400000),
      },
    });
  }

  // ---------------- Niche shows (video posts) ----------------
  // Each show is a fixed weekly product, tagged to the sport(s) it covers.
  // "The Circuit" bundles several disciplines under one show identity —
  // see the sports list above for why Boxing/Martial Arts/Darts still get
  // their own Sport rows.
  const showEpisodes = [
    {
      show: 'The Hydration Break', sport: 'Football',
      title: "Gor Mahia's Away-Day Problem",
      dek: 'A seated 15-minute breakdown of the weekend across the Kenyan Premier League.',
      body: "This week: why Gor Mahia keep dropping points on the road, AFC Leopards' new-look midfield, and a Tusker FC performance nobody saw coming.",
      episodeLabel: 'Episode 023', runtimeLabel: '15 min', daysAgo: 3,
    },
    {
      show: 'The Hydration Break', sport: 'Football',
      title: 'Kakamega Homeboyz Are Building Something',
      dek: 'The weekend in Kenyan football, seated and unhurried.',
      body: "Kakamega Homeboyz's unbeaten run, a coaching change under pressure, and what the table actually says four games in.",
      episodeLabel: 'Episode 022', runtimeLabel: '14 min', daysAgo: 10,
    },
    {
      show: 'The Ruck', sport: 'Rugby',
      title: "Inside the Shujaa's Pre-Season Camp",
      dek: 'A fast 7-minute rundown of the weekend across Kenyan rugby.',
      body: "Kenya Sevens' conditioning-first pre-season, a Kenya Cup upset, and why this rebuild finally looks structural.",
      episodeLabel: 'Episode 009', runtimeLabel: '7 min', daysAgo: 5,
    },
    {
      show: 'Bully Off', sport: 'Hockey',
      title: 'The Blackbucks Push for Visibility',
      dek: 'The weekly digest for Kenyan hockey.',
      body: "Blackbucks Hockey Club's push for a wider audience, a tight top-of-table finish, and a national junior program worth watching.",
      episodeLabel: 'Episode 006', runtimeLabel: '9 min', daysAgo: 6,
    },
    {
      show: 'Fast Break', sport: 'Basketball',
      title: "Nairobi's Youth Courts Are Producing Talent",
      dek: 'The weekly digest for Kenyan basketball.',
      body: "A look at the grassroots courts reshaping Nairobi's youth scene, and the weekend's results across the local league.",
      episodeLabel: 'Episode 006', runtimeLabel: '8 min', daysAgo: 7,
    },
    {
      show: 'The Circuit', sport: 'Athletics',
      title: 'Who Carries Kenyan Distance Running Next?',
      dek: 'Athletics, boxing, martial arts, and darts — every individual sport, one show.',
      body: "The succession question in Kenyan distance running, a rising national boxing prospect, and results from the weekend's meets.",
      episodeLabel: 'Episode 006', runtimeLabel: '12 min', daysAgo: 4,
    },
  ];

  for (const ep of showEpisodes) {
    await prisma.article.create({
      data: {
        title: ep.title,
        slug: slugify(`${ep.show} ${ep.episodeLabel} ${ep.title}`).slice(0, 90),
        dek: ep.dek,
        body: ep.body,
        sportId: sports[ep.sport].id,
        authorId: authors['The Sportscast Newsroom'].id,
        status: 'PUBLISHED',
        contentType: 'VIDEO_POST',
        youtubeId: 'aqz-KE-bpKQ',
        videoSeries: ep.show,
        episodeLabel: ep.episodeLabel,
        runtimeLabel: ep.runtimeLabel,
        publishedAt: new Date(now.getTime() - ep.daysAgo * 86400000),
      },
    });
  }

  // ---------------- News briefs ----------------
  // Short, fast-turnaround factual updates — same Article model as features,
  // just flagged isBrief so they surface on /news.html instead of the Archive's
  // feature list. Still tagged and sport-categorized like anything else.
  const briefs = [
    {
      title: 'Gor Mahia Confirm Signing of Winger Ahead of New Season',
      dek: 'The club moved quickly to secure a replacement after last month\'s departures.',
      body: 'Gor Mahia FC have confirmed the signing of a new winger on a two-year deal, the club announced Monday. Terms were not disclosed.',
      sport: 'Football', tag: 'Transfers', daysAgo: 1,
    },
    {
      title: 'Kenya Sevens Fixture Moved to Saturday Due to Venue Clash',
      dek: 'A scheduling conflict at the original venue pushed the match back by a day.',
      body: 'The Kenya Sevens\' upcoming fixture has been moved from Friday to Saturday after a venue booking conflict, organizers confirmed. Kickoff time is unchanged.',
      sport: 'Rugby', tag: 'Analysis', daysAgo: 2,
    },
    {
      title: 'KPL Announces Revised Fixture List for Rest of Season',
      dek: 'Several rescheduled matches from earlier postponements have now been slotted in.',
      body: 'The Kenyan Premier League has published a revised fixture list incorporating matches postponed earlier in the season. Clubs have been notified directly.',
      sport: 'Football', tag: 'Analysis', daysAgo: 4,
    },
  ];
  for (const b of briefs) {
    await prisma.article.create({
      data: {
        title: b.title,
        slug: slugify(b.title).slice(0, 80),
        dek: b.dek,
        body: b.body,
        sportId: sports[b.sport].id,
        authorId: authors['The Sportscast Newsroom'].id,
        tags: { connect: [{ id: tags[b.tag].id }] },
        status: 'PUBLISHED',
        contentType: 'ARTICLE',
        isBrief: true,
        publishedAt: new Date(now.getTime() - b.daysAgo * 86400000),
      },
    });
  }

  // ---------------- Scores & Fixtures: league shells only ----------------
  // Deliberately no standings/fixtures rows here — seeding fake scores would
  // be exactly the "faking comprehensiveness" this section was built to avoid.
  // Kenyan leagues (region: KENYA) are entered by the newsroom via
  // /admin/scores.html. Global leagues (region: GLOBAL) are API-sourced —
  // populated by server/jobs/syncLeagues.js, never by hand — their
  // externalId is football-data.org's free-tier competition code as of
  // 2026-08-19; reconfirm against their current coverage before relying on
  // this list long-term, since free-tier competition lists do change.
  const kpl = await prisma.league.create({
    data: {
      name: 'Kenyan Premier League',
      slug: slugify('Kenyan Premier League'),
      sportId: sports['Football'].id,
      source: 'MANUAL',
      region: 'KENYA',
    },
  });
  await prisma.league.create({
    data: {
      name: 'National Super League',
      slug: slugify('National Super League'),
      sportId: sports['Football'].id, // second tier of the same sport, not a separate Sport row
      source: 'MANUAL',
      region: 'KENYA',
    },
  });

  const globalLeagues = [
    { name: 'Premier League', code: 'PL' },
    { name: 'Championship', code: 'ELC' },
    { name: 'La Liga', code: 'PD' },
    { name: 'Bundesliga', code: 'BL1' },
    { name: 'Serie A', code: 'SA' },
    { name: 'Ligue 1', code: 'FL1' },
    { name: 'Eredivisie', code: 'DED' },
    { name: 'Primeira Liga', code: 'PPL' },
    { name: 'UEFA Champions League', code: 'CL' },
    { name: 'European Championship', code: 'EC' },
    { name: 'FIFA World Cup', code: 'WC' },
    { name: 'Campeonato Brasileiro Série A', code: 'BSA' },
  ];
  for (const l of globalLeagues) {
    await prisma.league.create({
      data: {
        name: l.name,
        slug: slugify(l.name),
        sportId: sports['Football'].id,
        source: 'API',
        region: 'GLOBAL',
        externalProvider: 'football-data.org',
        externalId: l.code,
      },
    });
  }

  // ---------------- Shop: KPL teams + kits ----------------
  // Reuses the same 4 real KPL clubs already referenced elsewhere in this
  // seed data's articles/episodes, for continuity. Kit photos are left
  // empty (honest placeholder, not fake — see Kit.photoUrl's comment in
  // the schema) since no real product photography exists yet; prices are
  // realistic placeholders for a demo, not confirmed retail figures — the
  // newsroom sets real prices via /admin/teams.html once these are actual
  // club deals. NSL teams aren't seeded here — left for the admin to add
  // once a confirmed current-season roster is in hand.
  const kplTeams = ['Gor Mahia FC', 'AFC Leopards', 'Tusker FC', 'Kakamega Homeboyz'];
  for (const name of kplTeams) {
    const team = await prisma.team.create({
      data: { name, slug: slugify(name), sportId: sports['Football'].id, leagueId: kpl.id },
    });
    await prisma.kit.createMany({
      data: [
        { teamId: team.id, label: 'Home', priceKesCents: 450000 },
        { teamId: team.id, label: 'Away', priceKesCents: 450000 },
      ],
    });
  }

  console.log('Seed complete.');
  console.log('Demo logins (password: underdoggs2026):');
  console.log('  admin@underdoggs.co.ke   (ADMIN)');
  console.log('  editor@underdoggs.co.ke  (EDITOR)');
  console.log('Scores & Fixtures: KPL + NSL shells created (manual entry via /admin/scores.html); 12 global leagues seeded for football-data.org sync (run `npm run sync:leagues`).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
