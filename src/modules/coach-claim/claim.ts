/** Assemble both monthly documents from one session list. */
import type {
  ClaimLine, InstructorDetails, InvoiceDocData, AttendanceSheetDocData,
  FundSource, SessionInput, RosterMember, SheetSession, Verification, Branding, BillTo,
} from './types'
import { sessionAmountCents } from './money'
import { instructorDocumentNo } from './invoice'
import { assertInvoiceable } from './instructor'
import { rateForDate, type RateSchedule } from './rates'
import { isoDate } from './theme'

export class NoBillableSessionsError extends Error {
  constructor(readonly instructorName: string, readonly periodYear: number, readonly periodMonth: number) {
    super(
      `${instructorName} taught no sessions in ${periodMonth}/${periodYear} — ` +
        'there is no invoice to raise. The attendance sheet still applies if the club met for self-practice.',
    )
    this.name = 'NoBillableSessionsError'
  }
}

export interface ClaimInput {
  instructor: InstructorDetails
  /** Short code for the issuer's document number: JIN, KS. */
  shortCode: string
  /** Every rate that has applied. The session date picks which one bills. */
  rates: RateSchedule[]
  periodYear: number
  periodMonth: number
  sessions: SessionInput[]
  roster: RosterMember[]
  fundSource: FundSource
  organisationName: string
  /** Logo, tagline and band colours, from organisation settings. */
  branding?: Branding
  /** Who the coach bills, from organisation settings. */
  billTo: BillTo
  /** Allocated from the FY counter before either document is built. */
  referenceNumber: string
  treasurerName: string
  /**
   * The date on the invoice. Defaults to the 15th of the following month,
   * which is the OSL deadline — but the real submissions are dated when they
   * were actually raised (the May 2026 one is dated 17 June), so this is an
   * override rather than a rule.
   */
  invoiceDate?: Date
  /** Zero unless the instructor is GST registered. */
  gstCents?: number
  clubFundBalanceCents?: number
  verification?: Verification
}

export interface Claim {
  /** Coach-led sessions only. Self-practice never reaches an invoice. */
  lines: ClaimLine[]
  /** Every session in the month, coach-led or not, in date order. */
  sessions: SheetSession[]
  totalMinutes: number
  subtotalCents: number
  gstCents: number
  totalCents: number
  invoiceDate: Date
  documentNo: string
  hasBillableSessions: boolean
}

/** The OSL deadline for the coach's documents: the 15th of the month after. */
export function invoiceDateFor(periodYear: number, periodMonth: number): Date {
  const year = periodMonth === 12 ? periodYear + 1 : periodYear
  const month = periodMonth === 12 ? 1 : periodMonth + 1
  return new Date(year, month - 1, 15)
}

export function buildClaim(input: ClaimInput): Claim {
  const outOfPeriod = input.sessions.filter(
    (s) => s.heldOn.getFullYear() !== input.periodYear || s.heldOn.getMonth() + 1 !== input.periodMonth,
  )
  if (outOfPeriod.length > 0) {
    // Billing a session in the wrong month puts the claim against the wrong
    // register row and, at the March boundary, the wrong financial year.
    throw new Error(
      `${outOfPeriod.length} session(s) fall outside ${input.periodMonth}/${input.periodYear}: ` +
        outOfPeriod.map((s) => isoDate(s.heldOn)).join(', '),
    )
  }

  const rosterIds = new Set(input.roster.map((m) => m.id))
  const sorted = [...input.sessions].sort((a, b) => a.heldOn.getTime() - b.heldOn.getTime())

  const sessions: SheetSession[] = sorted.map((s) => {
    const unknown = s.presentMemberIds.filter((id) => !rosterIds.has(id))
    if (unknown.length > 0) {
      throw new Error(
        `Session on ${isoDate(s.heldOn)} marks ${unknown.length} attendee(s) ` +
          `who are not on the roster: ${unknown.join(', ')}`,
      )
    }
    const present = new Set(s.presentMemberIds)
    return {
      heldOn: s.heldOn,
      durationMinutes: s.durationMinutes,
      instructorPresent: s.instructorPresent,
      presentMemberIds: present,
      presentCount: present.size,
    }
  })

  // Resolved per session, not per invoice: a month that straddles a rate
  // rise bills each side correctly without anyone having to notice.
  const lines: ClaimLine[] = sessions
    .filter((s) => s.instructorPresent)
    .map((s) => {
      const rate = rateForDate(input.rates, s.heldOn, input.instructor.fullName)
      return {
        heldOn: s.heldOn,
        durationMinutes: s.durationMinutes,
        hourlyRateCents: rate,
        amountCents: sessionAmountCents(s.durationMinutes, rate),
      }
    })

  const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0)
  const gstCents = input.gstCents ?? 0
  const invoiceDate = input.invoiceDate ?? invoiceDateFor(input.periodYear, input.periodMonth)

  return {
    lines,
    sessions,
    totalMinutes: lines.reduce((sum, l) => sum + l.durationMinutes, 0),
    subtotalCents,
    gstCents,
    totalCents: subtotalCents + gstCents,
    invoiceDate,
    documentNo: instructorDocumentNo(input.shortCode, invoiceDate),
    hasBillableSessions: lines.length > 0,
  }
}

/**
 * Throws when the coach taught nothing that month. A month with only
 * self-practice is a normal month, not an error — it produces an attendance
 * sheet and no invoice.
 */
export function toInvoiceData(input: ClaimInput, claim: Claim): InvoiceDocData {
  if (!claim.hasBillableSessions) {
    throw new NoBillableSessionsError(input.instructor.fullName, input.periodYear, input.periodMonth)
  }
  // Checked here rather than at the edge: every path to an invoice goes
  // through this function, and a guest's details are typed fresh on the day.
  assertInvoiceable(input.instructor)
  return {
    instructor: input.instructor,
    documentNo: claim.documentNo,
    referenceNumber: input.referenceNumber,
    invoiceDate: claim.invoiceDate,
    periodYear: input.periodYear,
    periodMonth: input.periodMonth,
    lines: claim.lines,
    subtotalCents: claim.subtotalCents,
    gstCents: claim.gstCents,
    totalCents: claim.totalCents,
    fundSource: input.fundSource,
    treasurerName: input.treasurerName,
    organisationName: input.organisationName,
    billTo: input.billTo,
  }
}

export function toAttendanceSheetData(input: ClaimInput, claim: Claim): AttendanceSheetDocData {
  return {
    instructor: input.instructor,
    organisationName: input.organisationName,
    periodYear: input.periodYear,
    periodMonth: input.periodMonth,
    roster: input.roster,
    sessions: claim.sessions,
    lines: claim.lines,
    billedSessionCount: claim.lines.length,
    claimTotalCents: claim.totalCents,
    fundSource: input.fundSource,
    referenceNumber: input.referenceNumber,
    clubFundBalanceCents: input.clubFundBalanceCents,
    branding: input.branding,
    verification: input.verification,
  }
}
