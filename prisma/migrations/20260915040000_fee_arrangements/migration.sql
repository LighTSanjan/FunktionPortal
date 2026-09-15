-- Membership fees the exco can actually run.
--
-- 1. A fee per member per term, set by a person. The charge was only ever
--    read off the roster's free-text label, so there was no way to put
--    somebody on half a term, waive them, or charge a figure of the club's
--    own without editing the attendance sheet and re-importing it.
-- 2. Payments recorded by the exco straight off the bank statement. Most
--    members never open the portal, and a payment could only begin as their
--    own declaration — so most of the roster could never be marked as paid.

ALTER TYPE "FeeTier" ADD VALUE IF NOT EXISTS 'CUSTOM';

CREATE TYPE "PaymentSource" AS ENUM ('DECLARATION', 'RECORDED');
ALTER TABLE "fee_payments" ADD COLUMN "source" "PaymentSource" NOT NULL DEFAULT 'DECLARATION';

CREATE TABLE "fee_arrangements" (
  "id"           TEXT         NOT NULL,
  "org_id"       TEXT         NOT NULL,
  "term_id"      TEXT         NOT NULL,
  "member_id"    TEXT         NOT NULL,
  "tier"         "FeeTier"    NOT NULL,
  "amount_cents" INTEGER,
  "note"         TEXT,
  "set_by_id"    TEXT,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fee_arrangements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fee_arrangements_amount_check" CHECK ("amount_cents" IS NULL OR "amount_cents" >= 0)
);

CREATE UNIQUE INDEX "fee_arrangements_term_id_member_id_key" ON "fee_arrangements" ("term_id", "member_id");
CREATE INDEX "fee_arrangements_org_id_idx" ON "fee_arrangements" ("org_id");

ALTER TABLE "fee_arrangements" ADD CONSTRAINT "fee_arrangements_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_arrangements" ADD CONSTRAINT "fee_arrangements_term_id_fkey"
  FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_arrangements" ADD CONSTRAINT "fee_arrangements_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_arrangements" ADD CONSTRAINT "fee_arrangements_set_by_id_fkey"
  FOREIGN KEY ("set_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The exco decide; a member reads their own, because it is what they are
-- asked to pay.
ALTER TABLE "fee_arrangements" ENABLE ROW LEVEL SECURITY;
CREATE POLICY fee_arrangements_exco_all ON "fee_arrangements"
  FOR ALL TO authenticated
  USING (public.app_is_exco(org_id))
  WITH CHECK (public.app_is_exco(org_id));
CREATE POLICY fee_arrangements_own_read ON "fee_arrangements"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM members m
    WHERE m.id = fee_arrangements.member_id AND m.user_id = public.app_user_id()
  ));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "fee_arrangements" TO app_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "fee_arrangements" FROM anon, authenticated;
  END IF;
END
$$;

-- Nobody marks their own fee as paid, however it gets there. The guard
-- already refused confirming your own declaration; an exco member recording a
-- payment against the roster row that is theirs would walk round it.
CREATE OR REPLACE FUNCTION public.app_owns_member(member text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM members m WHERE m.id = member AND m.user_id = public.app_user_id()
  )
$$;
REVOKE EXECUTE ON FUNCTION public.app_owns_member(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.app_guard_fee_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor text := public.app_user_id();
BEGIN
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'CONFIRMED' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.app_is_exco(NEW.org_id) THEN
      RAISE EXCEPTION 'Only an exco member may confirm a payment'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.declared_by_user_id IS NOT NULL AND NEW.declared_by_user_id = actor THEN
      RAISE EXCEPTION 'A payment cannot be confirmed by the person who declared it'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF public.app_owns_member(NEW.member_id) THEN
      RAISE EXCEPTION 'Nobody confirms their own fee'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.status = 'REJECTED' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.app_is_exco(NEW.org_id) THEN
      RAISE EXCEPTION 'Only an exco member may reject a payment'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_guard_fee_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.app_user_id() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'DECLARED' AND NOT public.app_is_exco(NEW.org_id) THEN
    RAISE EXCEPTION 'A payment starts as a declaration'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = 'CONFIRMED' AND public.app_owns_member(NEW.member_id) THEN
    RAISE EXCEPTION 'Nobody confirms their own fee'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;
