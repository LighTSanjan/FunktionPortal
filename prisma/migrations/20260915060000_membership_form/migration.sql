-- The membership form.
--
-- Each term gets the form members fill in to join for the term and pay: the
-- Google Form the club used to run, with the roster, the fee and the payment
-- built in. The exco open it, close it, reopen it, add their own questions,
-- and read the responses. Somebody who is not on the roster yet can fill it
-- in too, and an exco member matches them or adds them.

-- CreateEnum
CREATE TYPE "FormState" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FormQuestionType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'YES_NO', 'ONE_CHOICE', 'MANY_CHOICES');

-- CreateTable
CREATE TABLE "membership_forms" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "state" "FormState" NOT NULL DEFAULT 'DRAFT',
    "intro" TEXT,
    "tier_choices" "FeeTier"[] DEFAULT ARRAY['FULL', 'HALF', 'EXCHANGE_DISCOUNT']::"FeeTier"[],
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_questions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "FormQuestionType" NOT NULL,
    "label" TEXT NOT NULL,
    "help" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_responses" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "member_id" TEXT,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "student_id" TEXT,
    "birth_day" INTEGER,
    "birth_month" INTEGER,
    "birth_year" INTEGER,
    "tier" "FeeTier",
    "answers" JSONB NOT NULL DEFAULT '[]',
    "held_reference" TEXT,
    "held_proof_path" TEXT,
    "held_amount_cents" INTEGER,
    "held_at" TIMESTAMP(3),
    "matched_by_id" TEXT,
    "matched_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "membership_forms_term_id_key" ON "membership_forms"("term_id");

-- CreateIndex
CREATE INDEX "membership_forms_org_id_idx" ON "membership_forms"("org_id");

-- CreateIndex
CREATE INDEX "membership_questions_form_id_position_idx" ON "membership_questions"("form_id", "position");

