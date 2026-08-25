-- Rename League -> Competition as a true rename (preserves the 23 existing
-- rows and everything that references them) instead of Prisma's default
-- non-interactive diff, which treated this as DROP League + CREATE
-- Competition (empty) — that would have silently orphaned every Fixture/
-- StandingRow/Club/Article row referencing a leagueId.
PRAGMA foreign_keys=OFF;

ALTER TABLE "League" RENAME TO "Competition";

DROP INDEX "League_externalProvider_externalId_key";
DROP INDEX "League_slug_key";
CREATE UNIQUE INDEX "Competition_slug_key" ON "Competition"("slug");
CREATE UNIQUE INDEX "Competition_externalProvider_externalId_key" ON "Competition"("externalProvider", "externalId");

-- RedefineTables: rename each table's leagueId column to competitionId and
-- retarget the FK. The SELECT lists below map the old "leagueId" column
-- into the new "competitionId" slot explicitly — Prisma's own diff omitted
-- this mapping entirely (since it thought League was being dropped), which
-- would have left every row's competition link NULL.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "dek" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "sportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "contentType" TEXT NOT NULL DEFAULT 'ARTICLE',
    "isBrief" BOOLEAN NOT NULL DEFAULT false,
    "youtubeId" TEXT,
    "videoSeries" TEXT,
    "episodeLabel" TEXT,
    "runtimeLabel" TEXT,
    "competitionId" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Article_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Article_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Article" ("authorId", "body", "contentType", "coverImageUrl", "createdAt", "dek", "episodeLabel", "featured", "id", "isBrief", "publishedAt", "runtimeLabel", "slug", "sportId", "status", "title", "updatedAt", "videoSeries", "youtubeId", "competitionId") SELECT "authorId", "body", "contentType", "coverImageUrl", "createdAt", "dek", "episodeLabel", "featured", "id", "isBrief", "publishedAt", "runtimeLabel", "slug", "sportId", "status", "title", "updatedAt", "videoSeries", "youtubeId", "leagueId" FROM "Article";
DROP TABLE "Article";
ALTER TABLE "new_Article" RENAME TO "Article";
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

CREATE TABLE "new_Club" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "crestUrl" TEXT,
    "venue" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Club_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Club" ("createdAt", "crestUrl", "externalId", "id", "lastSyncedAt", "name", "slug", "source", "venue", "competitionId") SELECT "createdAt", "crestUrl", "externalId", "id", "lastSyncedAt", "name", "slug", "source", "venue", "leagueId" FROM "Club";
DROP TABLE "Club";
ALTER TABLE "new_Club" RENAME TO "Club";
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

CREATE TABLE "new_Fixture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "kickoff" DATETIME NOT NULL,
    "originalKickoff" DATETIME,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fixture_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Fixture" ("awayScore", "awayTeam", "homeScore", "homeTeam", "id", "kickoff", "originalKickoff", "status", "updatedAt", "competitionId") SELECT "awayScore", "awayTeam", "homeScore", "homeTeam", "id", "kickoff", "originalKickoff", "status", "updatedAt", "leagueId" FROM "Fixture";
DROP TABLE "Fixture";
ALTER TABLE "new_Fixture" RENAME TO "Fixture";
CREATE UNIQUE INDEX "Fixture_competitionId_homeTeam_awayTeam_kickoff_key" ON "Fixture"("competitionId", "homeTeam", "awayTeam", "kickoff");

CREATE TABLE "new_StandingRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "competitionId" TEXT NOT NULL,
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
    CONSTRAINT "StandingRow_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StandingRow" ("drawn", "goalsAgainst", "goalsFor", "id", "lost", "played", "points", "position", "teamName", "updatedAt", "won", "competitionId") SELECT "drawn", "goalsAgainst", "goalsFor", "id", "lost", "played", "points", "position", "teamName", "updatedAt", "won", "leagueId" FROM "StandingRow";
DROP TABLE "StandingRow";
ALTER TABLE "new_StandingRow" RENAME TO "StandingRow";

CREATE TABLE "new_Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "leagueId" TEXT,
    "crestUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Team_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "Competition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("createdAt", "crestUrl", "id", "leagueId", "name", "slug", "sportId") SELECT "createdAt", "crestUrl", "id", "leagueId", "name", "slug", "sportId" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
