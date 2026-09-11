-- The control the whole fee collection turns on, enforced by the database.
--
-- A member declaring they have paid is a claim; an exco member confirming it
-- is the record. Both are guarded in the application, and the row-level policy
-- on fee_payments could not express the difference — it grants a member full
-- access to their own row, and its own comment says the transition is
-- "guarded in the application".
--
-- That is true of the portal and not true of the database. The policies are
-- granted TO authenticated, which is the role PostgREST uses, so anybody
-- holding the publishable key and their own session could update their own
-- row to CONFIRMED without going near the application at all. A control that
-- one HTTP request bypasses is not a control.
--
-- So the transition is a trigger. It refuses any move into CONFIRMED unless
-- the caller is an active exco member of the owning organisation and is not
-- the person who declared it.
CREATE OR REPLACE FUNCTION public.app_guard_fee_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinned: a SECURITY DEFINER function without one lets a caller who can
-- create a table earlier on the path choose what it reads.
SET search_path = public, pg_temp
AS $$
DECLARE
  actor text := public.app_user_id();
BEGIN
  -- The service role has no JWT claims and is how the seed, the import
  -- scripts and any future background job write. Those are trusted paths that
  -- do not run as a person.
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
  END IF;

  -- Rejection is the same decision reached the other way, and is held to the
  -- same rule.
  IF NEW.status = 'REJECTED' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.app_is_exco(NEW.org_id) THEN
      RAISE EXCEPTION 'Only an exco member may reject a payment'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_guard_fee_confirmation() FROM PUBLIC;

DROP TRIGGER IF EXISTS fee_payments_confirmation_guard ON fee_payments;
CREATE TRIGGER fee_payments_confirmation_guard
  BEFORE UPDATE ON fee_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_fee_confirmation();

-- An INSERT cannot arrive already confirmed either. Splitting it from the
-- UPDATE trigger keeps each one about a single transition.
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

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.app_guard_fee_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS fee_payments_insert_guard ON fee_payments;
CREATE TRIGGER fee_payments_insert_guard
  BEFORE INSERT ON fee_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.app_guard_fee_insert();
