-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "licenseExpiry" TIMESTAMP(3),
ADD COLUMN     "licenseGrade" TEXT,
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "vehicle" TEXT;
