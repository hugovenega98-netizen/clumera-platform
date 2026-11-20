-- CreateEnum
CREATE TYPE "AccessResult" AS ENUM ('granted', 'denied');

-- AlterTable
ALTER TABLE "Credential" ADD COLUMN     "bookingId" TEXT,
ADD COLUMN     "label" TEXT;

-- CreateTable
CREATE TABLE "AccessPoint" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessAttempt" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "credentialId" TEXT,
    "personId" TEXT,
    "result" "AccessResult" NOT NULL,
    "reason" TEXT,
    "detail" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "overrideReason" TEXT,
    "overrideOfId" TEXT,
    "byPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessPoint_slug_key" ON "AccessPoint"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AccessAttempt_overrideOfId_key" ON "AccessAttempt"("overrideOfId");

-- CreateIndex
CREATE INDEX "AccessAttempt_pointId_createdAt_idx" ON "AccessAttempt"("pointId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessAttempt_personId_createdAt_idx" ON "AccessAttempt"("personId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_bookingId_key" ON "Credential"("bookingId");

-- AddForeignKey
ALTER TABLE "AccessAttempt" ADD CONSTRAINT "AccessAttempt_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "AccessPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAttempt" ADD CONSTRAINT "AccessAttempt_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAttempt" ADD CONSTRAINT "AccessAttempt_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAttempt" ADD CONSTRAINT "AccessAttempt_overrideOfId_fkey" FOREIGN KEY ("overrideOfId") REFERENCES "AccessAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Una excepción solo se registra como permitida y siempre con motivo.
ALTER TABLE "AccessAttempt" ADD CONSTRAINT "AccessAttempt_override_check" CHECK (
  ("method" <> 'excepcion') OR ("result" = 'granted' AND "overrideReason" IS NOT NULL AND "overrideOfId" IS NOT NULL)
);
