-- CreateIndex
CREATE INDEX "Job_businessId_status_deliveredAt_idx" ON "Job"("businessId", "status", "deliveredAt");

-- CreateIndex
CREATE INDEX "Job_driverId_status_deliveredAt_idx" ON "Job"("driverId", "status", "deliveredAt");
