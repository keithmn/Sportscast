-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FixtureCorrection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fixtureId" TEXT NOT NULL,
    "beforeHome" INTEGER,
    "beforeAway" INTEGER,
    "beforeStatus" TEXT NOT NULL,
    "afterHome" INTEGER,
    "afterAway" INTEGER,
    "afterStatus" TEXT NOT NULL,
    "reason" TEXT,
    "userName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "decidedBy" TEXT,
    "decidedAt" DATETIME,
    "afterDecidedBy" TEXT,
    "afterHomePenalties" INTEGER,
    "afterAwayPenalties" INTEGER,
    CONSTRAINT "FixtureCorrection_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FixtureCorrection" ("afterAway", "afterHome", "afterStatus", "beforeAway", "beforeHome", "beforeStatus", "createdAt", "fixtureId", "id", "reason", "revertedAt", "userName") SELECT "afterAway", "afterHome", "afterStatus", "beforeAway", "beforeHome", "beforeStatus", "createdAt", "fixtureId", "id", "reason", "revertedAt", "userName" FROM "FixtureCorrection";
DROP TABLE "FixtureCorrection";
ALTER TABLE "new_FixtureCorrection" RENAME TO "FixtureCorrection";
CREATE INDEX "FixtureCorrection_fixtureId_createdAt_idx" ON "FixtureCorrection"("fixtureId", "createdAt");
CREATE INDEX "FixtureCorrection_status_idx" ON "FixtureCorrection"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