-- CreateIndex
CREATE INDEX "membership_responses_org_id_term_id_idx" ON "membership_responses"("org_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_responses_term_id_user_id_key" ON "membership_responses"("term_id", "user_id");

-- AddForeignKey
ALTER TABLE "membership_forms" ADD CONSTRAINT "membership_forms_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_forms" ADD CONSTRAINT "membership_forms_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_questions" ADD CONSTRAINT "membership_questions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_questions" ADD CONSTRAINT "membership_questions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "membership_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_responses" ADD CONSTRAINT "membership_responses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_responses" ADD CONSTRAINT "membership_responses_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_responses" ADD CONSTRAINT "membership_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_responses" ADD CONSTRAINT "membership_responses_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_responses" ADD CONSTRAINT "membership_responses_matched_by_id_fkey" FOREIGN KEY ("matched_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "membership_questions"
  ADD CONSTRAINT "membership_questions_label_check" CHECK (char_length("label") BETWEEN 1 AND 300),
  ADD CONSTRAINT "membership_questions_position_check" CHECK ("position" >= 0);

ALTER TABLE "membership_responses"
  ADD CONSTRAINT "membership_responses_birth_check" CHECK (
    ("birth_day" IS NULL OR "birth_day" BETWEEN 1 AND 31)
    AND ("birth_month" IS NULL OR "birth_month" BETWEEN 1 AND 12)
    AND ("birth_year" IS NULL OR "birth_year" BETWEEN 1900 AND 2100)
  ),
  ADD CONSTRAINT "membership_responses_held_check" CHECK ("held_amount_cents" IS NULL OR "held_amount_cents" >= 0),
  ADD CONSTRAINT "membership_responses_name_check" CHECK (char_length("full_name") BETWEEN 1 AND 120);

-- Every existing term gets its form. A term already banked in has a closed
-- one; one somebody has already paid against was, in effect, open; the rest
-- wait for the exco to open them.
INSERT INTO "membership_forms" ("id", "org_id", "term_id", "state", "opened_at", "closed_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  t.org_id,
  t.id,
  CASE
    WHEN t.closed_at IS NOT NULL THEN 'CLOSED'::"FormState"
    WHEN EXISTS (SELECT 1 FROM fee_payments p WHERE p.term_id = t.id) THEN 'OPEN'::"FormState"
    ELSE 'DRAFT'::"FormState"
  END,
  CASE WHEN t.closed_at IS NOT NULL OR EXISTS (SELECT 1 FROM fee_payments p WHERE p.term_id = t.id) THEN now() END,
  t.closed_at,
  now()
FROM terms t
ON CONFLICT ("term_id") DO NOTHING;

-- ─── Who may read and write ─────────────────────────────────────────
-- The form and its questions are read by the club's members, because they
-- fill it in. Responses carry birthdays and answers, so the exco read all of
-- them and everybody else only their own.

ALTER TABLE "membership_forms" ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_forms_exco_all ON "membership_forms"
  FOR ALL TO authenticated
  USING (public.app_is_exco(org_id))
  WITH CHECK (public.app_is_exco(org_id));
CREATE POLICY membership_forms_member_read ON "membership_forms"
  FOR SELECT TO authenticated
  USING (public.app_is_member(org_id));

ALTER TABLE "membership_questions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_questions_exco_all ON "membership_questions"
  FOR ALL TO authenticated
  USING (public.app_is_exco(org_id))
  WITH CHECK (public.app_is_exco(org_id));
CREATE POLICY membership_questions_member_read ON "membership_questions"
  FOR SELECT TO authenticated
  USING (public.app_is_member(org_id));

ALTER TABLE "membership_responses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_responses_exco_all ON "membership_responses"
  FOR ALL TO authenticated
  USING (public.app_is_exco(org_id))
  WITH CHECK (public.app_is_exco(org_id));
CREATE POLICY membership_responses_own_read ON "membership_responses"
  FOR SELECT TO authenticated
  USING (user_id = public.app_user_id());
CREATE POLICY membership_responses_own_insert ON "membership_responses"
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.app_user_id() AND public.app_is_member(org_id));
CREATE POLICY membership_responses_own_update ON "membership_responses"
  FOR UPDATE TO authenticated
  USING (user_id = public.app_user_id())
  WITH CHECK (user_id = public.app_user_id() AND public.app_is_member(org_id));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "membership_forms", "membership_questions", "membership_responses" TO app_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "membership_forms", "membership_questions", "membership_responses" FROM anon, authenticated;
  END IF;
END
$$;

-- ─── What the policies cannot say ───────────────────────────────────

-- A form and its questions belong to one club and one term, and nothing about
-- a banked-in term changes.
CREATE OR REPLACE FUNCTION public.app_guard_membership_form()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  form_term text;
  form_org text;
BEGIN
  IF TG_TABLE_NAME = 'membership_forms' THEN
    form_term := CASE WHEN TG_OP = 'DELETE' THEN OLD.term_id ELSE NEW.term_id END;
    IF TG_OP = 'UPDATE' AND (NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.term_id IS DISTINCT FROM OLD.term_id) THEN
      RAISE EXCEPTION 'A form cannot be moved to another term or club'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_OP <> 'DELETE' AND NOT EXISTS (SELECT 1 FROM terms t WHERE t.id = NEW.term_id AND t.org_id = NEW.org_id) THEN
      RAISE EXCEPTION 'The term must belong to the same club as the form'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    SELECT f.term_id, f.org_id INTO form_term, form_org
    FROM membership_forms f
    WHERE f.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.form_id ELSE NEW.form_id END;
    IF TG_OP = 'UPDATE' AND (NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.form_id IS DISTINCT FROM OLD.form_id) THEN
      RAISE EXCEPTION 'A question cannot be moved to another form'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF TG_OP <> 'DELETE' AND form_org IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'The form must belong to the same club as the question'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF public.app_user_id() IS NOT NULL
     AND EXISTS (SELECT 1 FROM terms WHERE id = form_term AND closed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'That collection is closed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.app_guard_membership_form() FROM PUBLIC;

DROP TRIGGER IF EXISTS membership_forms_guard ON membership_forms;
CREATE TRIGGER membership_forms_guard
  BEFORE INSERT OR UPDATE OR DELETE ON membership_forms
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_membership_form();

DROP TRIGGER IF EXISTS membership_questions_guard ON membership_questions;
CREATE TRIGGER membership_questions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON membership_questions
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_membership_form();

-- A response is its sender's, while the form is open. What they cannot do is
-- say which roster row they are: a response reaches a row only by being sent
-- from the account already linked to it, or by an exco member matching it.
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

DROP TRIGGER IF EXISTS membership_responses_guard ON membership_responses;
CREATE TRIGGER membership_responses_guard
  BEFORE INSERT OR UPDATE ON membership_responses
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_membership_response();

-- Nobody deletes a response from a banked-in term either.
DROP TRIGGER IF EXISTS membership_responses_frozen_delete ON membership_responses;
CREATE TRIGGER membership_responses_frozen_delete
  BEFORE DELETE ON membership_responses
  FOR EACH ROW EXECUTE FUNCTION public.app_guard_fee_frozen();
