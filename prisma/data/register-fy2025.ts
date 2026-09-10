/**
 * The FY2025 OSL Transaction Register, as data.
 *
 * Transcribed from "FY2025 Transaction Register" in the club's Drive
 * (spreadsheet 1GeYbXELgyzMbrhHQqHMfioPSyI3DJRoJ), which is the authoritative
 * copy. Every figure here is checked against the register's own totals row and
 * header balance by the tests beside it.
 *
 * The year the club started booking guest coaches for Winter Camp — four
 * one-off invoices at a flat $200 against the standing popping and locking
 * pair, which is the first time the register carries a name that is not one of
 * the two contracted instructors.
 */
import type { RegisterRow } from './register-row'

export const SEED_FUND_ROWS: RegisterRow[] = [
  { reference: 'SLCLUB097', description: 'SEED Fund 2025', documentDate: null, payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 280_000, submittedToOsl: null, bankedIn: '2025-05-09' },
  { reference: 'IV25-097-0004', description: 'Popping Instructor Fee April', documentDate: '2025-05-15', payeeName: 'Lim Kah Sing', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2025-05-15', bankedIn: null },
  { reference: 'IV25-097-0005', description: 'Locking Instructor Fee April', documentDate: '2025-05-15', payeeName: 'Neo Renyi', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2025-05-15', bankedIn: null },
  { reference: 'SCF25-097-0001', description: 'Bandanas for SMU Productions', documentDate: '2025-06-14', payeeName: 'Christian Philip Aguilar Violanda', withoutGstCents: 2_410, withGstCents: 2_410, incomeCents: null, submittedToOsl: '2025-06-14', bankedIn: null },
  { reference: 'IV25-097-0006', description: 'Popping Instructor Fee May', documentDate: '2025-06-15', payeeName: 'Lim Kah Sing', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2025-06-15', bankedIn: null },
  { reference: 'IV25-097-0007', description: 'Locking Instructor Fee May', documentDate: '2025-06-15', payeeName: 'Neo Renyi', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2025-06-15', bankedIn: null },
  { reference: 'IV25-097-0008', description: 'Popping Instructor Fee June', documentDate: '2025-07-15', payeeName: 'Lim Kah Sing', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2025-07-15', bankedIn: null },
  { reference: 'IV25-097-0009', description: 'Locking Instructor Fee June', documentDate: '2025-07-15', payeeName: 'Neo Renyi', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2025-07-15', bankedIn: null },
  { reference: 'IV25-097-0010', description: 'Popping Instructor Fee July', documentDate: '2025-08-15', payeeName: 'Lim Kah Sing', withoutGstCents: 54_000, withGstCents: 54_000, incomeCents: null, submittedToOsl: '2025-08-15', bankedIn: null },
  { reference: 'IV25-097-0011', description: 'Locking Instructor Fee July (Part 1)', documentDate: '2025-08-15', payeeName: 'Neo Renyi', withoutGstCents: 21_090, withGstCents: 21_090, incomeCents: null, submittedToOsl: '2025-08-15', bankedIn: null, note: 'Other half paid from the income fund — the seed fund had $210.90 left' },
]

export const INCOME_ROWS: RegisterRow[] = [
  // FY2024 closed at $1,842.79. This opens at $1,842.82. Three cents appear
  // out of nowhere at the year boundary; they are still in the balance today.
  { reference: null, description: 'Carried forward from Income 2024', documentDate: null, payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 184_282, submittedToOsl: null, bankedIn: null, note: 'FY2024 closed at $1,842.79 — three cents more arrive than left' },
  { reference: 'IV25-097-0001', description: 'Popping Instructor Fee March', documentDate: '2025-04-15', payeeName: 'Lim Kah Sing', withoutGstCents: 13_500, withGstCents: 13_500, incomeCents: null, submittedToOsl: '2025-04-15', bankedIn: null },
  { reference: 'IV25-097-0002', description: 'Locking Instructor Fee March', documentDate: '2025-04-15', payeeName: 'Neo Renyi', withoutGstCents: 13_500, withGstCents: 13_500, incomeCents: null, submittedToOsl: '2025-04-15', bankedIn: null },
  { reference: 'IV25-097-0003', description: 'House Instructor Fee February (Winter Camp)', documentDate: '2025-03-03', payeeName: 'Daniel Eishi Chua', withoutGstCents: 20_000, withGstCents: 20_000, incomeCents: null, submittedToOsl: '2025-03-17', bankedIn: null, note: 'A FY2024 class, carried into FY2025 because Ariba would not take the payment' },
  { reference: 'INC-25-097-0001', description: 'Club Funds Collection for Summer Term 2025', documentDate: '2025-06-23', payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 154_128, submittedToOsl: null, bankedIn: '2025-06-23', note: 'Collected $1,680.00; banked in net of GST' },
  { reference: 'IV25-097-0011', description: 'Locking Instructor Fee July (Part 2)', documentDate: '2025-08-15', payeeName: 'Neo Renyi', withoutGstCents: 19_410, withGstCents: 19_410, incomeCents: null, submittedToOsl: '2025-08-15', bankedIn: null, note: 'Same invoice as the $210.90 seed-fund row; one reference number spans both sections' },
  { reference: 'IV25-097-0012', description: 'Popping Instructor Fee August', documentDate: '2025-09-15', payeeName: 'Lim Kah Sing', withoutGstCents: 13_500, withGstCents: 13_500, incomeCents: null, submittedToOsl: '2025-09-15', bankedIn: null },
  { reference: 'IV25-097-0013', description: 'Locking Instructor Fee August', documentDate: '2025-09-15', payeeName: 'Neo Renyi', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2025-09-15', bankedIn: null },
  { reference: 'IV25-097-0014', description: 'Popping Instructor Fee September', documentDate: '2025-10-15', payeeName: 'Lim Kah Sing', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2025-10-15', bankedIn: null },
  { reference: 'IV25-097-0015', description: 'Locking Instructor Fee September', documentDate: '2025-10-15', payeeName: 'Neo Renyi', withoutGstCents: 13_500, withGstCents: 13_500, incomeCents: null, submittedToOsl: '2025-10-15', bankedIn: null },
  { reference: 'INC-25-097-0002', description: 'Club Funds Collection for Fall Term 2025', documentDate: '2025-10-23', payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 199_083, submittedToOsl: null, bankedIn: '2025-10-23', note: 'Collected $2,170.00; banked in net of GST' },
  { reference: 'IV25-097-0016', description: 'Popping Instructor Fee October', documentDate: '2025-11-15', payeeName: 'Lim Kah Sing', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2025-11-15', bankedIn: null },
  { reference: 'IV25-097-0017', description: 'Locking Instructor Fee October', documentDate: '2025-11-15', payeeName: 'Neo Renyi', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2025-11-15', bankedIn: null },
  { reference: 'IV25-097-0018', description: 'Popping Instructor Fee November', documentDate: '2025-12-15', payeeName: 'Lim Kah Sing', withoutGstCents: 13_500, withGstCents: 13_500, incomeCents: null, submittedToOsl: '2025-12-15', bankedIn: null },
  { reference: 'IV25-097-0019', description: 'Locking Instructor Fee November', documentDate: '2025-12-15', payeeName: 'Neo Renyi', withoutGstCents: 54_000, withGstCents: 54_000, incomeCents: null, submittedToOsl: '2025-12-15', bankedIn: null },
  { reference: 'IV25-097-0020', description: 'Popping Instructor Fee December', documentDate: '2026-01-15', payeeName: 'Lim Kah Sing', withoutGstCents: 13_500, withGstCents: 13_500, incomeCents: null, submittedToOsl: '2026-01-15', bankedIn: null },
  { reference: 'IV25-097-0021', description: 'Afro Instructor Fee January (Winter Camp)', documentDate: '2026-02-06', payeeName: 'Ruzaini Bin Mohamed Ismail', withoutGstCents: 20_000, withGstCents: 20_000, incomeCents: null, submittedToOsl: '2026-02-06', bankedIn: null },
  { reference: 'IV25-097-0022', description: 'Breaking Instructor Fee February (Winter Camp)', documentDate: '2026-02-06', payeeName: 'Wesley Ng Tian Rong', withoutGstCents: 20_000, withGstCents: 20_000, incomeCents: null, submittedToOsl: '2026-02-06', bankedIn: null },
  { reference: 'IV25-097-0023', description: 'Locking Instructor Fee January (Winter Camp)', documentDate: '2026-02-06', payeeName: 'Shanice Elizabeth Kwok', withoutGstCents: 20_000, withGstCents: 20_000, incomeCents: null, submittedToOsl: '2026-02-06', bankedIn: null },
  { reference: 'IV25-097-0024', description: 'Popping Instructor Fee January', documentDate: '2026-02-15', payeeName: 'Lim Kah Sing', withoutGstCents: 54_000, withGstCents: 54_000, incomeCents: null, submittedToOsl: null, bankedIn: null, note: 'Submission date cell blank' },
  { reference: 'IV25-097-0025', description: 'Locking Instructor Fee January', documentDate: '2026-02-15', payeeName: 'Neo Renyi', withoutGstCents: 54_000, withGstCents: 54_000, incomeCents: null, submittedToOsl: null, bankedIn: null, note: 'Submission date cell blank' },
  { reference: 'INC25-097-0003', description: 'Club Funds Collection for Spring Term 2026', documentDate: '2026-02-23', payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 237_615, submittedToOsl: null, bankedIn: '2026-02-23', note: 'Collected $2,590.00; banked in net of GST' },
  // Dated March 2026, so FY2025 by the OSL year, and filed in the FY2025
  // register accordingly. The FY2026 register picks the IV26 series up at 0003.
  { reference: 'IV26-097-0001', description: 'Locking Instructor Fee February', documentDate: '2026-03-15', payeeName: 'Neo Renyi', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2026-03-15', bankedIn: null },
  { reference: 'IV26-097-0002', description: 'Popping Instructor Fee February', documentDate: '2026-03-15', payeeName: 'Lim Kah Sing', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2026-03-15', bankedIn: null },
  // The register prints the reference for this one as "INC25-097-0003 4",
  // with 0003 already spent on the Spring Term collection four rows up. Read
  // as 0004, which is the only number that leaves the series intact.
  { reference: 'INC25-097-0004', description: 'Art Fiesta', documentDate: null, payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 18_349, submittedToOsl: null, bankedIn: null, note: 'Register prints the reference as "INC25-097-0003 4"; no bank-in date recorded' },
]

/** The club has never recorded a donation. The section exists; it is empty. */
export const DONATION_ROWS: RegisterRow[] = []

export const CONTROL_TOTALS = {
  SEED_FUND: { withoutGstCents: 280_000, withGstCents: 280_000, incomeCents: 280_000 },
  INCOME: { withoutGstCents: 531_410, withGstCents: 531_410, incomeCents: 793_457 },
  DONATION: { withoutGstCents: 0, withGstCents: 0, incomeCents: 0 },
} as const

/** "Total Balance = OSL Seed Fund + Income + Donation" from the sheet header. */
export const CLOSING_BALANCE_CENTS = 262_047
