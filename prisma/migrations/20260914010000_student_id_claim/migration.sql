-- An account saying which roster row it is, by student ID.
--
-- Student IDs are the right key: every member has one, it never changes, and
-- the attendance import already matches on it first. They are not a secret —
-- they are printed on every attendance sheet and run sequentially — so a claim
-- links nobody by itself. It is shown to the exco, already matched to the
-- roster row carrying that ID, and a person confirms it.
--
-- Stored on the user rather than as a link table: an account makes at most one
-- claim at a time, and a claim is replaced, not accumulated.
ALTER TABLE "users"
  ADD COLUMN "claimed_student_id" TEXT,
  ADD COLUMN "claimed_student_id_at" TIMESTAMP(3);

CREATE INDEX "users_claimed_student_id_idx" ON "users" ("claimed_student_id");
