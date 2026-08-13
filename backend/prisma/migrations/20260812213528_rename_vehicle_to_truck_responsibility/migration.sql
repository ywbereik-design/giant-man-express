-- Written by hand as a RENAME (not drop+recreate) so any vehicle values
-- admins already entered aren't lost.
ALTER TABLE "Driver" RENAME COLUMN "vehicle" TO "truckResponsibility";
