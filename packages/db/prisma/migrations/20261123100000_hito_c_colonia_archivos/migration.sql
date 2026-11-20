-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('submitted', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "emergencyName" TEXT,
ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "imageConsent" BOOLEAN;

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "familyDiscountPercent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "ownerPersonId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileBlob" (
    "fileId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("fileId")
);

-- CreateTable
CREATE TABLE "ProgramDocument" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentDocument" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'submitted',
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileObject_ownerPersonId_idx" ON "FileObject"("ownerPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramDocument_programId_code_key" ON "ProgramDocument"("programId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentDocument_enrollmentId_documentId_key" ON "EnrollmentDocument"("enrollmentId", "documentId");

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_ownerPersonId_fkey" FOREIGN KEY ("ownerPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileBlob" ADD CONSTRAINT "FileBlob_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDocument" ADD CONSTRAINT "ProgramDocument_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentDocument" ADD CONSTRAINT "EnrollmentDocument_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentDocument" ADD CONSTRAINT "EnrollmentDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProgramDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentDocument" ADD CONSTRAINT "EnrollmentDocument_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_size_check" CHECK ("size" > 0 AND "size" <= 5242880);
ALTER TABLE "Program" ADD CONSTRAINT "Program_discount_check" CHECK ("familyDiscountPercent" BETWEEN 0 AND 100);
