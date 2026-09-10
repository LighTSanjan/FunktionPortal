import 'server-only'

import type { Prisma } from '@prisma/client'
import { dbAs } from '@/core/db'
import { fromDateColumn } from '@/lib/date-only'
import { buildClaim, invoiceDateFor, type ClaimInput } from './claim'
import { toInstructorDetails, type InstructorRow } from './queries'
import { SUTD_BILL_TO, type FundSource } from './types'
import { missingForInvoice } from './queries'

/**
 * The month's coach claim, gathered in one place.
 *
 * Both documents and the status board read from this file, so the invoice
 * total on screen and the invoice total in the .docx come from one
 * calculation rather than two that agree by inspection.
 */

export type RunStatus = 'BLOCKED' | 'NO_SESSIONS' | 'READY' | 'GENERATED' | 'SUBMITTED' | 'PAID' | 'VOID'

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

/** Return every active coach and the state of their selected month. */
export async function getMonthlyRun(
  userId: string,
  orgId: string,
  periodYear: number,
  periodMonth: number
): Promise<MonthlyRun> {
  const { from, to } = periodRange(periodYear, periodMonth)

  return dbAs(userId, async (tx) => {
    const instructors = await tx.instructor.findMany({
      where: { orgId, isActive: true },
      orderBy: { fullName: 'asc' },
      include: { rates: { orderBy: { effectiveFrom: 'asc' } } },
    })

    const sessions = await tx.classSession.findMany({
      where: { orgId, heldOn: { gte: from, lt: to } },
      orderBy: { heldOn: 'asc' },
    })

    const invoices = await tx.invoice.findMany({
      where: { orgId, periodYear, periodMonth },
      include: { referenceNumber: { select: { formatted: true } } },
    })

    const rosterSize = await tx.member.count({ where: { orgId, isActive: true } })

    const entries: RunEntry[] = instructors.map((instructor) => {
      const mine = sessions.filter((s) => s.instructorId === instructor.id)
      const invoice = invoices.find((i) => i.instructorId === instructor.id)

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
        status =
          invoice.status === 'VOID'
            ? 'VOID'
            : invoice.status === 'PAID'
              ? 'PAID'
              : invoice.submittedToOslAt
                ? 'SUBMITTED'
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
    bankAccountNo: instructor.bankAccountNo,
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
  const sessions = await tx.classSession.findMany({
    where: { orgId: args.orgId, instructorId: instructor.id, heldOn: { gte: from, lt: to } },
    orderBy: { heldOn: 'asc' },
    include: { attendance: { where: { present: true }, select: { memberId: true } } },
  })

  const members = await tx.member.findMany({
    where: { orgId: args.orgId, isActive: true },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true },
  })

  const settings = await tx.organisationSettings.findUnique({
    where: { orgId: args.orgId },
    select: { tagline: true, brandBandColors: true, billToName: true, billToAddressLines: true },
  })

  const fund = await tx.fundAccount.findFirst({
    where: { orgId: args.orgId, source: args.fundSource },
    select: { openingBalanceCents: true },
  })

  const row = toRow(instructor)

  const input: ClaimInput = {
    instructor: toInstructorDetails(row),
    shortCode: instructor.shortCode,
    rates: row.rates,
    periodYear: args.periodYear,
    periodMonth: args.periodMonth,
    // instructorPresent is true for every recorded class: the portal only
    // models coach-led sessions today, because ClassSession requires an
    // instructor. Self-practice dates exist on the club's own sheets and will
    // need their own representation before they can appear here.
    sessions: sessions.map((s) => ({
      // heldOn is a `date` column; buildClaim reads local components off it
      // to check the session falls in the billed month.
      heldOn: fromDateColumn(s.heldOn),
      durationMinutes: s.durationMinutes,
      instructorPresent: true,
      presentMemberIds: s.attendance.map((a) => a.memberId),
    })),
    roster: members.map((m) => ({ id: m.id, fullName: m.fullName })),
    fundSource: args.fundSource,
    organisationName: args.orgName,
    branding: {
      tagline: settings?.tagline ?? undefined,
      bandColors: settings?.brandBandColors?.length ? settings.brandBandColors : undefined,
    },
    billTo:
      settings?.billToName && settings.billToAddressLines.length > 0
        ? { name: settings.billToName, addressLines: settings.billToAddressLines }
        : SUTD_BILL_TO,
    referenceNumber: args.referenceNumber,
    treasurerName: args.treasurerName,
    invoiceDate: args.invoiceDate ?? invoiceDateFor(args.periodYear, args.periodMonth),
    clubFundBalanceCents: fund?.openingBalanceCents,
  }

  const sessionIdByDate = new Map(
    sessions.map((s) => [localDateKey(fromDateColumn(s.heldOn)), s.id])
  )

  return { input, instructorRow: row, sessionIdByDate }
}

/** `2026-08-13` from a local-midnight date — the key lines are matched on. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

export { buildClaim }
