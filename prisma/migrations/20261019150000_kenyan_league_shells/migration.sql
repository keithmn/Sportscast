-- Kenyan leagues outside football (2026-10-19): Kenya Cup, KBF Premier
-- League, KHU Premier League and National Boxing League existed only in
-- databases where someone had added them by hand, so editors elsewhere
-- (production included) had nothing to enter results into. Adds each one
-- only if no competition with that slug exists, classified the same as
-- KNOWN in server/lib/competitionClassification.js, with its current
-- season. A fresh database gets them from prisma/seed.js instead (its
-- Sport rows don't exist yet when migrations run, so these insert nothing
-- there).

INSERT INTO "Competition" ("id", "name", "slug", "sportId", "source", "externalProvider", "region", "category", "jurisdiction", "format", "teamType", "governingBody", "tier", "syncSquads", "isActive")
SELECT 'cmp_kenya_cup_shell', 'Kenya Cup', 'kenya-cup', s."id", 'SCRAPED', 'kenyacup.co.ke', 'KENYA', 'LEAGUE', 'NATIONAL', 'LEAGUE', 'CLUB', 'KRU', 1, false, true
FROM "Sport" s WHERE s."name" = 'Rugby' AND NOT EXISTS (SELECT 1 FROM "Competition" WHERE "slug" = 'kenya-cup');

INSERT INTO "Competition" ("id", "name", "slug", "sportId", "source", "region", "category", "jurisdiction", "format", "teamType", "governingBody", "tier", "syncSquads", "isActive")
SELECT 'cmp_kbf_premier_shell', 'KBF Premier League', 'kbf-premier-league', s."id", 'MANUAL', 'KENYA', 'LEAGUE', 'NATIONAL', 'LEAGUE', 'CLUB', 'KBF', 1, false, true
FROM "Sport" s WHERE s."name" = 'Basketball' AND NOT EXISTS (SELECT 1 FROM "Competition" WHERE "slug" = 'kbf-premier-league');

INSERT INTO "Competition" ("id", "name", "slug", "sportId", "source", "region", "category", "jurisdiction", "format", "teamType", "governingBody", "tier", "syncSquads", "isActive")
SELECT 'cmp_khu_premier_shell', 'KHU Premier League', 'khu-premier-league', s."id", 'MANUAL', 'KENYA', 'LEAGUE', 'NATIONAL', 'LEAGUE', 'CLUB', 'KHU', 1, false, true
FROM "Sport" s WHERE s."name" = 'Hockey' AND NOT EXISTS (SELECT 1 FROM "Competition" WHERE "slug" = 'khu-premier-league');

INSERT INTO "Competition" ("id", "name", "slug", "sportId", "source", "region", "category", "jurisdiction", "format", "teamType", "governingBody", "tier", "syncSquads", "isActive")
SELECT 'cmp_national_boxing_shell', 'National Boxing League', 'national-boxing-league', s."id", 'MANUAL', 'KENYA', 'LEAGUE', 'NATIONAL', 'LEAGUE', 'INDIVIDUAL', NULL, NULL, false, true
FROM "Sport" s WHERE s."name" = 'Boxing' AND NOT EXISTS (SELECT 1 FROM "Competition" WHERE "slug" = 'national-boxing-league');

-- A current season for each competition that has none, so results can be
-- entered straight away.
INSERT INTO "CompetitionSeason" ("id", "competitionId", "label", "isCurrent", "createdAt")
SELECT 'season_' || c."id", c."id", 'Current Season', true, CURRENT_TIMESTAMP
FROM "Competition" c
WHERE c."id" IN ('cmp_kenya_cup_shell', 'cmp_kbf_premier_shell', 'cmp_khu_premier_shell', 'cmp_national_boxing_shell')
  AND NOT EXISTS (SELECT 1 FROM "CompetitionSeason" s WHERE s."competitionId" = c."id");
