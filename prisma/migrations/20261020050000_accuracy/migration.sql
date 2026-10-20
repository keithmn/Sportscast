-- AlterTable
ALTER TABLE "CompetitionSeason" ADD COLUMN "endsOn" DATETIME;
ALTER TABLE "CompetitionSeason" ADD COLUMN "startsOn" DATETIME;

-- CreateTable
CREATE TABLE "ClubAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    CONSTRAINT "ClubAlias_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FixtureCorrection" (
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
    CONSTRAINT "FixtureCorrection_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "decidedBy" TEXT,
    "homePenalties" INTEGER,
    "awayPenalties" INTEGER,
    "resultNote" TEXT,
    "resultProvisional" BOOLEAN NOT NULL DEFAULT false,
    "venueId" TEXT,
    "round" TEXT,
    "broadcaster" TEXT,
    "sourceUrl" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fixture_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Fixture_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "CompetitionSeason" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Fixture_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Fixture_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Fixture_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Fixture" ("awayClubId", "awayScore", "awayTeam", "broadcaster", "competitionId", "homeClubId", "homeScore", "homeTeam", "id", "kickoff", "originalKickoff", "round", "seasonId", "sourceUrl", "status", "updatedAt", "venueId") SELECT "awayClubId", "awayScore", "awayTeam", "broadcaster", "competitionId", "homeClubId", "homeScore", "homeTeam", "id", "kickoff", "originalKickoff", "round", "seasonId", "sourceUrl", "status", "updatedAt", "venueId" FROM "Fixture";
DROP TABLE "Fixture";
ALTER TABLE "new_Fixture" RENAME TO "Fixture";
CREATE UNIQUE INDEX "Fixture_competitionId_homeTeam_awayTeam_kickoff_key" ON "Fixture"("competitionId", "homeTeam", "awayTeam", "kickoff");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ClubAlias_key_idx" ON "ClubAlias"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ClubAlias_clubId_key_key" ON "ClubAlias"("clubId", "key");

-- CreateIndex
CREATE INDEX "FixtureCorrection_fixtureId_createdAt_idx" ON "FixtureCorrection"("fixtureId", "createdAt");

