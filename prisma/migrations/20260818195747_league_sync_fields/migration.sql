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
    CONSTRAINT "League_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_League" ("id", "name", "slug", "source", "sportId") SELECT "id", "name", "slug", "source", "sportId" FROM "League";
DROP TABLE "League";
ALTER TABLE "new_League" RENAME TO "League";
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");
CREATE UNIQUE INDEX "League_externalProvider_externalId_key" ON "League"("externalProvider", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
