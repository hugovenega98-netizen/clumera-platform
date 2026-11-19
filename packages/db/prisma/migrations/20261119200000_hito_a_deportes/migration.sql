-- Hito A · Deportes: deportes, equipos, planteles, partidos, convocatorias, incidencias, reloj y ausencias.
-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('scheduled', 'live', 'pending_close', 'played', 'cancelled');

-- CreateEnum
CREATE TYPE "CallupResponse" AS ENUM ('pending', 'going', 'not_going');

-- CreateEnum
CREATE TYPE "MatchSide" AS ENUM ('own', 'opponent');

-- CreateTable
CREATE TABLE "Sport" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "sportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "monthlyFee" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "number" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "opponent" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "home" BOOLEAN NOT NULL DEFAULT true,
    "venue" TEXT NOT NULL DEFAULT '',
    "status" "MatchStatus" NOT NULL DEFAULT 'scheduled',
    "scoreFor" INTEGER,
    "scoreAgainst" INTEGER,
    "mamPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchCallup" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "response" "CallupResponse" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "respondedAt" TIMESTAMP(3),
    "inLineup" BOOLEAN NOT NULL DEFAULT false,
    "position" TEXT,

    CONSTRAINT "MatchCallup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "personId" TEXT,
    "side" "MatchSide" NOT NULL DEFAULT 'own',
    "opponentPlayer" TEXT,
    "type" TEXT NOT NULL,
    "minute" INTEGER,
    "setNumber" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchClock" (
    "matchId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'not_started',
    "elapsedSeconds" INTEGER NOT NULL DEFAULT 0,
    "addedMinutes" INTEGER NOT NULL DEFAULT 0,
    "runningSince" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchClock_pkey" PRIMARY KEY ("matchId")
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sport_slug_key" ON "Sport"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Team_sportId_name_key" ON "Team"("sportId", "name");

-- CreateIndex
CREATE INDEX "TeamMember_personId_active_idx" ON "TeamMember"("personId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_personId_key" ON "TeamMember"("teamId", "personId");

-- CreateIndex
CREATE INDEX "Match_teamId_startsAt_idx" ON "Match"("teamId", "startsAt");

-- CreateIndex
CREATE INDEX "Match_status_startsAt_idx" ON "Match"("status", "startsAt");

-- CreateIndex
CREATE INDEX "MatchCallup_personId_idx" ON "MatchCallup"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchCallup_matchId_personId_key" ON "MatchCallup"("matchId", "personId");

-- CreateIndex
CREATE INDEX "MatchEvent_matchId_createdAt_idx" ON "MatchEvent"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchEvent_personId_type_idx" ON "MatchEvent"("personId", "type");

-- CreateIndex
CREATE INDEX "Absence_teamId_date_idx" ON "Absence"("teamId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Absence_personId_teamId_date_key" ON "Absence"("personId", "teamId", "date");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchCallup" ADD CONSTRAINT "MatchCallup_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchCallup" ADD CONSTRAINT "MatchCallup_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchClock" ADD CONSTRAINT "MatchClock_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Team" ADD CONSTRAINT "Team_fee_positive" CHECK ("monthlyFee" IS NULL OR "monthlyFee" > 0);
ALTER TABLE "Match" ADD CONSTRAINT "Match_scores_non_negative" CHECK (("scoreFor" IS NULL OR "scoreFor" >= 0) AND ("scoreAgainst" IS NULL OR "scoreAgainst" >= 0));
ALTER TABLE "MatchClock" ADD CONSTRAINT "MatchClock_elapsed_non_negative" CHECK ("elapsedSeconds" >= 0 AND "addedMinutes" >= 0);
