-- The unofficial register as a section of the club's ledger.
--
-- OSL never see this section; it exists so the whole ledger lives in one place
-- and the unofficial balance is explicable from its own rows rather than
-- asserted as a single figure. Additive, so safe against a live database.
ALTER TYPE "RegisterSection" ADD VALUE IF NOT EXISTS 'UNOFFICIAL';
