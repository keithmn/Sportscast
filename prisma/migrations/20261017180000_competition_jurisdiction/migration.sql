-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Competition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "region" TEXT NOT NULL DEFAULT 'KENYA',
    "jurisdiction" TEXT NOT NULL DEFAULT 'NATIONAL',
    "format" TEXT NOT NULL DEFAULT 'LEAGUE',
    "teamType" TEXT NOT NULL DEFAULT 'CLUB',
    "governingBody" TEXT,
    "category" TEXT NOT NULL DEFAULT 'LEAGUE',
    "externalProvider" TEXT,
    "externalId" TEXT,
    "lastSyncedAt" DATETIME,
    "syncStatus" TEXT,
    "syncSquads" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Competition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Competition" ("category", "externalId", "externalProvider", "id", "isActive", "lastSyncedAt", "name", "region", "slug", "source", "sportId", "syncSquads", "syncStatus") SELECT "category", "externalId", "externalProvider", "id", "isActive", "lastSyncedAt", "name", "region", "slug", "source", "sportId", "syncSquads", "syncStatus" FROM "Competition";
DROP TABLE "Competition";
ALTER TABLE "new_Competition" RENAME TO "Competition";
CREATE UNIQUE INDEX "Competition_slug_key" ON "Competition"("slug");
CREATE UNIQUE INDEX "Competition_externalProvider_externalId_key" ON "Competition"("externalProvider", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Classify the competitions that already exist (same values as KNOWN in
-- server/lib/competitionClassification.js). Unknown slugs keep the defaults.
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = 'FKF' WHERE "slug" = 'kenyan-premier-league';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = 'FKF' WHERE "slug" = 'national-super-league';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = 'FKF' WHERE "slug" = 'fkf-division-one-zone-a';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = 'FKF' WHERE "slug" = 'fkf-division-one-zone-b';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = 'FKF' WHERE "slug" = 'fkf-division-one-zone-c';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = 'FKF' WHERE "slug" = 'fkf-division-one-zone-d';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'CUP', "teamType" = 'CLUB', "governingBody" = 'FKF' WHERE "slug" = 'fkf-cup';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = 'KRU' WHERE "slug" = 'kenya-cup';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = 'KBF' WHERE "slug" = 'kbf-premier-league';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = 'KHU' WHERE "slug" = 'khu-premier-league';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'INDIVIDUAL', "governingBody" = NULL WHERE "slug" = 'national-boxing-league';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = NULL WHERE "slug" = 'premier-league';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = NULL WHERE "slug" = 'championship';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = NULL WHERE "slug" = 'la-liga';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = NULL WHERE "slug" = 'bundesliga';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = NULL WHERE "slug" = 'serie-a';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = NULL WHERE "slug" = 'ligue-1';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = NULL WHERE "slug" = 'eredivisie';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = NULL WHERE "slug" = 'primeira-liga';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = NULL WHERE "slug" = 'campeonato-brasileiro-srie-a';
UPDATE "Competition" SET "jurisdiction" = 'NATIONAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = 'NBA' WHERE "slug" = 'nba';
UPDATE "Competition" SET "jurisdiction" = 'REGIONAL', "format" = 'TOURNAMENT', "teamType" = 'NATIONAL_TEAM', "governingBody" = 'CECAFA' WHERE "slug" = 'cecafa-senior-challenge-cup';
UPDATE "Competition" SET "jurisdiction" = 'REGIONAL', "format" = 'TOURNAMENT', "teamType" = 'NATIONAL_TEAM', "governingBody" = 'Six Nations Rugby' WHERE "slug" = 'six-nations-championship';
UPDATE "Competition" SET "jurisdiction" = 'CONTINENTAL', "format" = 'TOURNAMENT', "teamType" = 'NATIONAL_TEAM', "governingBody" = 'CAF' WHERE "slug" = 'africa-cup-of-nations';
UPDATE "Competition" SET "jurisdiction" = 'CONTINENTAL', "format" = 'TOURNAMENT', "teamType" = 'NATIONAL_TEAM', "governingBody" = 'CAF' WHERE "slug" = 'afcon-qualifiers';
UPDATE "Competition" SET "jurisdiction" = 'CONTINENTAL', "format" = 'TOURNAMENT', "teamType" = 'NATIONAL_TEAM', "governingBody" = 'CAF' WHERE "slug" = 'chan';
UPDATE "Competition" SET "jurisdiction" = 'CONTINENTAL', "format" = 'TOURNAMENT', "teamType" = 'CLUB', "governingBody" = 'CAF' WHERE "slug" = 'caf-champions-league';
UPDATE "Competition" SET "jurisdiction" = 'CONTINENTAL', "format" = 'TOURNAMENT', "teamType" = 'CLUB', "governingBody" = 'CAF' WHERE "slug" = 'caf-confederation-cup';
UPDATE "Competition" SET "jurisdiction" = 'CONTINENTAL', "format" = 'TOURNAMENT', "teamType" = 'CLUB', "governingBody" = NULL WHERE "slug" = 'bal-road-to-bal';
UPDATE "Competition" SET "jurisdiction" = 'CONTINENTAL', "format" = 'TOURNAMENT', "teamType" = 'NATIONAL_TEAM', "governingBody" = 'Rugby Africa' WHERE "slug" = 'rugby-africa-cup';
UPDATE "Competition" SET "jurisdiction" = 'CONTINENTAL', "format" = 'TOURNAMENT', "teamType" = 'NATIONAL_TEAM', "governingBody" = 'UEFA' WHERE "slug" = 'european-championship';
UPDATE "Competition" SET "jurisdiction" = 'CONTINENTAL', "format" = 'TOURNAMENT', "teamType" = 'CLUB', "governingBody" = 'UEFA' WHERE "slug" = 'uefa-champions-league';
UPDATE "Competition" SET "jurisdiction" = 'CONTINENTAL', "format" = 'LEAGUE', "teamType" = 'CLUB', "governingBody" = NULL WHERE "slug" = 'euroleague-basketball';
UPDATE "Competition" SET "jurisdiction" = 'GLOBAL', "format" = 'TOURNAMENT', "teamType" = 'NATIONAL_TEAM', "governingBody" = 'FIFA' WHERE "slug" = 'fifa-world-cup';
UPDATE "Competition" SET "jurisdiction" = 'GLOBAL', "format" = 'TOURNAMENT', "teamType" = 'NATIONAL_TEAM', "governingBody" = 'FIFA' WHERE "slug" = 'world-cup-qualifiers';
UPDATE "Competition" SET "jurisdiction" = 'GLOBAL', "format" = 'TOURNAMENT', "teamType" = 'NATIONAL_TEAM', "governingBody" = 'World Rugby' WHERE "slug" = 'hsbc-svns-kenya-leg';
UPDATE "Competition" SET "jurisdiction" = 'GLOBAL', "format" = 'TOURNAMENT', "teamType" = 'INDIVIDUAL', "governingBody" = 'PDC' WHERE "slug" = 'pdc-darts';
UPDATE "Competition" SET "jurisdiction" = 'GLOBAL', "format" = 'TOURNAMENT', "teamType" = 'INDIVIDUAL', "governingBody" = NULL WHERE "slug" = 'world-championship-boxing';
