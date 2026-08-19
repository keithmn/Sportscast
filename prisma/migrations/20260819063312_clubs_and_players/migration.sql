-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "crestUrl" TEXT,
    "venue" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalId" INTEGER,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Club_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "nationality" TEXT,
    "age" INTEGER,
    "photoUrl" TEXT,
    "externalId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Player_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_League" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "region" TEXT NOT NULL DEFAULT 'KENYA',
    "externalProvider" TEXT,
    "externalId" TEXT,
    "lastSyncedAt" DATETIME,
    "syncStatus" TEXT,
    "syncSquads" BOOLEAN NOT NULL DEFAULT false,
    "apiFootballId" INTEGER,
    CONSTRAINT "League_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_League" ("externalId", "externalProvider", "id", "lastSyncedAt", "name", "region", "slug", "source", "sportId", "syncStatus") SELECT "externalId", "externalProvider", "id", "lastSyncedAt", "name", "region", "slug", "source", "sportId", "syncStatus" FROM "League";
DROP TABLE "League";
ALTER TABLE "new_League" RENAME TO "League";
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");
CREATE UNIQUE INDEX "League_externalProvider_externalId_key" ON "League"("externalProvider", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");
