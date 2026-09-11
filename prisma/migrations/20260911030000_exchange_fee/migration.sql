-- What an exchange student pays for a term.
--
-- The tier existed in the enum with no rate behind it, so the amount had to
-- be guessed somewhere. Null keeps the guess — the half-term rate — but makes
-- it a stated default rather than a line of code nobody would find.
ALTER TABLE "terms"
  ADD COLUMN "exchange_fee_cents" INTEGER;
