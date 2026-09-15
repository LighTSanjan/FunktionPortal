import 'server-only'
import { openOptional } from '@/core/crypto/fields'

import type { Prisma, FundSource as PrismaFundSource } from '@prisma/client'
import { dbAs } from '@/core/db'
import { fromDateColumn } from '@/lib/date-only'
import { buildClaim, invoiceDateFor, type ClaimInput } from './claim'
import { toInstructorDetails, type InstructorRow } from './queries'
import { SUTD_BILL_TO, type FundSource } from './types'
import { missingForInvoice } from './queries'
import { fundBalance } from '@/modules/funds/balance'
import { financialYearOf } from '@/modules/references/format'

/**
 * The month's coach claim, gathered in one place.
 *
 * Both documents and the status board read from this file, so the invoice
 * total on screen and the invoice total in the .docx come from one
 * calculation rather than two that agree by inspection.
 */

export type RunStatus =
  | 'BLOCKED'
  | 'NO_SESSIONS'
  | 'READY'
  | 'GENERATED'
  | 'SIGNED'
  | 'SUBMITTED'
  | 'PAID'
  | 'VOID'

export interface RunEntry {
  instructorId: string
  fullName: string
  shortCode: string
  danceStyle: string
  status: RunStatus
  /** Why it cannot be generated — empty unless status is BLOCKED. */
  blockers: string[]
  sessionCount: number
  totalMinutes: number
  subtotalCents: number
  /** Present once generated — the key the download routes are addressed by. */
  invoiceId: string | null
  referenceNumber: string | null
  documentNo: string | null
  invoiceDate: Date | null
  fundSource: FundSource | null
  submittedToOslAt: Date | null
  submissionDueAt: Date | null
  /** False for a coach who has stopped, shown only for a month they have in. */
  isActive: boolean
  /** Documents raised for this month and voided, oldest first. */
  voided: { invoiceId: string; referenceNumber: string | null; reason: string | null; voidedAt: Date | null }[]
}

export interface MonthlyRun {
  periodYear: number
  periodMonth: number
  entries: RunEntry[]
  rosterSize: number
}

/** The window a month's sessions fall in, in UTC to match the DATE column. */
export function periodRange(periodYear: number, periodMonth: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(periodYear, periodMonth - 1, 1)),
    to: new Date(Date.UTC(periodYear, periodMonth, 1)),
  }
}

/**
 * Every coach with something in the selected month, and the state of it.
 *
 * Active coaches, plus anybody no longer active who taught that month or has
 * a document for it. A coach who stopped in June still has May to be paid
 * for, and filtering on "active" hid both the classes and the unpaid invoice.
 */
