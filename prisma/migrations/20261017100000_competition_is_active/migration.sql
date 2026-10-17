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
    "category" TEXT NOT NULL DEFAULT 'LEAGUE',
    "externalProvider" TEXT,
    "externalId" TEXT,
    "lastSyncedAt" DATETIME,
    "syncStatus" TEXT,
    "syncSquads" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Competition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Competition" ("category", "externalId", "externalProvider", "id", "lastSyncedAt", "name", "region", "slug", "source", "sportId", "syncSquads", "syncStatus") SELECT "category", "externalId", "externalProvider", "id", "lastSyncedAt", "name", "region", "slug", "source", "sportId", "syncSquads", "syncStatus" FROM "Competition";
DROP TABLE "Competition";
ALTER TABLE "new_Competition" RENAME TO "Competition";
CREATE UNIQUE INDEX "Competition_slug_key" ON "Competition"("slug");
CREATE UNIQUE INDEX "Competition_externalProvider_externalId_key" ON "Competition"("externalProvider", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Kenyan-first coverage (2026-10-17): hide other countries' club leagues
-- and club competitions — data kept, just switched off (re-enable from the
-- admin Competitions page). Matched on the sync providers' stable codes,
-- not display names. National-team tournaments (FIFA World Cup, European
-- Championship, Six Nations, ...) stay active.
UPDATE "Competition" SET "isActive" = false
WHERE ("externalProvider" = 'football-data.org' AND "externalId" IN ('PL', 'ELC', 'PD', 'BL1', 'SA', 'FL1', 'DED', 'PPL', 'BSA', 'CL'))
   OR ("externalProvider" = 'balldontlie.io' AND "externalId" = 'nba')
   OR ("externalProvider" = 'thesportsdb.com' AND "externalId" = '4546');

-- Kenya-relevant national-team tournaments, as empty shells for the
-- newsroom to fill (same "shells only, no faked fixtures" rule as the
-- seed). Skipped where the slug already exists, and inserts nothing on a
-- database with no Football sport yet (a fresh database — prisma/seed.js
-- creates the same three shells there).
INSERT INTO "Competition" ("id", "name", "slug", "sportId", "source", "region", "category", "syncSquads", "isActive")
SELECT 'comp-africa-cup-of-nations', 'Africa Cup of Nations', 'africa-cup-of-nations', "id", 'MANUAL', 'KENYA', 'INTERNATIONAL', false, true
FROM "Sport" WHERE "slug" = 'football' AND NOT EXISTS (SELECT 1 FROM "Competition" WHERE "slug" = 'africa-cup-of-nations');
INSERT INTO "Competition" ("id", "name", "slug", "sportId", "source", "region", "category", "syncSquads", "isActive")
SELECT 'comp-chan', 'CHAN', 'chan', "id", 'MANUAL', 'KENYA', 'INTERNATIONAL', false, true
FROM "Sport" WHERE "slug" = 'football' AND NOT EXISTS (SELECT 1 FROM "Competition" WHERE "slug" = 'chan');
INSERT INTO "Competition" ("id", "name", "slug", "sportId", "source", "region", "category", "syncSquads", "isActive")
SELECT 'comp-cecafa-senior-challenge-cup', 'CECAFA Senior Challenge Cup', 'cecafa-senior-challenge-cup', "id", 'MANUAL', 'KENYA', 'INTERNATIONAL', false, true
FROM "Sport" WHERE "slug" = 'football' AND NOT EXISTS (SELECT 1 FROM "Competition" WHERE "slug" = 'cecafa-senior-challenge-cup');
