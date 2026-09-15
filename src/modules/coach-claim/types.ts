/** Data shared by the monthly invoice and attendance document. */
import type { ImageFormat } from './image-size'

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
 * A signature specimen, loaded ready to stamp onto a document.
 *
 * Passed as bytes rather than as a storage key so that the document builders
 * hold no credentials and no knowledge of where signatures live — and so the
 * only way to get one into a document is for the caller to have already
 * fetched it, which is the step authorisation is checked at.
 */
export interface SignatureImage {
  data: Buffer
  format: ImageFormat
}

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
  /**
   * Stamped on the rule when present; the rule is left blank when it is not,
   * so an unsigned sheet still prints for a wet signature. A stamp is applied
   * in the same request as the act that authorises it and never on anybody
   * else's behalf.
   */
  signatureImage?: SignatureImage
}

export const DEFAULT_VERIFYING_OFFICE = 'Treasurer'

/**
 * Everything that identifies the club on a document. None of it is written
 * into this module: it is read from organisation settings and passed in, so
 * a rebrand, a new logo, or a handover to a committee that words things
 * differently is a row in the database rather than a pull request.
 */
/** A logo image, read from storage, with what it takes to place it. */
export interface BrandLogo {
  bytes: Buffer
  format: 'png' | 'jpg'
  width: number
  height: number
}

export interface Branding {
  /** Standfirst under the sheet's title. */
  tagline?: string
  /**
   * Storage key of the logo the month was raised under. Kept in the snapshot,
   * so a later logo does not change a document already sent.
   */
  logoKey?: string
  /** That logo, loaded at render. Omitted renders the club name. */
  logo?: BrandLogo
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
  /**
   * The club's countersignature block.
   *
   * Only the club's own endorsement is ever stamped here. The coach's
   * signature belongs to the coach — the invoice is their document, billed to
   * the university in their name, and a club stamping it would forge the one
   * attestation the Office of Finance is relying on.
   */
  endorsement?: {
    office?: string
    signedOn?: Date
    signatureImage?: SignatureImage
  }
  organisationName: string
  /**
   * The institution the club sits under, in its short form ("SUTD"), printed
   * beside the club name. Optional because it is settings-derived: another
   * student organisation running this portal is under some other letterhead,
   * and a university that renames itself should not be a deployment.
   */
  institutionShortName?: string
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
