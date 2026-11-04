-- "All at once" registration: the desk collects a pile of booklets, gives each one a
-- serial number and chooses its doctor, but issues no token. The token is issued only
-- when the patient comes back to the desk for their booklet, so their place in the
-- queue starts then.
--
-- A new table that nothing else reads, so it is safe to apply while the current version
-- is running. Apply it before deploying the code that uses it.

-- CreateTable
CREATE TABLE IF NOT EXISTS "booklets" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "deleted_at" TIMESTAMP(6),
    "service_date" DATE NOT NULL,
    "serial_number" INTEGER NOT NULL,
    "priority" "TokenPriority" NOT NULL DEFAULT 'NORMAL',
    "doctor_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "handed_at" TIMESTAMP(6),
    "department_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "token_id" UUID,

    CONSTRAINT "booklets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "booklets_department_id_service_date_serial_number_key" ON "booklets"("department_id", "service_date", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "booklets_token_id_key" ON "booklets"("token_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "booklets_patient_id_idx" ON "booklets"("patient_id");

-- AddForeignKey
ALTER TABLE "booklets" ADD CONSTRAINT "booklets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booklets" ADD CONSTRAINT "booklets_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booklets" ADD CONSTRAINT "booklets_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
