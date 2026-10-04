-- The president and treasurer decide every payment, their own included.
--
-- Until now nobody could confirm, refuse or record their own fee: a second
-- exco member had to. On a club this size there often is no second person
-- with the time, and the club's two officers answer for the collection either
-- way, so for them the rule held their own fee up rather than protecting it.
-- Every other exco member still leaves their own fee to somebody else, and
-- every decision is audited with who made it.

CREATE OR REPLACE FUNCTION public.app_decides_own_fee(target_org text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organisation_memberships m
    WHERE m.org_id = target_org
      AND m.user_id = public.app_user_id()
      AND m.is_active
      AND m.role = 'EXCO'
      AND m.office IN ('PRESIDENT', 'TREASURER')
  )
$$;
REVOKE EXECUTE ON FUNCTION public.app_decides_own_fee(text) FROM PUBLIC;

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

    IF NEW.declared_by_user_id IS NOT NULL AND NEW.declared_by_user_id = actor
       AND NOT public.app_decides_own_fee(NEW.org_id) THEN
      RAISE EXCEPTION 'A payment cannot be confirmed by the person who declared it'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Every write that leaves a payment confirmed, not only the one that
  -- confirmed it.
  IF NEW.status = 'CONFIRMED' AND public.app_owns_member(NEW.member_id)
     AND NOT public.app_decides_own_fee(NEW.org_id) THEN
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

  IF NEW.status = 'CONFIRMED' AND public.app_owns_member(NEW.member_id)
     AND NOT public.app_decides_own_fee(NEW.org_id) THEN
    RAISE EXCEPTION 'Nobody confirms their own fee'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;
