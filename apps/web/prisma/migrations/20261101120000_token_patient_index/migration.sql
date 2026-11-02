-- Index on tokens.patient_id for the booklet look-up (GET /api/v1/patients/lookup), which
-- reads a patient's recent visits by patient. Postgres does not index foreign keys by
-- itself, so until now every look-up scanned the whole tokens table, every visit of every
-- day; the cost grew with each day of use.
--
-- Additive and read-only for the code: nothing depends on it existing, so it can be
-- applied before or after the code is deployed. CONCURRENTLY builds it without blocking
-- new tokens during OPD hours (run it on its own, not inside a transaction).

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tokens_patient_id_idx" ON "tokens"("patient_id");
