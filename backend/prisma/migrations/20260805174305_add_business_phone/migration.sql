-- Add a nullable contact phone number to Business — purely additive, no
-- existing data affected.
ALTER TABLE "Business" ADD COLUMN "phone" TEXT;
