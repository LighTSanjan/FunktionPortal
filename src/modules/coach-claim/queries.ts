import 'server-only'
import { openOptional } from '@/core/crypto/fields'

import type { Prisma } from '@prisma/client'
import { dbAs } from '@/core/db'
import type { InstructorDetails } from './types'
import { rateForDate, type RateSchedule } from './rates'

/** RLS-scoped reads and mappings for coach-claim screens. */

export interface InstructorRow {
  id: string
  fullName: string
  shortCode: string
  danceStyle: string
  email: string | null
  phone: string | null
  addressLine1: string | null
  addressLine2: string | null
  postalCode: string | null
  bankName: string | null
  bankAccountNo: string | null
  engagement: 'CONTRACTED' | 'GUEST'
  contractRef: string | null
  isActive: boolean
  signatureImagePath: string | null
  rates: RateSchedule[]
}

export async function listInstructors(userId: string, orgId: string): Promise<InstructorRow[]> {
  const rows = await dbAs(userId, (tx) => tx.instructor.findMany({
    where: { orgId },
    orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
    include: {
      // Ascending: resolveRate walks forward to the last row that starts on or
      // before the session date.
      rates: { orderBy: { effectiveFrom: 'asc' } },
    },
  }))

  return rows.map(toInstructorRow)
}

export async function getInstructor(
  userId: string,
  orgId: string,
  instructorId: string
): Promise<InstructorRow | null> {
  const row = await dbAs(userId, (tx) => tx.instructor.findFirst({
    // orgId in the WHERE, not just the id. An id is guessable enough that
    // scoping the read to the caller's organisation has to be structural.
    where: { id: instructorId, orgId },
    include: { rates: { orderBy: { effectiveFrom: 'asc' } } },
  }))

  return row ? toInstructorRow(row) : null
}

type InstructorWithRates = Prisma.InstructorGetPayload<{ include: { rates: true } }>

function toInstructorRow(row: InstructorWithRates): InstructorRow {
  return {
    id: row.id,
    fullName: row.fullName,
    shortCode: row.shortCode,
    danceStyle: row.danceStyle,
    email: row.email,
    phone: row.phone,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    postalCode: row.postalCode,
    bankName: row.bankName,
    bankAccountNo: openOptional(row.bankAccountNo),
    engagement: row.engagement,
    contractRef: row.contractRef,
    isActive: row.isActive,
    signatureImagePath: row.signatureImagePath,
    rates: row.rates.map((rate) => ({
      hourlyRateCents: rate.hourlyRateCents,
      effectiveFrom: rate.effectiveFrom,
      note: rate.note ?? undefined,
    })),
  }
}

export function toInstructorDetails(row: InstructorRow): InstructorDetails {
  return {
    fullName: row.fullName,
    addressLines: [row.addressLine1, row.addressLine2, row.postalCode]
      .map((line) => line?.trim())
      .filter((line): line is string => Boolean(line)),
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    // Empty string rather than undefined: assertInvoiceable() is what decides
    // whether a missing bank account blocks an invoice, and it should see a
    // blank field rather than a type error.
    bankName: row.bankName ?? '',
    bankAccountNo: row.bankAccountNo ?? '',
    danceStyle: row.danceStyle,
  }
}

/** Which required fields are still blank — for the list badge, not for the guard. */
export function missingForInvoice(row: InstructorRow): string[] {
  const missing: string[] = []
  if (!row.bankName?.trim()) missing.push('bank')
  if (!row.bankAccountNo?.trim()) missing.push('account number')
  if (row.rates.length === 0) missing.push('rate')
  return missing
}

// ─────────────────────────────────────────────
// Class sessions
// ─────────────────────────────────────────────

export interface SessionRow {
  id: string
  heldOn: Date
  durationMinutes: number
  notes: string | null
  /**
   * Null for self-practice — the club met, nobody was paid.
   *
   * Nested rather than three nullable columns so that a screen cannot render
   * a blank coach name by accident: there is nothing to read until the null
   * has been dealt with.
   */
  instructor: {
    id: string
    fullName: string
    shortCode: string
    /** Null when no rate covers the session date — see rateForDate. */
    rateCents: number | null
  } | null
  presentCount: number
  markedCount: number
  fromImport: boolean
}

