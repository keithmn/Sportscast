-- CreateTable
CREATE TABLE "CompetitionSeason" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitionSeason_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Fixture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "seasonId" TEXT,
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
    CONSTRAINT "Fixture_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "CompetitionSeason" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Fixture_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Fixture_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Fixture" ("awayClubId", "awayScore", "awayTeam", "competitionId", "homeClubId", "homeScore", "homeTeam", "id", "kickoff", "originalKickoff", "status", "updatedAt") SELECT "awayClubId", "awayScore", "awayTeam", "competitionId", "homeClubId", "homeScore", "homeTeam", "id", "kickoff", "originalKickoff", "status", "updatedAt" FROM "Fixture";
DROP TABLE "Fixture";
ALTER TABLE "new_Fixture" RENAME TO "Fixture";
CREATE UNIQUE INDEX "Fixture_competitionId_homeTeam_awayTeam_kickoff_key" ON "Fixture"("competitionId", "homeTeam", "awayTeam", "kickoff");
CREATE TABLE "new_StandingRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "seasonId" TEXT,
    "position" INTEGER NOT NULL,
    "teamName" TEXT NOT NULL,
    "played" INTEGER NOT NULL DEFAULT 0,
    "won" INTEGER NOT NULL DEFAULT 0,
    "drawn" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "goalsFor" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StandingRow_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StandingRow_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "CompetitionSeason" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StandingRow" ("competitionId", "drawn", "goalsAgainst", "goalsFor", "id", "lost", "played", "points", "position", "teamName", "updatedAt", "won") SELECT "competitionId", "drawn", "goalsAgainst", "goalsFor", "id", "lost", "played", "points", "position", "teamName", "updatedAt", "won" FROM "StandingRow";
DROP TABLE "StandingRow";
ALTER TABLE "new_StandingRow" RENAME TO "StandingRow";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionSeason_competitionId_label_key" ON "CompetitionSeason"("competitionId", "label");