export async function getMonthlyRun(
  userId: string,
  orgId: string,
  periodYear: number,
  periodMonth: number
): Promise<MonthlyRun> {
  const { from, to } = periodRange(periodYear, periodMonth)

  return dbAs(userId, async (tx) => {
    const sessions = await tx.classSession.findMany({
      where: { orgId, heldOn: { gte: from, lt: to } },
      orderBy: { heldOn: 'asc' },
    })

    const invoices = await tx.invoice.findMany({
      where: { orgId, periodYear, periodMonth },
      orderBy: { generatedAt: 'asc' },
      include: { referenceNumber: { select: { formatted: true, voidReason: true } } },
    })

    const involved = [
      ...sessions.map((s) => s.instructorId).filter((id): id is string => id !== null),
      ...invoices.map((i) => i.instructorId),
    ]
    const instructors = await tx.instructor.findMany({
      where: { orgId, OR: [{ isActive: true }, { id: { in: involved } }] },
      orderBy: { fullName: 'asc' },
      include: { rates: { orderBy: { effectiveFrom: 'asc' } } },
    })

    const rosterSize = await tx.member.count({ where: { orgId, isActive: true } })

    const entries: RunEntry[] = instructors.map((instructor) => {
      const mine = sessions.filter((s) => s.instructorId === instructor.id)
      // The live document, if any. Voided ones are history: the month can be
      // raised again, and they are listed so the spent numbers are explained.
      const invoice = invoices.find((i) => i.instructorId === instructor.id && i.status !== 'VOID')
      const voided = invoices
        .filter((i) => i.instructorId === instructor.id && i.status === 'VOID')
        .map((i) => ({
          invoiceId: i.id,
          referenceNumber: i.referenceNumber?.formatted ?? null,
          reason: i.referenceNumber?.voidReason ?? null,
          voidedAt: i.voidedAt,
        }))

      const row = toRow(instructor)
      const blockers = missingForInvoice(row)

      // A rate that does not cover a session date blocks just as hard as a
      // missing rate does, and it is the failure that actually happens: a
      // coach added in September with a rate effective from September, then
      // asked to bill August.
      const uncovered = mine.filter((s) => !coveredBy(row, s.heldOn))
      if (uncovered.length > 0 && !blockers.includes('rate')) {
        blockers.push(
          `rate covering ${uncovered[0].heldOn.toISOString().slice(0, 10)}`
        )
      }

      const totalMinutes = mine.reduce((sum, s) => sum + s.durationMinutes, 0)
      const subtotalCents = uncovered.length === 0
        ? mine.reduce((sum, s) => sum + amountFor(row, s), 0)
        : 0

      let status: RunStatus
      if (invoice) {
        // Submitted beats signed: the pack has left the building either way,
        // and the deadline the card counts down is the submission one.
        status =
          invoice.status === 'VOID'
            ? 'VOID'
            : invoice.status === 'PAID'
              ? 'PAID'
              : invoice.submittedToOslAt
                ? 'SUBMITTED'
                : invoice.status === 'SIGNED'
                  ? 'SIGNED'
                  : 'GENERATED'
      } else if (mine.length === 0) {
        status = 'NO_SESSIONS'
      } else if (blockers.length > 0) {
        status = 'BLOCKED'
      } else {
        status = 'READY'
      }

      return {
        instructorId: instructor.id,
        fullName: instructor.fullName,
        shortCode: instructor.shortCode,
        danceStyle: instructor.danceStyle,
        status,
        blockers: status === 'BLOCKED' ? blockers : [],
        sessionCount: mine.length,
        totalMinutes,
        subtotalCents: invoice ? invoice.totalCents : subtotalCents,
        invoiceId: invoice?.id ?? null,
        referenceNumber: invoice?.referenceNumber?.formatted ?? null,
        documentNo: invoice?.documentNo ?? null,
        invoiceDate: invoice ? fromDateColumn(invoice.invoiceDate) : null,
        fundSource: (invoice?.fundSource as FundSource | undefined) ?? null,
        submittedToOslAt: invoice?.submittedToOslAt ?? null,
        submissionDueAt: invoice?.submissionDueAt ?? null,
        isActive: instructor.isActive,
        voided,
      }
    })

    return { periodYear, periodMonth, entries, rosterSize }
  })
}

type InstructorWithRates = Prisma.InstructorGetPayload<{ include: { rates: true } }>

function toRow(instructor: InstructorWithRates): InstructorRow {
  return {
    id: instructor.id,
    fullName: instructor.fullName,
    shortCode: instructor.shortCode,
    danceStyle: instructor.danceStyle,
    email: instructor.email,
    phone: instructor.phone,
    addressLine1: instructor.addressLine1,
    addressLine2: instructor.addressLine2,
    postalCode: instructor.postalCode,
    bankName: instructor.bankName,
    bankAccountNo: openOptional(instructor.bankAccountNo),
    engagement: instructor.engagement,
    contractRef: instructor.contractRef,
    isActive: instructor.isActive,
    signatureImagePath: instructor.signatureImagePath,
    rates: instructor.rates.map((rate) => ({
      hourlyRateCents: rate.hourlyRateCents,
      effectiveFrom: rate.effectiveFrom,
      note: rate.note ?? undefined,
    })),
  }
}

function coveredBy(row: InstructorRow, on: Date): boolean {
  return row.rates.some((rate) => rate.effectiveFrom.getTime() <= on.getTime())
}

function amountFor(row: InstructorRow, session: { heldOn: Date; durationMinutes: number }): number {
  const rate = [...row.rates]
    .filter((r) => r.effectiveFrom.getTime() <= session.heldOn.getTime())
    .pop()
  if (!rate) return 0
  return Math.round((session.durationMinutes * rate.hourlyRateCents) / 60)
}

export interface ClaimContext {
  input: ClaimInput
  instructorRow: InstructorRow
  /** Source sessions keyed by local date for invoice-line provenance. */
  sessionIdByDate: Map<string, string>
}

