-- CreateTable
CREATE TABLE "WatchedAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" DATETIME,
    "lastStatus" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WatchedPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "postedAt" DATETIME,
    "isRepost" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "parsedBy" TEXT NOT NULL DEFAULT 'PATTERN',
    "items" TEXT NOT NULL DEFAULT '[]',
    "aiNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WatchedPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WatchedAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchedAccount_handle_key" ON "WatchedAccount"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "WatchedPost_postId_key" ON "WatchedPost"("postId");

-- CreateIndex
CREATE INDEX "WatchedPost_accountId_postedAt_idx" ON "WatchedPost"("accountId", "postedAt");

