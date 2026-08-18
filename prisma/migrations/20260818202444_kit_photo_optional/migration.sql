-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Kit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "photoUrl" TEXT,
    "priceKesCents" INTEGER NOT NULL,
    "sizesAvailable" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Kit_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Kit" ("active", "createdAt", "id", "label", "photoUrl", "priceKesCents", "sizesAvailable", "teamId") SELECT "active", "createdAt", "id", "label", "photoUrl", "priceKesCents", "sizesAvailable", "teamId" FROM "Kit";
DROP TABLE "Kit";
ALTER TABLE "new_Kit" RENAME TO "Kit";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
