-- Add active flag to StaffUser so admins can deactivate accounts (soft) or delete them (hard).
-- Existing accounts default to active so nobody gets locked out by this migration.
ALTER TABLE "StaffUser" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
