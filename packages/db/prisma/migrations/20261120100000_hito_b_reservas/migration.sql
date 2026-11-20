-- CreateEnum
CREATE TYPE "VenueStatus" AS ENUM ('available', 'maintenance', 'out_of_service');

-- CreateEnum
CREATE TYPE "AgendaKind" AS ENUM ('block', 'match', 'tournament', 'event', 'school', 'booking');

-- CreateEnum
CREATE TYPE "AgendaSlotStatus" AS ENUM ('held', 'confirmed', 'released');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('held', 'confirmed', 'cancelled', 'expired', 'conflict');

-- CreateEnum
CREATE TYPE "BookingPayMode" AS ENUM ('full', 'deposit', 'club');

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "status" "VenueStatus" NOT NULL DEFAULT 'available',
    "statusNote" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaSlot" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "kind" "AgendaKind" NOT NULL,
    "priority" INTEGER NOT NULL,
    "status" "AgendaSlotStatus" NOT NULL DEFAULT 'confirmed',
    "holdExpiresAt" TIMESTAMP(3),
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "createdById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingRule" (
    "venueId" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 60,
    "openFrom" INTEGER NOT NULL DEFAULT 480,
    "openTo" INTEGER NOT NULL DEFAULT 1380,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 14,
    "holdMinutes" INTEGER NOT NULL DEFAULT 10,
    "cancelHours" INTEGER NOT NULL DEFAULT 24,
    "depositPercent" INTEGER NOT NULL DEFAULT 50,
    "payAtClub" BOOLEAN NOT NULL DEFAULT false,
    "publicBooking" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRule_pkey" PRIMARY KEY ("venueId")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 127,
    "fromMinute" INTEGER NOT NULL,
    "toMinute" INTEGER NOT NULL,
    "memberPrice" INTEGER NOT NULL,
    "guestPrice" INTEGER NOT NULL,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "slotId" TEXT,
    "personId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'held',
    "payMode" "BookingPayMode" NOT NULL,
    "price" INTEGER NOT NULL,
    "chargeAmount" INTEGER NOT NULL,
    "memberRate" BOOLEAN NOT NULL,
    "chargeId" TEXT,
    "holdExpiresAt" TIMESTAMP(3),
    "refundDue" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "Venue"("slug");

-- CreateIndex
CREATE INDEX "AgendaSlot_venueId_startsAt_idx" ON "AgendaSlot"("venueId", "startsAt");

-- CreateIndex
CREATE INDEX "AgendaSlot_status_holdExpiresAt_idx" ON "AgendaSlot"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "AgendaSlot_source_sourceRef_idx" ON "AgendaSlot"("source", "sourceRef");

-- CreateIndex
CREATE INDEX "Tariff_venueId_idx" ON "Tariff"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_slotId_key" ON "Booking"("slotId");

-- CreateIndex
CREATE INDEX "Booking_personId_startsAt_idx" ON "Booking"("personId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_venueId_startsAt_idx" ON "Booking"("venueId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_status_holdExpiresAt_idx" ON "Booking"("status", "holdExpiresAt");

-- AddForeignKey
ALTER TABLE "AgendaSlot" ADD CONSTRAINT "AgendaSlot_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingRule" ADD CONSTRAINT "BookingRule_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tariff" ADD CONSTRAINT "Tariff_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AgendaSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Reglas que la base garantiza aunque falle la aplicación.
ALTER TABLE "AgendaSlot" ADD CONSTRAINT "AgendaSlot_range_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "AgendaSlot" ADD CONSTRAINT "AgendaSlot_hold_check" CHECK ("status" <> 'held' OR "holdExpiresAt" IS NOT NULL);
ALTER TABLE "BookingRule" ADD CONSTRAINT "BookingRule_values_check" CHECK (
  "slotMinutes" BETWEEN 15 AND 480 AND "openFrom" >= 0 AND "openTo" <= 1440 AND "openFrom" < "openTo"
  AND "maxAdvanceDays" BETWEEN 0 AND 365 AND "holdMinutes" BETWEEN 2 AND 60 AND "cancelHours" BETWEEN 0 AND 720
  AND "depositPercent" BETWEEN 0 AND 100
);
ALTER TABLE "Tariff" ADD CONSTRAINT "Tariff_values_check" CHECK (
  "days" BETWEEN 1 AND 127 AND "fromMinute" >= 0 AND "toMinute" <= 1440 AND "fromMinute" < "toMinute"
  AND "memberPrice" >= 0 AND "guestPrice" >= 0
);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_values_check" CHECK (
  "endsAt" > "startsAt" AND "price" >= 0 AND "chargeAmount" >= 0 AND "chargeAmount" <= "price" AND "refundDue" >= 0
);
