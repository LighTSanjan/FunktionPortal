-- The PayNow QR belongs to a collection, not to the club.
--
-- It was one nullable URL on organisation_settings, which assumes the club
-- has one QR forever. It does not: a new QR is generated for each collection,
-- so a single stored value means the term after the first shows members last
-- term's code and their money goes somewhere nobody is reconciling.
--
-- Stored as an object key in the private bucket rather than a URL. The QR is
-- not a secret — every member has to see it — but it is org data, and a
-- public URL is a public URL forever, including after the collection closes.
ALTER TABLE "terms"
  ADD COLUMN "paynow_qr_path" TEXT,
  ADD COLUMN "paynow_qr_uploaded_at" TIMESTAMP(3);

ALTER TABLE "organisation_settings"
  DROP COLUMN IF EXISTS "paynow_qr_url";
