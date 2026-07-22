-- CreateIndex
CREATE INDEX "HoursReport_driverId_idx" ON "HoursReport"("driverId");

-- CreateIndex
CREATE INDEX "Invoice_businessId_idx" ON "Invoice"("businessId");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_jobId_idx" ON "InvoiceLineItem"("jobId");

-- CreateIndex
CREATE INDEX "Job_driverId_idx" ON "Job"("driverId");

-- CreateIndex
CREATE INDEX "Job_businessId_idx" ON "Job"("businessId");

-- CreateIndex
CREATE INDEX "Job_jobTypeId_idx" ON "Job"("jobTypeId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "TimeEntry_driverId_clockOutAt_idx" ON "TimeEntry"("driverId", "clockOutAt");