/**
 * The month's classes, newest first.
 *
 * Bounded by date rather than paged. A month is the unit the whole coach
 * claim works in, and an unbounded list of every session the club has ever
 * run is not a thing anybody opens this screen to read.
 */
export async function listSessions(
  userId: string,
  orgId: string,
  range: { from: Date; to: Date }
): Promise<SessionRow[]> {
  const rows = await dbAs(userId, (tx) =>
    tx.classSession.findMany({
      where: { orgId, heldOn: { gte: range.from, lt: range.to } },
      orderBy: { heldOn: 'desc' },
      include: {
        instructor: {
          select: { id: true, fullName: true, shortCode: true, rates: { orderBy: { effectiveFrom: 'asc' } } },
        },
        attendance: { select: { present: true } },
      },
    })
  )

  return rows.map((row) => ({
    id: row.id,
    heldOn: row.heldOn,
    durationMinutes: row.durationMinutes,
    notes: row.notes,
    instructor: toInstructorSummary(row.instructor, row.heldOn),
    presentCount: row.attendance.filter((a) => a.present).length,
    markedCount: row.attendance.length,
    fromImport: row.importId !== null,
  }))
}

export interface SessionDetail extends SessionRow {
  roster: { memberId: string; fullName: string; studentId: string | null; present: boolean }[]
}

/** Return one session with the full active roster for attendance marking. */
export async function getSession(
  userId: string,
  orgId: string,
  sessionId: string
): Promise<SessionDetail | null> {
  return dbAs(userId, async (tx) => {
    const row = await tx.classSession.findFirst({
      // orgId in the WHERE, not just the id. An id is guessable enough that
      // scoping the read to the caller's organisation has to be structural.
      where: { id: sessionId, orgId },
      include: {
        instructor: {
          select: { id: true, fullName: true, shortCode: true, rates: { orderBy: { effectiveFrom: 'asc' } } },
        },
        attendance: { select: { memberId: true, present: true } },
      },
    })
    if (!row) return null

    const members = await tx.member.findMany({
      where: { orgId, isActive: true },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, studentId: true },
    })

    const marked = new Map(row.attendance.map((a) => [a.memberId, a.present]))

    return {
      id: row.id,
      heldOn: row.heldOn,
      durationMinutes: row.durationMinutes,
      notes: row.notes,
      instructor: toInstructorSummary(row.instructor, row.heldOn),
      presentCount: row.attendance.filter((a) => a.present).length,
      markedCount: row.attendance.length,
      fromImport: row.importId !== null,
      roster: members.map((m) => ({
        memberId: m.id,
        fullName: m.fullName,
        studentId: m.studentId,
        present: marked.get(m.id) ?? false,
      })),
    }
  })
}

/** Instructors that can be put on a session — active ones, name order. */
export async function listInstructorOptions(
  userId: string,
  orgId: string
): Promise<{ id: string; fullName: string; danceStyle: string }[]> {
  return dbAs(userId, (tx) =>
    tx.instructor.findMany({
      where: { orgId, isActive: true },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, danceStyle: true },
    })
  )
}


function toInstructorSummary(
  instructor:
    | { id: string; fullName: string; shortCode: string; rates: { hourlyRateCents: number; effectiveFrom: Date }[] }
    | null,
  heldOn: Date
): SessionRow['instructor'] {
  if (!instructor) return null
  return {
    id: instructor.id,
    fullName: instructor.fullName,
    shortCode: instructor.shortCode,
    rateCents: rateOrNull(instructor.rates, heldOn),
  }
}

/**
 * The rate covering a date, or null.
 *
 * rateForDate throws when nothing covers the date — a coach whose first rate
 * starts next term is a real state, and on a list it should read as "no rate
 * yet" rather than taking the page down.
 */
function rateOrNull(
  rates: { hourlyRateCents: number; effectiveFrom: Date }[],
  on: Date
): number | null {
  try {
    return rateForDate(rates, on)
  } catch {
    return null
  }
}
