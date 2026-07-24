-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "HoursReport_driverId_periodStart_periodEnd_key" ON "HoursReport"("driverId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLineItem_jobId_key" ON "InvoiceLineItem"("jobId");

-- DropIndex (superseded by the unique index above, which also serves lookups by jobId)
DROP INDEX IF EXISTS "InvoiceLineItem_jobId_idx";
