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
    "tier" INTEGER,
    "category" TEXT NOT NULL DEFAULT 'LEAGUE',
    "externalProvider" TEXT,
    "externalId" TEXT,
    "lastSyncedAt" DATETIME,
    "syncStatus" TEXT,
    "syncSquads" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rightsStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "dataSource" TEXT,
    "attribution" TEXT,
    "rightsNotes" TEXT,
    "resultTargetHours" INTEGER,
    CONSTRAINT "Competition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Competition" ("category", "externalId", "externalProvider", "format", "governingBody", "id", "isActive", "jurisdiction", "lastSyncedAt", "name", "region", "slug", "source", "sportId", "syncSquads", "syncStatus", "teamType", "tier") SELECT "category", "externalId", "externalProvider", "format", "governingBody", "id", "isActive", "jurisdiction", "lastSyncedAt", "name", "region", "slug", "source", "sportId", "syncSquads", "syncStatus", "teamType", "tier" FROM "Competition";
DROP TABLE "Competition";
ALTER TABLE "new_Competition" RENAME TO "Competition";
CREATE UNIQUE INDEX "Competition_slug_key" ON "Competition"("slug");
CREATE UNIQUE INDEX "Competition_externalProvider_externalId_key" ON "Competition"("externalProvider", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Starting points (editors change them in Competitions → Settings → Rights).
-- KPL: published results data is the subject of the Milestone litigation,
-- so it starts flagged for review rather than cleared.
UPDATE "Competition" SET "rightsStatus" = 'PERMISSION_PENDING', "rightsNotes" = 'Milestone Sports Media is suing data sites over KPL data (2026). Get legal advice before publishing KPL results/tables publicly.' WHERE "slug" = 'kenyan-premier-league';
UPDATE "Competition" SET "dataSource" = 'kenyacup.co.ke (standings page)', "attribution" = 'Table: kenyacup.co.ke' WHERE "slug" = 'kenya-cup';
-- API feeds: credited, but their terms of use haven't been reviewed yet, so
-- they stay UNREVIEWED (not assumed cleared).
UPDATE "Competition" SET "dataSource" = 'football-data.org API', "attribution" = 'Data: football-data.org' WHERE "externalProvider" = 'football-data.org';
UPDATE "Competition" SET "dataSource" = 'TheSportsDB API', "attribution" = 'Data: TheSportsDB' WHERE "externalProvider" = 'thesportsdb.com';
UPDATE "Competition" SET "resultTargetHours" = 2 WHERE "slug" IN ('kenyan-premier-league', 'national-super-league');
UPDATE "Competition" SET "resultTargetHours" = 12 WHERE "region" = 'KENYA' AND "resultTargetHours" IS NULL;
