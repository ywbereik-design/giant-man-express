/*
  Warnings:

  - You are about to drop the column `arrivalPhoto` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `completedAt` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `startedAt` on the `Job` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "HoursReport" ADD COLUMN     "totalDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "arrivalPhoto",
DROP COLUMN "completedAt",
DROP COLUMN "startedAt",
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "onTheWayAt" TIMESTAMP(3),
ADD COLUMN     "pickedUpAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "clockInPhoto" TEXT;
