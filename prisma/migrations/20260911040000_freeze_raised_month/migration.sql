-- Freeze a raised month against everything that keeps moving underneath it.
--
-- Both monthly documents were rebuilt on every download from live class,
-- rate, roster and instructor rows. The guards stop a class in a raised month
-- being edited, but nothing stopped a rate being backdated, a member joining
-- the roster, or attendance being re-marked — and any of those silently
-- changes a document already sitting with the Office of Finance, while the
-- invoice row keeps the total it was issued with.
--
-- The invoice row is already the authority for the money. This adds the rest:
-- the date each line bills, and a snapshot of the month as it was raised.
--
-- No backfill: no invoice has been raised in this database yet.
ALTER TABLE "invoice_lines"
  ADD COLUMN "held_on" DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE "invoice_lines"
  ALTER COLUMN "held_on" DROP DEFAULT;

ALTER TABLE "attendance_sheets"
  ADD COLUMN "snapshot" JSONB;
