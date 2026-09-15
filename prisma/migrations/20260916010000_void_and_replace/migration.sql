-- Voiding a raised month, and raising it again.
--
-- One invoice and one attendance sheet per coach per month was a unique key,
-- so a month raised with a mistake in it could never be replaced: voiding it
-- left the key occupied. The reference number of a voided document stays
-- issued (the gap in the series is the audit trail), so a replacement is a new
-- row with a new number, and only one LIVE document may exist per coach-month.

ALTER TABLE "invoices" ADD COLUMN "voided_at" TIMESTAMP(3);
ALTER TABLE "attendance_sheets" ADD COLUMN "voided_at" TIMESTAMP(3);

-- Anything already voided before this existed.
UPDATE "invoices" i
   SET "voided_at" = COALESCE(r."voided_at", now())
  FROM "reference_numbers" r
 WHERE i."status" = 'VOID' AND i."voided_at" IS NULL AND r."id" = i."reference_number_id";
UPDATE "invoices" SET "voided_at" = now() WHERE "status" = 'VOID' AND "voided_at" IS NULL;
UPDATE "attendance_sheets" s
   SET "voided_at" = i."voided_at"
  FROM "invoices" i
 WHERE i."attendance_sheet_id" = s."id" AND i."voided_at" IS NOT NULL AND s."voided_at" IS NULL;

DROP INDEX IF EXISTS "invoices_org_id_instructor_id_period_year_period_month_key";
DROP INDEX IF EXISTS "attendance_sheets_org_id_instructor_id_period_year_period_m_key";

CREATE INDEX "invoices_org_id_instructor_id_period_year_period_month_idx"
  ON "invoices"("org_id", "instructor_id", "period_year", "period_month");
CREATE INDEX "attendance_sheets_org_id_instructor_id_period_year_period_m_idx"
  ON "attendance_sheets"("org_id", "instructor_id", "period_year", "period_month");

-- The rule that matters, which Prisma's schema language cannot state: one
-- live document per coach per month.
CREATE UNIQUE INDEX "invoices_live_per_coach_month_key"
  ON "invoices"("org_id", "instructor_id", "period_year", "period_month")
  WHERE "voided_at" IS NULL;
CREATE UNIQUE INDEX "attendance_sheets_live_per_coach_month_key"
  ON "attendance_sheets"("org_id", "instructor_id", "period_year", "period_month")
  WHERE "voided_at" IS NULL;

-- A voided invoice stays voided. Nothing in the portal un-voids, and a
-- document the Office of Finance were told is void must not quietly come back.
CREATE OR REPLACE FUNCTION public.app_guard_invoice_void()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD."voided_at" IS NOT NULL AND (NEW."voided_at" IS NULL OR NEW."status" <> 'VOID') THEN
    RAISE EXCEPTION 'A voided invoice cannot be brought back'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."status" = 'VOID' AND NEW."voided_at" IS NULL THEN
    NEW."voided_at" := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.app_guard_invoice_void() FROM PUBLIC;

DROP TRIGGER IF EXISTS invoices_void_guard ON invoices;
CREATE TRIGGER invoices_void_guard
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_invoice_void();
