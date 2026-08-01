-- Rename Job.customerPhone -> Job.clientPhone (hand-written as a RENAME
-- rather than the drop/add Prisma would otherwise generate, since this
-- preserves existing non-null values instead of discarding them).
ALTER TABLE "Job" RENAME COLUMN "customerPhone" TO "clientPhone";

-- Keep stored failureReason data in sync with the renamed FAILURE_REASONS
-- constant value ("Customer Rescheduled" -> "Client Rescheduled").
UPDATE "Job" SET "failureReason" = 'Client Rescheduled' WHERE "failureReason" = 'Customer Rescheduled';
