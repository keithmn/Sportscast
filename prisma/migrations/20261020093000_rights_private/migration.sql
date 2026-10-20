-- CreateTable
CREATE TABLE "CompetitionRights" (
    "competitionId" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "notes" TEXT,
    "updatedBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompetitionRights_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
-- Keep what the previous migration recorded.
INSERT INTO "CompetitionRights" ("competitionId", "status", "notes", "updatedAt")
SELECT "id", "rightsStatus", "rightsNotes", CURRENT_TIMESTAMP FROM "Competition"
WHERE "rightsStatus" <> 'UNREVIEWED' OR "rightsNotes" IS NOT NULL;

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
    "dataSource" TEXT,
    "attribution" TEXT,
    "resultTargetHours" INTEGER,
    CONSTRAINT "Competition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Competition" ("attribution", "category", "dataSource", "externalId", "externalProvider", "format", "governingBody", "id", "isActive", "jurisdiction", "lastSyncedAt", "name", "region", "resultTargetHours", "slug", "source", "sportId", "syncSquads", "syncStatus", "teamType", "tier") SELECT "attribution", "category", "dataSource", "externalId", "externalProvider", "format", "governingBody", "id", "isActive", "jurisdiction", "lastSyncedAt", "name", "region", "resultTargetHours", "slug", "source", "sportId", "syncSquads", "syncStatus", "teamType", "tier" FROM "Competition";
DROP TABLE "Competition";
ALTER TABLE "new_Competition" RENAME TO "Competition";
CREATE UNIQUE INDEX "Competition_slug_key" ON "Competition"("slug");
CREATE UNIQUE INDEX "Competition_externalProvider_externalId_key" ON "Competition"("externalProvider", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

