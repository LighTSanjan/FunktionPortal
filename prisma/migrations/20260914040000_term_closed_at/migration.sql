-- Whether a collection is closed, as a fact on the term.
--
-- It used to be inferred from whether an income_deposits row existed. That
-- stopped working the moment deposits became exco-only: a member's session
-- can no longer see the row, so to a member every collection looked open —
-- the PayNow QR kept serving after close, and a declaration against a closed,
-- banked collection was accepted. Both were caught by the integration tests
-- the tightening was written against.
--
-- Closure is not secret. The figures are; the fact is not.
ALTER TABLE "terms" ADD COLUMN "closed_at" TIMESTAMP(3);

UPDATE "terms" t
   SET "closed_at" = COALESCE(d."generated_at", now())
  FROM "income_deposits" d
 WHERE d."term_id" = t."id" AND t."closed_at" IS NULL;

-- And refused in the database too, so no server path can forget it: once a
-- collection is closed, only the exco can write a payment against it.
CREATE OR REPLACE FUNCTION public.app_guard_fee_closed_term()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.app_user_id() IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM terms WHERE id = NEW.term_id AND closed_at IS NOT NULL)
     AND NOT public.app_is_exco(NEW.org_id) THEN
    RAISE EXCEPTION 'That collection is closed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_guard_fee_closed_term() FROM PUBLIC;

DROP TRIGGER IF EXISTS fee_payments_closed_term_guard ON fee_payments;
CREATE TRIGGER fee_payments_closed_term_guard
  BEFORE INSERT OR UPDATE ON fee_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_fee_closed_term();
