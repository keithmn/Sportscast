-- CreateTable
CREATE TABLE "_ArticleClubTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ArticleClubTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ArticleClubTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Club" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ArticleCompetitionTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ArticleCompetitionTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ArticleCompetitionTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Competition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ArticlePlayerTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ArticlePlayerTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ArticlePlayerTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_ArticleClubTags_AB_unique" ON "_ArticleClubTags"("A", "B");

-- CreateIndex
CREATE INDEX "_ArticleClubTags_B_index" ON "_ArticleClubTags"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ArticleCompetitionTags_AB_unique" ON "_ArticleCompetitionTags"("A", "B");

-- CreateIndex
CREATE INDEX "_ArticleCompetitionTags_B_index" ON "_ArticleCompetitionTags"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ArticlePlayerTags_AB_unique" ON "_ArticlePlayerTags"("A", "B");

-- CreateIndex
CREATE INDEX "_ArticlePlayerTags_B_index" ON "_ArticlePlayerTags"("B");
