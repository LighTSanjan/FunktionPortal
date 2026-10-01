-- The welcome screen: what somebody not yet on the roster says about
-- themselves — new to the club or returning, and their birthday.
--
-- Claims, like claimed_student_id: nothing here links an account to a roster
-- row or grants a role. They decide which way the person is walked through
-- and are shown to the exco when they match the account by hand.
CREATE TYPE "JoiningAs" AS ENUM ('NEW', 'RETURNING');

ALTER TABLE "users"
  ADD COLUMN "joining_as"   "JoiningAs",
  ADD COLUMN "onboarded_at" TIMESTAMP(3),
  ADD COLUMN "birth_day"    INTEGER,
  ADD COLUMN "birth_month"  INTEGER,
  ADD COLUMN "birth_year"   INTEGER;

-- Day and month together, the year optional (the club sends birthday
-- messages and never needs it — readBirthday asks the same), and a date that
-- exists: 31 February is refused here as well as in the action, so a row can
-- always be copied onto the roster as is. 2000 stands in for a missing year
-- because it was a leap year, so 29 February stays allowed without one.
ALTER TABLE "users" ADD CONSTRAINT "users_birthday_valid" CHECK (
  (birth_day IS NULL AND birth_month IS NULL AND birth_year IS NULL)
  OR (
    birth_month BETWEEN 1 AND 12
    AND birth_day BETWEEN 1 AND 31
    AND (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100)
    AND make_date(coalesce(birth_year, 2000), birth_month, birth_day) IS NOT NULL
  )
);
