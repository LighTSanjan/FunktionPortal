-- The year somebody new expects to graduate, asked on the welcome screen.
-- It travels the way the birthday does: said on the account, carried on the
-- form response, and copied onto the roster row when an exco member adds
-- them as new.
ALTER TABLE "users" ADD COLUMN "graduation_year" INTEGER;
ALTER TABLE "membership_responses" ADD COLUMN "graduation_year" INTEGER;
ALTER TABLE "members" ADD COLUMN "graduation_year" INTEGER;

ALTER TABLE "users" ADD CONSTRAINT "users_graduation_year_valid"
  CHECK (graduation_year IS NULL OR graduation_year BETWEEN 2000 AND 2100);
ALTER TABLE "membership_responses" ADD CONSTRAINT "membership_responses_graduation_year_valid"
  CHECK (graduation_year IS NULL OR graduation_year BETWEEN 2000 AND 2100);
ALTER TABLE "members" ADD CONSTRAINT "members_graduation_year_valid"
  CHECK (graduation_year IS NULL OR graduation_year BETWEEN 2000 AND 2100);
