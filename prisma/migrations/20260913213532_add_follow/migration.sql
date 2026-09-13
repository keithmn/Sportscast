-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anonymousId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entitySlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Follow_anonymousId_idx" ON "Follow"("anonymousId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_anonymousId_entityType_entitySlug_key" ON "Follow"("anonymousId", "entityType", "entitySlug");
