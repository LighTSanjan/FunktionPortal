-- A voided reference number can be issued again.
--
-- The Office of Finance reads a gap in the series as a missed number, and a
-- void-and-replace used to leave exactly that: voiding 0017 and 0018 and
-- raising the months again issued 0019 and 0020. Allocation now hands out the
-- lowest voided number that no live document holds (see allocate.ts).
--
-- The voided document keeps its own row — number, reason and date — so it can
-- still say what it was called. What changes is that the number is no longer
-- unique across ALL rows, only across live ones: one live row per sequence,
-- and one live row per rendered number. Prisma cannot state a partial index,
-- so the schema carries plain indexes and the rule lives here, as it does for
-- invoices (20260916010000_void_and_replace).

DROP INDEX IF EXISTS "reference_numbers_org_id_series_financial_year_sequence_key";
DROP INDEX IF EXISTS "reference_numbers_org_id_formatted_key";

CREATE INDEX "reference_numbers_org_id_series_financial_year_sequence_idx"
  ON "reference_numbers"("org_id", "series", "financial_year", "sequence");
CREATE INDEX "reference_numbers_org_id_formatted_idx"
  ON "reference_numbers"("org_id", "formatted");

CREATE UNIQUE INDEX "reference_numbers_live_sequence_key"
  ON "reference_numbers"("org_id", "series", "financial_year", "sequence")
  WHERE "voided_at" IS NULL;
CREATE UNIQUE INDEX "reference_numbers_live_formatted_key"
  ON "reference_numbers"("org_id", "formatted")
  WHERE "voided_at" IS NULL;
