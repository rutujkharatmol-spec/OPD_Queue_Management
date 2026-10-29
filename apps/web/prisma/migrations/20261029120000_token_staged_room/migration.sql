-- Moves room staging ("send this waiting patient to Room 3") from each browser's local
-- storage into the database, so every screen sees the same room lists.
--
-- Both columns are nullable and nothing reads them until the matching code is deployed,
-- so this is safe to apply while the current version is running.

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN "staged_room" TEXT,
ADD COLUMN "staged_at" TIMESTAMP(6);
