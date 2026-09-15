-- Who was charged what when a collection closed.
--
-- A closed collection was still worked out from the live roster: somebody who
-- joined later showed as owing for a term they were never in, and a roster
-- label changed next term re-priced what a closed term said people owed. The
-- deposit form's figure was fixed; the list beside it was not. Closing now
-- writes each row down, and a closed term is read from these.

-- Set in the closing transaction whether or not anybody was charged, so a
-- closed term with no rows is still read as closed-and-recorded rather than
-- mistaken for one closed before any of this existed.
ALTER TABLE "terms" ADD COLUMN "charges_recorded_at" TIMESTAMP(3);

CREATE TABLE "term_close_charges" (
  "term_id"      TEXT NOT NULL,
  "member_id"    TEXT NOT NULL,
  "org_id"       TEXT NOT NULL,
  "tier"         "FeeTier" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "roster_label" TEXT,
  "on_roster"    BOOLEAN NOT NULL,
  CONSTRAINT "term_close_charges_pkey" PRIMARY KEY ("term_id", "member_id"),
  CONSTRAINT "term_close_charges_amount_check" CHECK ("amount_cents" >= 0)
);
CREATE INDEX "term_close_charges_org_id_idx" ON "term_close_charges" ("org_id");

ALTER TABLE "term_close_charges" ADD CONSTRAINT "term_close_charges_term_id_fkey"
  FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "term_close_charges" ADD CONSTRAINT "term_close_charges_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "term_close_charges" ADD CONSTRAINT "term_close_charges_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "term_close_charges" ENABLE ROW LEVEL SECURITY;
CREATE POLICY term_close_charges_exco_all ON "term_close_charges"
  FOR ALL TO authenticated
  USING (public.app_is_exco(org_id))
  WITH CHECK (public.app_is_exco(org_id));
CREATE POLICY term_close_charges_own_read ON "term_close_charges"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM members m
    WHERE m.id = term_close_charges.member_id
      AND m.org_id = term_close_charges.org_id
      AND m.user_id = public.app_user_id()
  ) AND public.app_is_member(org_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    -- Written once, never changed: no UPDATE or DELETE for the app at all.
    GRANT SELECT, INSERT ON "term_close_charges" TO app_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "term_close_charges" FROM anon, authenticated;
  END IF;
END
$$;

-- Written in the same transaction as closing, before the term is marked
-- closed; nothing changes them after.
CREATE OR REPLACE FUNCTION public.app_guard_close_charges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_term text := CASE WHEN TG_OP = 'DELETE' THEN OLD.term_id ELSE NEW.term_id END;
  row_org  text := CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END;
BEGIN
  IF public.app_user_id() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'A closed collection''s charges are not changed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM terms WHERE id = row_term AND org_id = row_org)
     OR NOT EXISTS (SELECT 1 FROM members WHERE id = NEW.member_id AND org_id = row_org) THEN
    RAISE EXCEPTION 'That term or member belongs to another club'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (SELECT 1 FROM terms WHERE id = row_term AND closed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'That collection is closed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.app_guard_close_charges() FROM PUBLIC;

DROP TRIGGER IF EXISTS term_close_charges_guard ON term_close_charges;
CREATE TRIGGER term_close_charges_guard
  BEFORE INSERT OR UPDATE OR DELETE ON term_close_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_close_charges();
