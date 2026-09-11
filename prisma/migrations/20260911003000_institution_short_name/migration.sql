-- The institution printed beside the club name on a coach's invoice.
--
-- Was the literal "SUTD" inside the document builder. It is a fact about the
-- deployment rather than about the code: another student organisation running
-- this portal sits under some other letterhead, and a university that renames
-- itself should not be a pull request.
ALTER TABLE "organisation_settings"
  ADD COLUMN "institution_short_name" TEXT;
