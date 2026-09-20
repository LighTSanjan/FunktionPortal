-- Financial register rows are corrected by an explicit, reasoned void rather
-- than deletion. The row stays visible, but no longer contributes to totals.
ALTER TABLE "register_entries"
  ADD COLUMN "voided_at" TIMESTAMP(3),
  ADD COLUMN "voided_by_id" TEXT,
  ADD COLUMN "void_reason" TEXT;

ALTER TABLE "register_entries"
  ADD CONSTRAINT "register_entries_void_state_check"
  CHECK (
    ("voided_at" IS NULL AND "voided_by_id" IS NULL AND "void_reason" IS NULL)
    OR
    ("voided_at" IS NOT NULL AND "voided_by_id" IS NOT NULL AND length(btrim("void_reason")) BETWEEN 5 AND 500)
  );

ALTER TABLE "register_entries"
  ADD CONSTRAINT "register_entries_voided_by_id_fkey"
  FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "register_entries_org_id_voided_at_idx"
  ON "register_entries"("org_id", "voided_at");

-- The runtime role can void and restore, but cannot erase the evidence.
-- Migrations and disaster-recovery tooling use the owner role and remain able
-- to restore full backups when necessary.
REVOKE DELETE ON "register_entries" FROM "app_user";
