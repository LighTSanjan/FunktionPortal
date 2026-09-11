-- Signing the monthly documents.

-- Where the completed pack is emailed. The portal fills the mail client's
-- To: field rather than sending anything itself, so this is a label as much
-- as an address — and it belongs to the university, not to the code.
ALTER TABLE "organisation_settings"
  ADD COLUMN "submission_email" TEXT;

-- The specimen that was stamped, recorded against the verification rather
-- than looked up fresh. Documents are rebuilt from their rows on every
-- download; without this, replacing a signature would silently restamp every
-- document already sent to the Office of Finance.
ALTER TABLE "attendance_sheets"
  ADD COLUMN "signature_image_path" TEXT;
