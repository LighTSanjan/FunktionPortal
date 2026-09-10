/**
 * The FY2024 OSL Transaction Register, as data.
 *
 * Transcribed from "FY2024 Transaction Register FUNKtion_OSL" in the club's
 * Drive (spreadsheet 17P6qbgIUxPSZkarLoHy6bLPYMLxg0vRb), which is the
 * authoritative copy. Every figure here is checked against the register's own
 * totals row and header balance by the tests beside it.
 *
 * The year the club ran two coaches on a standing weekday and paid them out of
 * whichever fund still had room — see IV24-097-0010, which is one invoice
 * split across both sections because the seed fund ran out $350 short.
 */
import type { RegisterRow } from './register-row'

export const SEED_FUND_ROWS: RegisterRow[] = [
  { reference: 'SLCLUB097', description: 'SEED Fund 2023', documentDate: null, payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 235_000, submittedToOsl: null, bankedIn: '2024-05-06' },
  { reference: 'IV24-097-0003', description: 'Popping Instructor Fee April', documentDate: '2024-05-15', payeeName: 'Lim Kah Sing', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2024-05-17', bankedIn: null },
  { reference: 'IV24-097-0004', description: 'Locking Instructor Fee April', documentDate: '2024-05-15', payeeName: 'Neo Renyi', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2024-05-17', bankedIn: null },
  { reference: 'IV24-097-0005', description: 'Popping Instructor Fee May', documentDate: '2024-06-15', payeeName: 'Lim Kah Sing', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2024-06-18', bankedIn: null },
  { reference: 'IV24-097-0006', description: 'Locking Instructor Fee May', documentDate: '2024-06-15', payeeName: 'Neo Renyi', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2024-06-18', bankedIn: null },
  { reference: 'IV24-097-0007', description: 'Popping Instructor Fee June', documentDate: '2024-07-15', payeeName: 'Lim Kah Sing', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2024-07-17', bankedIn: null },
  { reference: 'IV24-097-0008', description: 'Locking Instructor Fee June', documentDate: '2024-07-15', payeeName: 'Neo Renyi', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2024-07-17', bankedIn: null },
  // The register labels this one June as well, a month after the June pair and
  // in the slot July would occupy. Left as printed: the reference number and
  // the invoice date are what OSL matched the payment against, and a
  // description corrected here would stop agreeing with the document they hold.
  { reference: 'IV24-097-0009', description: 'Popping Instructor Fee June', documentDate: '2024-08-15', payeeName: 'Lim Kah Sing', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2024-08-18', bankedIn: null, note: 'Labelled June in the register but dated a month after the June pair; the July slot is otherwise empty' },
  { reference: 'IV24-097-0010', description: 'Locking Instructor Fee July (Part 1)', documentDate: '2024-08-15', payeeName: 'Neo Renyi', withoutGstCents: 5_500, withGstCents: 5_500, incomeCents: null, submittedToOsl: '2024-08-18', bankedIn: null, note: 'Other half paid from the income fund — the seed fund had $55.00 left' },
]

export const INCOME_ROWS: RegisterRow[] = [
  { reference: null, description: 'Carried forward from Income 2023', documentDate: null, payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 227_562, submittedToOsl: null, bankedIn: '2024-05-06' },
  { reference: 'IV24-097-0001', description: 'Popping Instructor Fee March', documentDate: '2024-04-15', payeeName: 'Lim Kah Sing', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2024-04-19', bankedIn: null },
  { reference: 'IV24-097-0002', description: 'Locking Instructor Fee March', documentDate: '2024-04-15', payeeName: 'Neo Renyi', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2024-04-19', bankedIn: null },
  { reference: 'INC24-097-0001', description: 'Club Funds Collection for Summer Term 2024', documentDate: null, payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 137_614, submittedToOsl: null, bankedIn: '2024-06-23', note: 'Collected $1,500.00; banked in net of GST' },
  { reference: 'IV24-097-0010', description: 'Locking Instructor Fee July (Part 2)', documentDate: '2024-08-15', payeeName: 'Neo Renyi', withoutGstCents: 35_000, withGstCents: 35_000, incomeCents: null, submittedToOsl: '2024-08-18', bankedIn: null, note: 'Same invoice as the $55.00 seed-fund row; one reference number spans both sections' },
  { reference: 'IV24-097-0011', description: 'Popping Instructor Fee August', documentDate: '2024-09-15', payeeName: 'Lim Kah Sing', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2024-09-18', bankedIn: null },
  { reference: 'IV24-097-0012', description: 'Locking Instructor Fee August', documentDate: '2024-09-15', payeeName: 'Neo Renyi', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2024-09-18', bankedIn: null },
  { reference: 'IV24-097-0013', description: 'Popping Instructor Fee September', documentDate: '2024-10-15', payeeName: 'Lim Kah Sing', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2024-10-18', bankedIn: null },
  { reference: 'IV24-097-0014', description: 'Locking Instructor Fee September', documentDate: '2024-10-15', payeeName: 'Neo Renyi', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2024-10-18', bankedIn: null },
  { reference: 'INC24-097-0002', description: 'Club Funds Collection for Fall Term 2024', documentDate: null, payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 244_954, submittedToOsl: null, bankedIn: null, note: 'Collected $2,670.00; the bank-in date cell is blank' },
  { reference: 'SCF24-097-0001', description: 'SOS Stickers 2024', documentDate: '2024-11-06', payeeName: 'Malavika Ramesh', withoutGstCents: 4_776, withGstCents: 4_776, incomeCents: null, submittedToOsl: null, bankedIn: null, note: 'Claim made in early August, money received 6 November 2024, register updated 20 November' },
  { reference: 'IV24-097-0015', description: 'Popping Instructor Fee October', documentDate: '2024-11-15', payeeName: 'Lim Kah Sing', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2024-11-19', bankedIn: null },
  { reference: 'IV24-097-0016', description: 'Locking Instructor Fee October', documentDate: '2024-11-15', payeeName: 'Neo Renyi', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2024-11-19', bankedIn: null },
  { reference: 'IV24-097-0017', description: 'Popping Instructor Fee November', documentDate: '2024-12-15', payeeName: 'Lim Kah Sing', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2024-12-19', bankedIn: null },
  { reference: 'IV24-097-0018', description: 'Locking Instructor Fee November', documentDate: '2024-12-15', payeeName: 'Neo Renyi', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2024-12-19', bankedIn: null },
  { reference: 'IV24-097-0019', description: 'Popping Instructor Fee December', documentDate: '2025-01-15', payeeName: 'Lim Kah Sing', withoutGstCents: 13_500, withGstCents: 13_500, incomeCents: null, submittedToOsl: '2025-01-18', bankedIn: null },
  { reference: 'IV24-097-0020', description: 'Locking Instructor Fee December', documentDate: '2025-01-15', payeeName: 'Neo Renyi', withoutGstCents: 13_500, withGstCents: 13_500, incomeCents: null, submittedToOsl: '2025-01-18', bankedIn: null },
  // The register puts 18-Feb-24 against both of these — a year before the
  // invoice they answer. Corrected to 2025 rather than transcribed as printed,
  // because a submission date that precedes its own invoice by eleven months
  // is not a fact about the club, it is a slip of the keyboard.
  { reference: 'IV24-097-0021', description: 'Popping Instructor Fee January', documentDate: '2025-02-14', payeeName: 'Lim Kah Sing', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2025-02-18', bankedIn: null, note: 'Register reads 18-Feb-24 for the submission; read as 2025' },
  { reference: 'IV24-097-0022', description: 'Locking Instructor Fee January', documentDate: '2025-02-13', payeeName: 'Neo Renyi', withoutGstCents: 54_000, withGstCents: 54_000, incomeCents: null, submittedToOsl: '2025-02-18', bankedIn: null, note: 'Register reads 18-Feb-24 for the submission; read as 2025' },
  { reference: 'INC24-097-0003', description: "Winter Camp 2025 Non-Members' Fee", documentDate: null, payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 5_505, submittedToOsl: null, bankedIn: '2025-02-08', note: 'Collected $60.00' },
  { reference: 'SCF24-097-0002', description: 'OH Costumes', documentDate: '2025-02-25', payeeName: 'Sean Leng', withoutGstCents: 16_883, withGstCents: 16_883, incomeCents: null, submittedToOsl: null, bankedIn: null, note: 'Requested 24 January 2025, claim submitted 25 February 2025' },
  // A zero-value invoice, kept because the reference number was issued: the
  // coach taught the Open House class and waived the fee, and a gap in the IV
  // series is something OSL asks about.
  { reference: 'IV24-097-0023', description: 'Locking Instructor Fee February (Open House)', documentDate: '2025-02-22', payeeName: 'Neo Renyi', withoutGstCents: 0, withGstCents: 0, incomeCents: null, submittedToOsl: '2025-02-26', bankedIn: null, note: 'Issued at zero — the class was taught unpaid' },
  { reference: 'INC24-097-0004', description: 'Club Funds Collection for Spring Term 2025', documentDate: null, payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 183_303, submittedToOsl: null, bankedIn: '2025-02-26', note: 'Collected $1,998.00' },
  { reference: 'IV24-097-0025', description: 'Popping Instructor Fee February', documentDate: '2025-03-14', payeeName: 'Lim Kah Sing', withoutGstCents: 72_000, withGstCents: 72_000, incomeCents: null, submittedToOsl: '2025-03-17', bankedIn: null },
  { reference: 'IV24-097-0026', description: 'Locking Instructor Fee February', documentDate: '2025-03-14', payeeName: 'Neo Renyi', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2025-03-17', bankedIn: null },
]

/** The club has never recorded a donation. The section exists; it is empty. */
export const DONATION_ROWS: RegisterRow[] = []

export const CONTROL_TOTALS = {
  SEED_FUND: { withoutGstCents: 235_000, withGstCents: 235_000, incomeCents: 235_000 },
  INCOME: { withoutGstCents: 614_659, withGstCents: 614_659, incomeCents: 798_938 },
  DONATION: { withoutGstCents: 0, withGstCents: 0, incomeCents: 0 },
} as const

/** "Total Balance = OSL Seed Fund + Income + Donation" from the sheet header. */
export const CLOSING_BALANCE_CENTS = 184_279

/**
 * IV24-097-0024 appears nowhere in the register.
 *
 * Recorded rather than quietly skipped: a missing number in a running series
 * is exactly what OSL queries, and the answer is either a voided document or a
 * row that never got written down. Nobody currently knows which.
 */
export const UNACCOUNTED_REFERENCES = ['IV24-097-0024'] as const
