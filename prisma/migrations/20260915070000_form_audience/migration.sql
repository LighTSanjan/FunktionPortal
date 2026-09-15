-- Who a membership form is for, and nobody picks their own fee.
--
-- 1. A form goes to everybody, or only to the roster rows the exco pick —
--    the few people on a half term, say. Responses from anybody else are
--    refused, by the action and here.
-- 2. The fee is the term's rate or what the exco set for that person. The
--    form no longer offers a choice, so the columns that held one go.

-- CreateEnum
CREATE TYPE "FormAudience" AS ENUM ('EVERYONE', 'CHOSEN');

-- AlterTable
ALTER TABLE "membership_forms" DROP COLUMN "tier_choices",
ADD COLUMN     "audience" "FormAudience" NOT NULL DEFAULT 'EVERYONE';

-- AlterTable
ALTER TABLE "membership_responses" DROP COLUMN "tier";

-- CreateTable
CREATE TABLE "membership_form_recipients" (
    "form_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,

    CONSTRAINT "membership_form_recipients_pkey" PRIMARY KEY ("form_id","member_id")
);

-- CreateIndex
CREATE INDEX "membership_form_recipients_member_id_idx" ON "membership_form_recipients"("member_id");

-- AddForeignKey
ALTER TABLE "membership_form_recipients" ADD CONSTRAINT "membership_form_recipients_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "membership_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_form_recipients" ADD CONSTRAINT "membership_form_recipients_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_form_recipients" ADD CONSTRAINT "membership_form_recipients_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "membership_form_recipients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_form_recipients_exco_all ON "membership_form_recipients"
  FOR ALL TO authenticated
  USING (public.app_is_exco(org_id))
  WITH CHECK (public.app_is_exco(org_id));
CREATE POLICY membership_form_recipients_own_read ON "membership_form_recipients"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM members m
    WHERE m.id = membership_form_recipients.member_id AND m.user_id = public.app_user_id()
  ));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "membership_form_recipients" TO app_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "membership_form_recipients" FROM anon, authenticated;
  END IF;
END
$$;

-- A recipient belongs to the same club as its form and its roster row, and
-- nobody changes who a banked-in term's form was for.
CREATE OR REPLACE FUNCTION public.app_guard_form_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  row_form text := CASE WHEN TG_OP = 'DELETE' THEN OLD.form_id ELSE NEW.form_id END;
BEGIN
  IF TG_OP <> 'DELETE' AND (
    NOT EXISTS (SELECT 1 FROM membership_forms f WHERE f.id = NEW.form_id AND f.org_id = NEW.org_id)
    OR NOT EXISTS (SELECT 1 FROM members m WHERE m.id = NEW.member_id AND m.org_id = NEW.org_id)
  ) THEN
    RAISE EXCEPTION 'The form and the member must belong to the same club'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF public.app_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM membership_forms f JOIN terms t ON t.id = f.term_id
    WHERE f.id = row_form AND t.closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'That collection is closed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.app_guard_form_recipient() FROM PUBLIC;

DROP TRIGGER IF EXISTS membership_form_recipients_guard ON membership_form_recipients;
CREATE TRIGGER membership_form_recipients_guard
  BEFORE INSERT OR UPDATE OR DELETE ON membership_form_recipients
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_form_recipient();

CREATE OR REPLACE FUNCTION public.app_guard_membership_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor text := public.app_user_id();
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.term_id IS DISTINCT FROM OLD.term_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
  ) THEN
    RAISE EXCEPTION 'A response cannot be moved to another person, term or club'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM terms t WHERE t.id = NEW.term_id AND t.org_id = NEW.org_id)
     OR (NEW.member_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM members m WHERE m.id = NEW.member_id AND m.org_id = NEW.org_id)) THEN
    RAISE EXCEPTION 'The term and the member must belong to the same club as the response'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM terms WHERE id = NEW.term_id AND closed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'That collection is closed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF public.app_is_exco(NEW.org_id) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM membership_forms f WHERE f.term_id = NEW.term_id AND f.state = 'OPEN') THEN
    RAISE EXCEPTION 'That form is not taking responses'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A form for chosen people takes responses only from them.
  IF EXISTS (SELECT 1 FROM membership_forms f WHERE f.term_id = NEW.term_id AND f.audience = 'CHOSEN')
     AND NOT EXISTS (
       SELECT 1
       FROM membership_forms f
       JOIN membership_form_recipients r ON r.form_id = f.id
       JOIN members m ON m.id = r.member_id
       WHERE f.term_id = NEW.term_id AND m.user_id = actor
     ) THEN
    RAISE EXCEPTION 'That form is not for you'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = actor AND lower(u.email) = lower(NEW.email)) THEN
    RAISE EXCEPTION 'A response carries the address it was sent from'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.matched_by_id IS NOT NULL OR NEW.matched_at IS NOT NULL THEN
      RAISE EXCEPTION 'Only the exco match a response'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.member_id IS NOT NULL AND NOT public.app_owns_member(NEW.member_id) THEN
      RAISE EXCEPTION 'A response reaches a roster row only from the account linked to it'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    IF NEW.matched_by_id IS DISTINCT FROM OLD.matched_by_id OR NEW.matched_at IS DISTINCT FROM OLD.matched_at THEN
      RAISE EXCEPTION 'Only the exco match a response'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.member_id IS DISTINCT FROM OLD.member_id
       AND (OLD.member_id IS NOT NULL OR NEW.member_id IS NULL OR NOT public.app_owns_member(NEW.member_id)) THEN
      RAISE EXCEPTION 'A response reaches a roster row only from the account linked to it'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.app_guard_membership_response() FROM PUBLIC;
