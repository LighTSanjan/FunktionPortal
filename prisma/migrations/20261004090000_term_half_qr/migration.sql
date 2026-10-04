-- A second, optional PayNow QR for the half-term rate.
--
-- The treasurer can fix the amount inside the QR, so a member scanning it
-- cannot mistype what they owe. One fixed-amount QR fits only one rate: the
-- full-term QR stays required, and the half-term one is shown instead to the
-- members who owe the half rate.
ALTER TABLE "terms"
  ADD COLUMN "paynow_half_qr_path" TEXT,
  ADD COLUMN "paynow_half_qr_uploaded_at" TIMESTAMP(3);
