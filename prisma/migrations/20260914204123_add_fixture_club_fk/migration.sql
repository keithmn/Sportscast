-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Fixture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "homeClubId" TEXT,
    "awayClubId" TEXT,
    "kickoff" DATETIME NOT NULL,
    "originalKickoff" DATETIME,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fixture_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Fixture_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Fixture_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Fixture" ("awayScore", "awayTeam", "competitionId", "homeScore", "homeTeam", "id", "kickoff", "originalKickoff", "status", "updatedAt") SELECT "awayScore", "awayTeam", "competitionId", "homeScore", "homeTeam", "id", "kickoff", "originalKickoff", "status", "updatedAt" FROM "Fixture";
DROP TABLE "Fixture";
ALTER TABLE "new_Fixture" RENAME TO "Fixture";
CREATE UNIQUE INDEX "Fixture_competitionId_homeTeam_awayTeam_kickoff_key" ON "Fixture"("competitionId", "homeTeam", "awayTeam", "kickoff");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
