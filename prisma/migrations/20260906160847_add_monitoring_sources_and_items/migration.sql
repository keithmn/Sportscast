-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fetchMethod" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "listItemSelector" TEXT,
    "titleSelector" TEXT,
    "linkSelector" TEXT,
    "dateSelector" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fetchIntervalCron" TEXT,
    "lastFetchedAt" DATETIME,
    "syncStatus" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MonitoredItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "externalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "snippet" TEXT,
    "publishedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "aiSummary" TEXT,
    "aiRelevanceScore" INTEGER,
    "aiCategoryTags" TEXT,
    "promotedArticleId" TEXT,
    "reviewedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonitoredItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MonitoredItem_promotedArticleId_fkey" FOREIGN KEY ("promotedArticleId") REFERENCES "Article" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MonitoredItem_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredItem_promotedArticleId_key" ON "MonitoredItem"("promotedArticleId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredItem_sourceId_externalUrl_key" ON "MonitoredItem"("sourceId", "externalUrl");
