-- Who at the Office of Student Life the month's coach payments go to. The
-- address was already here as submission_email; the name is what the email
-- is addressed to, and it changes when OSL reassigns the club.
ALTER TABLE "organisation_settings" ADD COLUMN "osl_contact_name" TEXT;
