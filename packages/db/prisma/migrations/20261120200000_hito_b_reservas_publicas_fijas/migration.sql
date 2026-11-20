-- CreateEnum
CREATE TYPE "BookingSeriesStatus" AS ENUM ('active', 'cancelled');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "public" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seriesId" TEXT;

-- CreateTable
CREATE TABLE "BookingSeries" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "fromDay" TEXT NOT NULL,
    "untilDay" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "BookingSeriesStatus" NOT NULL DEFAULT 'active',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "BookingSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingSeries_venueId_idx" ON "BookingSeries"("venueId");

-- CreateIndex
CREATE INDEX "Booking_seriesId_idx" ON "Booking"("seriesId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "BookingSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSeries" ADD CONSTRAINT "BookingSeries_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSeries" ADD CONSTRAINT "BookingSeries_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "BookingSeries" ADD CONSTRAINT "BookingSeries_values_check" CHECK (
  "weekday" BETWEEN 0 AND 6 AND "startMinute" BETWEEN 0 AND 1439
  AND "fromDay" ~ '^\d{4}-\d{2}-\d{2}$' AND "untilDay" ~ '^\d{4}-\d{2}-\d{2}$' AND "fromDay" <= "untilDay"
);
