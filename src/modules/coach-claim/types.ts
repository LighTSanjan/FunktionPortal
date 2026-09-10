/** Data shared by the monthly invoice and attendance document. */

export interface InstructorDetails {
  /** As it should print, stage name and all. */
  fullName: string
  addressLines: string[]
  phone?: string
  email?: string
  bankName: string
  bankAccountNo: string
  /** "Locking", "Popping" — used in the line description and the sheet header. */
  danceStyle: string
}

export interface RosterMember {
  id: string
  fullName: string
}

export interface SessionInput {
  heldOn: Date
  /**
   * Sessions are not a fixed length. 90 minutes is usual and 180 happens, so
   * this is per session and never inferred from a monthly average.
   */
  durationMinutes: number
  /** False means self-practice: it appears on the sheet and on no invoice. */
  instructorPresent: boolean
  /** Ids from the roster. Everyone else is a NO for that date. */
  presentMemberIds: string[]
}

export interface ClaimLine {
  heldOn: Date
  durationMinutes: number
  hourlyRateCents: number
  amountCents: number
}

/** Which fund the club intends to draw on. Prints on both documents. */
export type FundSource = 'SEED' | 'INCOME'

/**
 * The sheet is verified by the TREASURER, who is the officer that signs the
 * live submissions and the only one holding the fund balance the sheet
 * quotes. Office is still carried and printed so the document says which
 * post signed it, but it defaults rather than being asked for.
 */
export interface Verification {
  name: string
  office?: string
  studentId?: string
  signedOn?: Date
}

export const DEFAULT_VERIFYING_OFFICE = 'Treasurer'

/**
 * Everything that identifies the club on a document. None of it is written
 * into this module: it is read from organisation settings and passed in, so
 * a rebrand, a new logo, or a handover to a committee that words things
 * differently is a row in the database rather than a pull request.
 */
export interface Branding {
  /** Standfirst under the sheet's title. */
  tagline?: string
  /** Letterhead wordmark, already loaded. Omitted renders the club name. */
  logo?: Buffer
  /**
   * The banded rule under the masthead, one colour per band, as RRGGBB
   * without the hash. Any number of bands; empty draws no rule.
   */
  bandColors?: string[]
}

/** Who the coach bills. Read from settings — the address is not ours to hold. */
export interface BillTo {
  name: string
  addressLines: string[]
}


export interface InvoiceDocData {
  instructor: InstructorDetails
  /** The issuer's own document number, e.g. KS17062026. */
  documentNo: string
  /** The OSL reference, e.g. IV26-097-0008. Prints top right (§3.1.2). */
  referenceNumber: string
  invoiceDate: Date
  periodYear: number
  periodMonth: number
  lines: ClaimLine[]
  subtotalCents: number
  /** Zero unless the instructor is GST registered. No row is drawn at zero. */
  gstCents: number
  totalCents: number
  fundSource: FundSource
  /** Countersignature. The treasurer is not the payee. */
  treasurerName: string
  organisationName: string
  billTo: BillTo
}

export interface SheetSession {
  heldOn: Date
  durationMinutes: number
  instructorPresent: boolean
  presentMemberIds: Set<string>
  presentCount: number
}

export interface AttendanceSheetDocData {
  instructor: InstructorDetails
  organisationName: string
  periodYear: number
  periodMonth: number
  roster: RosterMember[]
  sessions: SheetSession[]
  /** The billed lines, carrying the rate each one actually charged. */
  lines: ClaimLine[]
  /** Coach-led sessions only. */
  billedSessionCount: number
  claimTotalCents: number
  fundSource: FundSource
  referenceNumber?: string
  /** Prints as "Balance of Club Fund" beneath the claim. */
  clubFundBalanceCents?: number
  branding?: Branding
  verification?: Verification
}

/**
 * Where the coach's invoice is billed. Seeded into organisation settings on
 * setup and passed in from there — it belongs to the university, changes
 * without asking us, and hardcoding it would mean a campus move is a
 * deployment.
 */
export const SUTD_BILL_TO: BillTo = {
  name: 'Singapore University of Technology and Design',
  addressLines: ['No. 8 Somapah Road, #01-301', 'Building 3, Level 1', 'Singapore 487372'],
}
