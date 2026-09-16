-- CreateTable
CREATE TABLE "FanAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "anonymousId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "FanAccount_email_key" ON "FanAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "FanAccount_anonymousId_key" ON "FanAccount"("anonymousId");
