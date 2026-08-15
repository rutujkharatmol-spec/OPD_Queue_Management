-- DropIndex
DROP INDEX "patients_uhid_key";

-- AlterTable
ALTER TABLE "patients" ALTER COLUMN "uhid" DROP NOT NULL;
