-- Records which doctor saw each patient, for the doctor-wise analytics report.
--
-- Filled in when a token is called into a room, from that room's doctor name. Nullable:
-- older tokens have no value and the report falls back to the room's current doctor.

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN "served_by_doctor_name" TEXT;
