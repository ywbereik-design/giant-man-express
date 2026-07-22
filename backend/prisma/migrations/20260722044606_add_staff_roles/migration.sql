-- Rename AdminUser to StaffUser and add a role column, preserving existing rows.
ALTER TABLE "AdminUser" RENAME TO "StaffUser";
ALTER TABLE "StaffUser" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'ADMIN';
