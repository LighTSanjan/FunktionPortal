-- Months of coach payments dealt with outside the portal.
--
-- The attendance import brings in the classes of months the club paid for
-- long before the portal existed, and each of them read as unclaimed. This
-- records that a person has said otherwise, when, and why.
CREATE TABLE "coach_month_settlements" (
  "id"            TEXT         NOT NULL,
  "org_id"        TEXT         NOT NULL,
  "period_year"   INTEGER      NOT NULL,
  "period_month"  INTEGER      NOT NULL,
  "note"          TEXT,
  "settled_by_id" TEXT,
  "settled_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coach_month_settlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_month_settlements_month_check" CHECK ("period_month" BETWEEN 1 AND 12)
);

CREATE UNIQUE INDEX "coach_month_settlements_org_id_period_year_period_month_key"
  ON "coach_month_settlements" ("org_id", "period_year", "period_month");

ALTER TABLE "coach_month_settlements"
  ADD CONSTRAINT "coach_month_settlements_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_month_settlements"
  ADD CONSTRAINT "coach_month_settlements_settled_by_id_fkey"
  FOREIGN KEY ("settled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Money, so exco only, like the invoices it stands in for.
ALTER TABLE "coach_month_settlements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY coach_month_settlements_exco_only ON "coach_month_settlements"
  FOR ALL TO authenticated
  USING (public.app_is_exco(org_id))
  WITH CHECK (public.app_is_exco(org_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "coach_month_settlements" TO app_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "coach_month_settlements" FROM anon, authenticated;
  END IF;
END
$$;
