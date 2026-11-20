-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "FeeKind" AS ENUM ('monthly', 'once');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('confirmed', 'pending', 'waitlist', 'withdrawn');

-- CreateEnum
CREATE TYPE "AttendanceMark" AS ENUM ('present', 'absent', 'late');

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "activity" TEXT NOT NULL,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "membersOnly" BOOLEAN NOT NULL DEFAULT false,
    "feeKind" "FeeKind" NOT NULL DEFAULT 'monthly',
    "memberFee" INTEGER NOT NULL,
    "guestFee" INTEGER NOT NULL,
    "status" "ProgramStatus" NOT NULL DEFAULT 'open',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "place" TEXT,
    "teacherName" TEXT,
    "capacity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL,
    "waitPosition" INTEGER,
    "memberRate" BOOLEAN NOT NULL DEFAULT false,
    "fee" INTEGER NOT NULL,
    "chargeId" TEXT,
    "enrolledById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "withdrawReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "mark" "AttendanceMark" NOT NULL,
    "markedById" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Program_slug_key" ON "Program"("slug");

-- CreateIndex
CREATE INDEX "Program_module_status_idx" ON "Program"("module", "status");

-- CreateIndex
CREATE INDEX "Group_programId_idx" ON "Group"("programId");

-- CreateIndex
CREATE INDEX "Enrollment_groupId_status_idx" ON "Enrollment"("groupId", "status");

-- CreateIndex
CREATE INDEX "Enrollment_personId_idx" ON "Enrollment"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_groupId_personId_day_key" ON "Attendance"("groupId", "personId", "day");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una sola inscripción vigente por persona y grupo (las bajas quedan como historia).
CREATE UNIQUE INDEX "Enrollment_active_unique" ON "Enrollment" ("groupId", "personId") WHERE "status" <> 'withdrawn';

ALTER TABLE "Group" ADD CONSTRAINT "Group_values_check" CHECK (
  "capacity" > 0 AND "days" BETWEEN 1 AND 127 AND "startMinute" BETWEEN 0 AND 1439 AND "durationMinutes" BETWEEN 15 AND 720
);
ALTER TABLE "Program" ADD CONSTRAINT "Program_values_check" CHECK (
  "memberFee" >= 0 AND "guestFee" >= 0 AND ("minAge" IS NULL OR "maxAge" IS NULL OR "minAge" <= "maxAge")
);
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_wait_check" CHECK ((("status" = 'waitlist') = ("waitPosition" IS NOT NULL)) AND "fee" >= 0);
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_day_check" CHECK ("day" ~ '^\d{4}-\d{2}-\d{2}$');
