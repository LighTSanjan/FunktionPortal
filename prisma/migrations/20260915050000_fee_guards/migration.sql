-- Holes a review found in the fee tables' database-level rules.
--
-- 1. A confirmed payment could be moved onto another roster row afterwards —
--    including the confirming exco member's own — because the self-
--    confirmation check only ran when the status changed. The row a payment
--    belongs to is now fixed once written, and the ownership check runs on
--    every write that leaves a payment confirmed.
-- 2. org_id was trusted as given. A fee row naming one club with another
--    club's term or member would be read by the wrong people. The database
--    now checks all three agree.
-- 3. A closed collection only refused inserts and updates from members.
--    Nobody deletes a payment, or touches a fee arrangement, once it is closed.

CREATE OR REPLACE FUNCTION public.app_guard_fee_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.term_id IS DISTINCT FROM OLD.term_id
    OR NEW.member_id IS DISTINCT FROM OLD.member_id
  ) THEN
    RAISE EXCEPTION 'A fee row cannot be moved to another member, term or club'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM terms t WHERE t.id = NEW.term_id AND t.org_id = NEW.org_id)
     OR NOT EXISTS (SELECT 1 FROM members m WHERE m.id = NEW.member_id AND m.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'The term and the member must belong to the same club as the fee'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.app_guard_fee_row() FROM PUBLIC;

DROP TRIGGER IF EXISTS fee_payments_row_guard ON fee_payments;
CREATE TRIGGER fee_payments_row_guard
  BEFORE INSERT OR UPDATE ON fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_fee_row();

DROP TRIGGER IF EXISTS fee_arrangements_row_guard ON fee_arrangements;
CREATE TRIGGER fee_arrangements_row_guard
  BEFORE INSERT OR UPDATE ON fee_arrangements
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_fee_row();

CREATE OR REPLACE FUNCTION public.app_guard_fee_frozen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_term text := CASE WHEN TG_OP = 'DELETE' THEN OLD.term_id ELSE NEW.term_id END;
BEGIN
  IF public.app_user_id() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF EXISTS (SELECT 1 FROM terms WHERE id = row_term AND closed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'That collection is closed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.app_guard_fee_frozen() FROM PUBLIC;

DROP TRIGGER IF EXISTS fee_payments_frozen_delete ON fee_payments;
CREATE TRIGGER fee_payments_frozen_delete
  BEFORE DELETE ON fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_fee_frozen();

DROP TRIGGER IF EXISTS fee_arrangements_frozen ON fee_arrangements;
CREATE TRIGGER fee_arrangements_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON fee_arrangements
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_fee_frozen();

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
  END IF;

  -- Every write that leaves a payment confirmed, not only the one that
  -- confirmed it.
  IF NEW.status = 'CONFIRMED' AND public.app_owns_member(NEW.member_id) THEN
    RAISE EXCEPTION 'Nobody confirms their own fee'
      USING ERRCODE = 'insufficient_privilege';
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