/** Build the same fixed claim context for generation and later downloads. */
export async function buildClaimContext(
  tx: Prisma.TransactionClient,
  args: {
    orgId: string
    orgName: string
    instructorId: string
    periodYear: number
    periodMonth: number
    fundSource: FundSource
    referenceNumber: string
    treasurerName: string
    invoiceDate?: Date
  }
): Promise<ClaimContext | null> {
  const instructor = await tx.instructor.findFirst({
    where: { id: args.instructorId, orgId: args.orgId },
    include: { rates: { orderBy: { effectiveFrom: 'asc' } } },
  })
  if (!instructor) return null

  const { from, to } = periodRange(args.periodYear, args.periodMonth)
  // This coach's classes and the month's self-practice dates, in one list.
  //
  // A self-practice date belongs on the sheet: the club met, the attendance
  // counts, and the coach row reading NO is what tells OSL why the invoice
  // bills fewer dates than the grid shows. It reaches no invoice line, because
  // the claim is built from instructorPresent alone.
  const sessions = await tx.classSession.findMany({
    where: {
      orgId: args.orgId,
      OR: [{ instructorId: instructor.id }, { instructorId: null }],
      heldOn: { gte: from, lt: to },
    },
    orderBy: { heldOn: 'asc' },
    include: { attendance: { where: { present: true }, select: { memberId: true } } },
  })

  // Everybody on the roster now, and everybody who came that month even if
  // they have left since. A sheet for March raised in May is a record of
  // March: somebody who graduated in April was still in the room, and leaving
  // them off made the attendance counts disagree with the names — which the
  // claim rightly refused to build.
  const attended = [...new Set(sessions.flatMap((s) => s.attendance.map((a) => a.memberId)))]
  const members = await tx.member.findMany({
    where: { orgId: args.orgId, OR: [{ isActive: true }, { id: { in: attended } }] },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true },
  })

  const settings = await tx.organisationSettings.findUnique({
    where: { orgId: args.orgId },
    select: { tagline: true, brandLogoUrl: true, brandBandColors: true, billToName: true, billToAddressLines: true },
  })

  const row = toRow(instructor)

  const input: ClaimInput = {
    instructor: toInstructorDetails(row),
    shortCode: instructor.shortCode,
    rates: row.rates,
    periodYear: args.periodYear,
    periodMonth: args.periodMonth,
    sessions: sessions.map((s) => ({
      // heldOn is a `date` column; buildClaim reads local components off it
      // to check the session falls in the billed month.
      heldOn: fromDateColumn(s.heldOn),
      durationMinutes: s.durationMinutes,
      instructorPresent: s.instructorId !== null,
      presentMemberIds: s.attendance.map((a) => a.memberId),
    })),
    roster: members.map((m) => ({ id: m.id, fullName: m.fullName })),
    fundSource: args.fundSource,
    organisationName: args.orgName,
    branding: {
      tagline: settings?.tagline ?? undefined,
      logoKey: settings?.brandLogoUrl ?? undefined,
      bandColors: settings?.brandBandColors?.length ? settings.brandBandColors : undefined,
    },
    billTo:
      settings?.billToName && settings.billToAddressLines.length > 0
        ? { name: settings.billToName, addressLines: settings.billToAddressLines }
        : SUTD_BILL_TO,
    referenceNumber: args.referenceNumber,
    treasurerName: args.treasurerName,
    invoiceDate: args.invoiceDate ?? invoiceDateFor(args.periodYear, args.periodMonth),
    // Filled in by the caller once the claim's own total is known: the sheet
    // prints what the fund has left after it. See clubFundBalanceAfter().
    clubFundBalanceCents: undefined,
  }

  // Coach-led only. This map links an invoice line back to the class it
  // bills, and a self-practice date sharing a day with a real class would
  // otherwise overwrite the entry and point the line at the wrong session.
  const sessionIdByDate = new Map(
    sessions
      .filter((s) => s.instructorId !== null)
      .map((s) => [localDateKey(fromDateColumn(s.heldOn)), s.id])
  )

  return { input, instructorRow: row, sessionIdByDate }
}

/**
 * What the fund has left once this claim is paid — the "Balance of Club Fund"
 * the attendance sheet prints.
 *
 * It printed the fund's opening balance, which on a sheet for August read as
 * though nothing had been spent since April. This is the balance the register
 * shows: every earlier claim and purchase this financial year taken off, and
 * this one too. The claim's own invoice is left out of the lookup and taken
 * off explicitly, so the figure is the same whether it is worked out before
 * the invoice exists (raising) or after (signing).
 */
export async function clubFundBalanceAfter(
  tx: Prisma.TransactionClient,
  args: {
    orgId: string
    invoiceDate: Date
    fundSource: PrismaFundSource
    claimCents: number
    invoiceId?: string
  }
): Promise<number | undefined> {
  const fund = await fundBalance(tx, args.orgId, financialYearOf(args.invoiceDate), args.fundSource, {
    excludeInvoiceId: args.invoiceId,
  })
  return fund ? fund.remainingCents - args.claimCents : undefined
}

/** `2026-08-13` from a local-midnight date — the key lines are matched on. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

export { buildClaim }
