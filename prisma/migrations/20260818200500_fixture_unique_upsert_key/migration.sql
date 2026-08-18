-- CreateIndex
CREATE UNIQUE INDEX "Fixture_leagueId_homeTeam_awayTeam_kickoff_key" ON "Fixture"("leagueId", "homeTeam", "awayTeam", "kickoff");
