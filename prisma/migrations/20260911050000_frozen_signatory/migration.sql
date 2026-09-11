-- The signatory's name as printed, captured at the moment of signing.
--
-- Only the user id was stored, and rendering dereferenced that account's
-- current name. A name is editable by its owner — it has to be, because Google
-- hands over whatever the account happens to be called — so one edit on a
-- profile page would re-attribute every document already sitting with the
-- Office of Finance, specimen and office and all.
ALTER TABLE "attendance_sheets"
  ADD COLUMN "verified_by_name" TEXT;
