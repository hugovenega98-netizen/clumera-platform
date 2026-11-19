-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('member_card', 'pool_pass', 'booking', 'ticket', 'guest');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('active', 'revoked', 'expired');

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "secret" TEXT NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'active',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Credential_personId_kind_status_idx" ON "Credential"("personId", "kind", "status");

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

