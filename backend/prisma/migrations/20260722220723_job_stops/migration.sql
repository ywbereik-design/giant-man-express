/*
  Warnings:

  - You are about to drop the column `dropoffAddress` on the `Job` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Job" DROP COLUMN "dropoffAddress";

-- CreateTable
CREATE TABLE "JobStop" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobStop_jobId_sequence_idx" ON "JobStop"("jobId", "sequence");

-- AddForeignKey
ALTER TABLE "JobStop" ADD CONSTRAINT "JobStop_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
