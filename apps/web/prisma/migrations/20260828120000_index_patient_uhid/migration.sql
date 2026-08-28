-- Restores an index on patients.uhid.
--
-- 20260815141502_uhid_optional_non_unique dropped "patients_uhid_key" to make the column
-- optional and non-unique, but did not put a plain index back. Registration looks a
-- patient up by UHID before it looks them up by phone, so from that migration onward the
-- first query of every token issued was a sequential scan of the whole patients table.

-- CreateIndex
CREATE INDEX "patients_uhid_idx" ON "patients"("uhid");
