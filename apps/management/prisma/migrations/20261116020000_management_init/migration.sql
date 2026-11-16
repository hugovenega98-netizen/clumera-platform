-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('provisioning', 'active', 'suspended', 'archived');

-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "customDomain" TEXT,
    "status" "InstallationStatus" NOT NULL DEFAULT 'provisioning',
    "vercelProjectId" TEXT,
    "neonProjectId" TEXT,
    "coreVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "modules" TEXT[],
    "sportsLimit" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "token" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationEvent" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" JSONB,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Installation_clientId_key" ON "Installation"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_subdomain_key" ON "Installation"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_customDomain_key" ON "Installation"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseId_key" ON "License"("licenseId");

-- CreateIndex
CREATE INDEX "License_installationId_revokedAt_idx" ON "License"("installationId", "revokedAt");

-- CreateIndex
CREATE INDEX "InstallationEvent_installationId_createdAt_idx" ON "InstallationEvent"("installationId", "createdAt");

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationEvent" ADD CONSTRAINT "InstallationEvent_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

