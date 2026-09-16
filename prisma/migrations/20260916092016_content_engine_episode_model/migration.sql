/*
  Warnings:

  - You are about to drop the column `guest` on the `Episode` table. All the data in the column will be lost.
  - You are about to drop the column `host` on the `Episode` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "EpisodeGuest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "playerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EpisodeGuest_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EpisodeGuest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EpisodeSponsor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "website" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EpisodeSponsor_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialAsset_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startSeconds" INTEGER NOT NULL,
    "endSeconds" INTEGER NOT NULL,
    "captionsSrt" TEXT,
    "videoUrl" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Clip_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_EpisodeHosts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_EpisodeHosts_A_fkey" FOREIGN KEY ("A") REFERENCES "Author" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_EpisodeHosts_B_fkey" FOREIGN KEY ("B") REFERENCES "Episode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "showId" TEXT NOT NULL,
    "seasonId" TEXT,
    "articleId" TEXT,
    "episodeNumber" INTEGER,
    "youtubeId" TEXT,
    "durationSeconds" INTEGER,
    "recordingDate" DATETIME,
    "transcript" TEXT,
    "chapters" TEXT,
    "transcriptionStatus" TEXT,
    "transcriptionError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Episode_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Episode_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Episode_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Episode" ("articleId", "chapters", "createdAt", "durationSeconds", "episodeNumber", "id", "recordingDate", "seasonId", "showId", "transcript", "updatedAt", "youtubeId") SELECT "articleId", "chapters", "createdAt", "durationSeconds", "episodeNumber", "id", "recordingDate", "seasonId", "showId", "transcript", "updatedAt", "youtubeId" FROM "Episode";
DROP TABLE "Episode";
ALTER TABLE "new_Episode" RENAME TO "Episode";
CREATE UNIQUE INDEX "Episode_articleId_key" ON "Episode"("articleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "_EpisodeHosts_AB_unique" ON "_EpisodeHosts"("A", "B");

-- CreateIndex
CREATE INDEX "_EpisodeHosts_B_index" ON "_EpisodeHosts"("B");
