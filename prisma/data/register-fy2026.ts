/**
 * The FY2026 OSL Transaction Register, as data.
 *
 * Transcribed from "FY2026 Transaction Register Funktion" in the club's Drive
 * (spreadsheet 1RjpUF1tDvh2DJSS9e6L4LwlcNL1_7-h9IgKJPDF7OMU), which is the
 * authoritative copy — OSL read that sheet, not this file. Everything here is
 * checked against the register's own totals row on import, so a mistyped
 * figure fails the seed rather than quietly becoming the club's opening
 * position.
 *
 * Amounts are integer cents. `withoutGstCents` is left null where the register
 * itself leaves the cell blank — see the note on the seed-fund control totals.
 */

import type { RegisterRow } from './register-row'

export const SEED_FUND_ROWS: RegisterRow[] = [
  {
    reference: 'SLCLUB097',
    description: 'SEED Fund 2026',
    documentDate: null,
    payeeName: null,
    withoutGstCents: null,
    withGstCents: null,
    incomeCents: 260_000,
    submittedToOsl: null,
    bankedIn: null,
  },
  { reference: 'IV26-097-0006', description: 'Locking Instructor Fee April', documentDate: '2026-05-16', payeeName: 'Neo Renyi', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2026-05-16', bankedIn: null },
  { reference: 'IV26-097-0005', description: 'Popping Instructor Fee April', documentDate: '2026-05-16', payeeName: 'Lim Kah Sing', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2026-05-16', bankedIn: null },
  { reference: 'IV26-097-0007', description: 'Locking Instructor Fee May', documentDate: '2026-06-17', payeeName: 'Neo Renyi', withoutGstCents: 13_500, withGstCents: 13_500, incomeCents: null, submittedToOsl: '2026-06-17', bankedIn: null },
  { reference: 'IV26-097-0008', description: 'Popping Instructor Fee May', documentDate: '2026-06-17', payeeName: 'Lim Kah Sing', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2026-06-17', bankedIn: null },
  // The register gives the four below no reference number and leaves their
  // without-GST cell blank. The numbers came from the Office of Finance on
  // 3 Oct 2026, when it asked for the August invoices to be renumbered 0013
  // and 0014 because 0010 and 0011 were already taken by these. The blank
  // without-GST cells still matter: they are why the register's own Seed Fund
  // balance reads $1,520.00 instead of $305.00, since that formula subtracts
  // the without-GST column.
  { reference: 'IV26-097-0009', description: 'Locking Instructor Fee June', documentDate: '2026-08-17', payeeName: 'Neo Renyi', withoutGstCents: null, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2026-08-17', bankedIn: null, note: 'Reference number from the Office of Finance, not the register; without-GST cell blank in the register' },
  { reference: 'IV26-097-0010', description: 'Popping Instructor Fee June', documentDate: '2026-08-17', payeeName: 'Lim Kah Sing', withoutGstCents: null, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2026-08-17', bankedIn: null, note: 'Reference number from the Office of Finance, not the register; without-GST cell blank in the register' },
  { reference: 'IV26-097-0011', description: 'Locking Instructor Fee July', documentDate: '2026-08-17', payeeName: 'Neo Renyi', withoutGstCents: null, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2026-08-17', bankedIn: null, note: 'Reference number from the Office of Finance, not the register; without-GST cell blank in the register' },
  { reference: 'IV26-097-0012', description: 'Popping Instructor Fee July', documentDate: '2026-08-17', payeeName: 'Lim Kah Sing', withoutGstCents: null, withGstCents: 13_500, incomeCents: null, submittedToOsl: '2026-08-17', bankedIn: null, note: 'Reference number from the Office of Finance, not the register; without-GST cell blank in the register' },
]

export const INCOME_ROWS: RegisterRow[] = [
  {
    reference: null,
    description: 'Carried forward from Income 2025',
    documentDate: null,
    payeeName: null,
    withoutGstCents: null,
    withGstCents: null,
    incomeCents: 262_044,
    submittedToOsl: null,
    bankedIn: null,
    note: 'The register flags this as an unverified placeholder from OSL finance',
  },
  { reference: 'IV26-097-0003', description: 'Locking Instructor Fee March', documentDate: '2026-04-15', payeeName: 'Neo Renyi', withoutGstCents: 27_000, withGstCents: 27_000, incomeCents: null, submittedToOsl: '2026-04-15', bankedIn: null },
  { reference: 'IV26-097-0004', description: 'Popping Instructor Fee March', documentDate: '2026-04-15', payeeName: 'Lim Kah Sing', withoutGstCents: 40_500, withGstCents: 40_500, incomeCents: null, submittedToOsl: '2026-04-15', bankedIn: null },
  { reference: 'INC-26-097-0001', description: 'Club Funds Collection for Summer Term 2025', documentDate: '2026-06-27', payeeName: null, withoutGstCents: null, withGstCents: null, incomeCents: 166_972, submittedToOsl: null, bankedIn: '2026-06-27' },
]

export const DONATION_ROWS: RegisterRow[] = []

/**
 * The register's own totals row for each section. Asserted on import — these
 * are the numbers OSL will be looking at, and a transcription that does not
 * reproduce them is a transcription that is wrong.
 */
export const CONTROL_TOTALS = {
  SEED_FUND: { withoutGstCents: 108_000, withGstCents: 229_500, incomeCents: 260_000 },
  INCOME: { withoutGstCents: 67_500, withGstCents: 67_500, incomeCents: 429_016 },
  DONATION: { withoutGstCents: 0, withGstCents: 0, incomeCents: 0 },
} as const

/**
 * The sheet header's "Total Balance" figure, which this transcription does not
 * carry. FY2026 is the live year and its header is a formula over cells that
 * are still being filled in — including the four blank without-GST cells above,
 * which is why the seed balance it currently shows is wrong. Asserting a
 * moving number would make the test a liability rather than a check.
 */
export const CLOSING_BALANCE_CENTS: number | null = null
