-- CreateTable
CREATE TABLE "CanonicalMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "localEntityType" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "canonicalEntityType" TEXT NOT NULL,
    "canonicalId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'underdawgs-data',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalMapping_localEntityType_localId_provider_key" ON "CanonicalMapping"("localEntityType", "localId", "provider");
