-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "tier" INTEGER;


-- Tier inside each level for the leagues the site already knows (KNOWN in
-- server/lib/competitionClassification.js).
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'kenyan-premier-league';
UPDATE "Competition" SET "tier" = 2 WHERE "slug" = 'national-super-league';
UPDATE "Competition" SET "tier" = 3 WHERE "slug" = 'fkf-division-one-zone-a';
UPDATE "Competition" SET "tier" = 3 WHERE "slug" = 'fkf-division-one-zone-b';
UPDATE "Competition" SET "tier" = 3 WHERE "slug" = 'fkf-division-one-zone-c';
UPDATE "Competition" SET "tier" = 3 WHERE "slug" = 'fkf-division-one-zone-d';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'kenya-cup';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'kbf-premier-league';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'khu-premier-league';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'premier-league';
UPDATE "Competition" SET "tier" = 2 WHERE "slug" = 'championship';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'la-liga';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'bundesliga';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'serie-a';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'ligue-1';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'eredivisie';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'primeira-liga';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'campeonato-brasileiro-srie-a';
UPDATE "Competition" SET "tier" = 1 WHERE "slug" = 'nba';
