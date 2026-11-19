-- Hito A · Deportes B: salud deportiva, pases de invitado, seguidores, planilla transitoria, cambios y transmisión.
-- CreateEnum
CREATE TYPE "InjuryStatus" AS ENUM ('evaluation', 'follow_up', 'closed');

-- CreateEnum
CREATE TYPE "SportAvailability" AS ENUM ('under_review', 'no_restrictions', 'restricted', 'unavailable');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "streamVideoId" TEXT;

-- AlterTable
ALTER TABLE "MatchEvent" ADD COLUMN     "temporaryPlayerId" TEXT;

-- CreateTable
CREATE TABLE "MatchGuestPass" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeHint" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchGuestPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchFollow" (
    "matchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchFollow_pkey" PRIMARY KEY ("matchId","personId")
);

-- CreateTable
CREATE TABLE "MatchTemporaryPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchTemporaryPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSubstitution" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "outPersonId" TEXT NOT NULL,
    "inPersonId" TEXT NOT NULL,
    "minute" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSubstitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InjuryReport" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "pain" INTEGER NOT NULL,
    "context" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "onsetDate" DATE NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InjuryReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InjuryCase" (
    "reportId" TEXT NOT NULL,
    "status" "InjuryStatus" NOT NULL,
    "availability" "SportAvailability" NOT NULL,
    "publicNote" TEXT NOT NULL DEFAULT '',
    "privateNote" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InjuryCase_pkey" PRIMARY KEY ("reportId")
);

-- CreateTable
CREATE TABLE "InjurySession" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "status" "InjuryStatus" NOT NULL,
    "availability" "SportAvailability" NOT NULL,
    "publicNote" TEXT NOT NULL DEFAULT '',
    "privateNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InjurySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchGuestPass_codeHash_key" ON "MatchGuestPass"("codeHash");

-- CreateIndex
CREATE INDEX "MatchGuestPass_matchId_idx" ON "MatchGuestPass"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchTemporaryPlayer_matchId_number_key" ON "MatchTemporaryPlayer"("matchId", "number");

-- CreateIndex
CREATE INDEX "MatchSubstitution_matchId_idx" ON "MatchSubstitution"("matchId");

-- CreateIndex
CREATE INDEX "InjuryReport_teamId_createdAt_idx" ON "InjuryReport"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "InjuryReport_personId_createdAt_idx" ON "InjuryReport"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "InjurySession_reportId_createdAt_idx" ON "InjurySession"("reportId", "createdAt");

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_temporaryPlayerId_fkey" FOREIGN KEY ("temporaryPlayerId") REFERENCES "MatchTemporaryPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchGuestPass" ADD CONSTRAINT "MatchGuestPass_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFollow" ADD CONSTRAINT "MatchFollow_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFollow" ADD CONSTRAINT "MatchFollow_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchTemporaryPlayer" ADD CONSTRAINT "MatchTemporaryPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSubstitution" ADD CONSTRAINT "MatchSubstitution_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryCase" ADD CONSTRAINT "InjuryCase_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InjuryReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjurySession" ADD CONSTRAINT "InjurySession_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InjuryReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "InjuryReport" ADD CONSTRAINT "InjuryReport_pain_range" CHECK ("pain" BETWEEN 0 AND 10);
ALTER TABLE "Match" ADD CONSTRAINT "Match_stream_video_id" CHECK ("streamVideoId" IS NULL OR "streamVideoId" ~ '^[A-Za-z0-9_-]{11}$');
