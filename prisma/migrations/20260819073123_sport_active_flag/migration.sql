-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Sport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Sport" ("id", "name", "slug") SELECT "id", "name", "slug" FROM "Sport";
DROP TABLE "Sport";
ALTER TABLE "new_Sport" RENAME TO "Sport";
CREATE UNIQUE INDEX "Sport_name_key" ON "Sport"("name");
CREATE UNIQUE INDEX "Sport_slug_key" ON "Sport"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
