-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "clientPhone";

-- CreateIndex
CREATE UNIQUE INDEX "Business_code_key" ON "Business"("code");

