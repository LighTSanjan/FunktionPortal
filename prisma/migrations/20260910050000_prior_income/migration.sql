-- Money received into a fund before the portal existed.
--
-- The income fund is not a grant that only shrinks: subscriptions and
-- donations are paid into it during the year. FY2026 opened with the $2,620.44
-- carried forward from Income 2025 and had taken $1,669.72 more before any of
-- this was written, so a model with only an opening balance and a spend column
-- cannot express the $3,615.16 actually standing in it.
--
-- Additive, so safe against a live database.
ALTER TABLE "fund_accounts"
    ADD COLUMN IF NOT EXISTS "prior_income_cents" INTEGER NOT NULL DEFAULT 0;
