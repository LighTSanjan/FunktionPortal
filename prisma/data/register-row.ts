/**
 * The shape of one row in an OSL Transaction Register.
 *
 * Shared by every financial year's transcription. Amounts are integer cents;
 * a null column means the register itself leaves that cell blank, which is
 * information — see the four un-numbered FY2026 coach rows, whose blank
 * without-GST cells are why that register's own balance is wrong.
 *
 * Deliberately absent: the register's Student ID column. Three claim rows
 * carry one, and a student's matriculation number is personal data belonging
 * to someone who did not agree to have it in a git repository. It is on the
 * claim form OSL already holds; it does not need to be here as well.
 */
export interface RegisterRow {
  /** Reference number as printed. Null where the register has none. */
  reference: string | null
  description: string
  /** Date of invoice or claim, ISO. Null for opening/carried-forward rows. */
  documentDate: string | null
  payeeName: string | null
  withoutGstCents: number | null
  withGstCents: number | null
  incomeCents: number | null
  submittedToOsl: string | null
  bankedIn: string | null
  note?: string
}

/** A section's own totals row, as printed at the foot of it. */
export interface SectionTotals {
  withoutGstCents: number
  withGstCents: number
  incomeCents: number
}

/** One financial year's register, as the sheet lays it out. */
export interface OslRegister {
  financialYear: number
  /** The Drive file the transcription came from. */
  sourceFileId: string
  seedFund: RegisterRow[]
  income: RegisterRow[]
  donation: RegisterRow[]
  controlTotals: {
    SEED_FUND: SectionTotals
    INCOME: SectionTotals
    DONATION: SectionTotals
  }
  /**
   * The "Total Balance = OSL Seed Fund + Income + Donation" figure printed in
   * the sheet's header. Asserted against the rows, so a transcription that
   * reproduces every section total but lands the club somewhere else still
   * fails.
   */
  closingBalanceCents: number | null
}
