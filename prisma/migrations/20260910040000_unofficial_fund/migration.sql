-- Unofficial funds, and spend that predates the portal.
--
-- Hand-written rather than generated: the migration role has no permission to
-- create the shadow database `prisma migrate dev` needs. Both changes are
-- additive, so this is safe to run against a live database.

-- The club holds money outside the OSL accounts. It is real money it can
-- spend, so it belongs beside the others on the dashboard, but no invoice may
-- be drawn on it — there is no WBS element to quote and nothing for OSL to
-- reimburse. The invoice action's own enum is SEED | INCOME, which is what
-- actually enforces that; this only makes the fund representable.
--
-- Postgres allows ALTER TYPE ... ADD VALUE inside a transaction from 12
-- onwards, but the new label cannot be USED until that transaction commits.
-- So nothing here inserts an UNOFFICIAL row; the balances are set separately.
ALTER TYPE "FundSource" ADD VALUE IF NOT EXISTS 'UNOFFICIAL';

-- What was already drawn against a fund before the portal existed. Without it
-- the dashboard reports the whole grant as still available: FY2026 opened with
-- $2,600.00 of seed fund, most of which went on coach fees months before any
-- of this was written, and none of those payments have invoice rows here.
ALTER TABLE "fund_accounts"
    ADD COLUMN IF NOT EXISTS "prior_spend_cents" INTEGER NOT NULL DEFAULT 0;
