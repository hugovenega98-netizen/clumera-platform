-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('registration', 'groups', 'knockout', 'finished');

-- CreateEnum
CREATE TYPE "TournamentTeamStatus" AS ENUM ('registered', 'confirmed', 'withdrawn');

-- CreateEnum
CREATE TYPE "TournamentStage" AS ENUM ('group', 'semi', 'final', 'third');

-- CreateEnum
CREATE TYPE "TournamentMatchStatus" AS ENUM ('scheduled', 'played');

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sportCode" TEXT NOT NULL,
    "description" TEXT,
    "status" "TournamentStatus" NOT NULL DEFAULT 'registration',
    "maxTeams" INTEGER NOT NULL,
    "zoneCount" INTEGER NOT NULL,
    "qualifiersPerZone" INTEGER NOT NULL,
    "entryFee" INTEGER NOT NULL DEFAULT 0,
    "playDay" TEXT NOT NULL,
    "firstMatchMinute" INTEGER NOT NULL,
    "matchMinutes" INTEGER NOT NULL,
    "places" TEXT[],
    "venueIds" TEXT[],
    "publicPage" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTeam" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "captainId" TEXT NOT NULL,
    "zone" TEXT,
    "seed" INTEGER,
    "status" "TournamentTeamStatus" NOT NULL DEFAULT 'registered',
    "chargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "stage" "TournamentStage" NOT NULL,
    "zone" TEXT,
    "round" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "place" TEXT NOT NULL,
    "status" "TournamentMatchStatus" NOT NULL DEFAULT 'scheduled',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "winnerTeamId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");

-- CreateIndex
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTeam_tournamentId_name_key" ON "TournamentTeam"("tournamentId", "name");

-- CreateIndex
CREATE INDEX "TournamentMatch_tournamentId_stage_round_idx" ON "TournamentMatch"("tournamentId", "stage", "round");

-- AddForeignKey
ALTER TABLE "TournamentTeam" ADD CONSTRAINT "TournamentTeam_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "TournamentTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "TournamentTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_values_check" CHECK (
  "maxTeams" BETWEEN 2 AND 64 AND "zoneCount" BETWEEN 1 AND 8 AND "qualifiersPerZone" BETWEEN 1 AND 4
  AND "entryFee" >= 0 AND "playDay" ~ '^\d{4}-\d{2}-\d{2}$' AND "firstMatchMinute" BETWEEN 0 AND 1439 AND "matchMinutes" BETWEEN 10 AND 240
);
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_teams_check" CHECK ("homeTeamId" <> "awayTeamId");
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_result_check" CHECK (
  ("status" = 'scheduled' AND "homeScore" IS NULL AND "awayScore" IS NULL)
  OR ("status" = 'played' AND "homeScore" >= 0 AND "awayScore" >= 0)
);
