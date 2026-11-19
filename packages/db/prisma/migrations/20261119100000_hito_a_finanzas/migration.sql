-- Hito A · Finanzas: cargos, cobros, imputaciones y bitácora de pagos. Montos en centavos.
-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('pending', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'transfer', 'card', 'mercadopago');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'approved', 'rejected', 'refunded');

-- AlterTable
ALTER TABLE "MembershipCategory" ADD COLUMN     "monthlyFee" INTEGER;

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "groupLabel" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "period" TEXT,
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "issuedById" TEXT,
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "payerPersonId" TEXT,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "providerRef" TEXT,
    "intent" TEXT[],
    "note" TEXT,
    "recordedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Charge_personId_status_idx" ON "Charge"("personId", "status");

-- CreateIndex
CREATE INDEX "Charge_status_dueDate_idx" ON "Charge"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_source_sourceRef_key" ON "Charge"("source", "sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_number_key" ON "Payment"("number");

-- CreateIndex
CREATE INDEX "Payment_payerPersonId_createdAt_idx" ON "Payment"("payerPersonId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_receivedAt_idx" ON "Payment"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerRef_key" ON "Payment"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "PaymentAllocation_chargeId_idx" ON "PaymentAllocation"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentId_chargeId_key" ON "PaymentAllocation"("paymentId", "chargeId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_at_idx" ON "PaymentEvent"("paymentId", "at");

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payerPersonId_fkey" FOREIGN KEY ("payerPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Invariantes de dinero en la base, además de en el servicio.
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_paid_in_range" CHECK ("paidAmount" >= 0 AND "paidAmount" <= "amount");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "MembershipCategory" ADD CONSTRAINT "MembershipCategory_fee_positive" CHECK ("monthlyFee" IS NULL OR "monthlyFee" > 0);
