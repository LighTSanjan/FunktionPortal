import 'server-only'

import { dbAs } from '@/core/db'
import type { AttendanceImportStatus } from '@prisma/client'
import type { ParsedSheet } from './parse'
import { matchMembers, type MatchResult } from './match'
import { SELF_PRACTICE_MINUTES, raisedMonthKeys, isLocked } from './apply'

/** Read stored parses and recompute their member matches for review. */

export interface ImportSummary {
  id: string
  status: AttendanceImportStatus
  sourceTitle: string | null
  termName: string | null
  importedAt: Date
  appliedAt: Date | null
  dates: number
  rows: number
  membersCreated: number
  sessionsCreated: number
  marksImported: number
  error: string | null
}

export async function listImports(userId: string, orgId: string): Promise<ImportSummary[]> {
  const rows = await dbAs(userId, (tx) =>
    tx.attendanceImport.findMany({
      where: { orgId },
      orderBy: { importedAt: 'desc' },
      include: { term: { select: { name: true } } },
    })
  )

  return rows.map((row) => {
    const parsed = row.parsed as unknown as ParsedSheet
    return {
      id: row.id,
      status: row.status,
      sourceTitle: row.sourceTitle,
      termName: row.term?.name ?? null,
      importedAt: row.importedAt,
      appliedAt: row.appliedAt,
      dates: parsed?.dates?.length ?? 0,
      rows: parsed?.members?.length ?? 0,
      membersCreated: row.membersCreated,
      sessionsCreated: row.sessionsCreated,
      marksImported: row.marksImported,
      error: row.error,
    }
  })
}

/**
 * What will happen to one date when the import is applied.
 *
 * COACH writes a billable class. SELF_PRACTICE writes a class with no coach —
 * it counts towards attendance and reaches no invoice. SKIP writes nothing,
 * and is either a date nobody attended or one a human has set aside.
 */
export type DateDisposition = 'COACH' | 'SELF_PRACTICE' | 'SKIP'

export interface PlannedDate {
  iso: string
  header: string
  /** What the sheet's own instructor rows propose. */
  sheetLabel: string | null
  instructorId: string | null
  disposition: DateDisposition
  /**
   * True when the date's month has already been raised. The import leaves
   * those alone rather than rewriting the classes behind a document that is
   * with the Office of Finance.
   */
  locked: boolean
  minutes: number
  /** True when a human has overridden the sheet for this date. */
  overridden: boolean
  presentCount: number
}

export interface ImportDetail extends ImportSummary {
  parsed: ParsedSheet
  plan: PlannedDate[]
  match: MatchResult
  instructors: { id: string; fullName: string; shortCode: string }[]
  /** Sheet labels with no instructor of that name in the portal. */
  unknownInstructorLabels: string[]
}

export async function getImport(
  userId: string,
  orgId: string,
  importId: string
): Promise<ImportDetail | null> {
  return dbAs(userId, async (tx) => {
    const row = await tx.attendanceImport.findFirst({
      // orgId in the WHERE, not just the id — an id is guessable enough that
      // scoping the read has to be structural.
      where: { id: importId, orgId },
      include: { term: { select: { name: true } } },
    })
    if (!row) return null

    const parsed = row.parsed as unknown as ParsedSheet
    const [members, instructors] = await Promise.all([
      tx.member.findMany({
        where: { orgId },
        select: { id: true, fullName: true, studentId: true, email: true },
      }),
      tx.instructor.findMany({
        where: { orgId },
        orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
        select: { id: true, fullName: true, shortCode: true },
      }),
    ])

    const byShortCode = new Map(instructors.map((i) => [i.shortCode.toLowerCase(), i]))
    const byFullName = new Map(instructors.map((i) => [i.fullName.toLowerCase(), i]))
    const resolve = (label: string) =>
      byShortCode.get(label.toLowerCase()) ?? byFullName.get(label.toLowerCase()) ?? null

    const overrides = (row.dateInstructorMap ?? {}) as Record<
      string,
      { instructorId: string | null; minutes: number } | null
    >
    const fromSheet = new Map(parsed.sessions.map((s) => [s.iso, s]))
    const selfPractice = new Set(parsed.unattributedDates)
    const raised = await raisedMonthKeys(tx, orgId)

    const plan: PlannedDate[] = parsed.dates.map((date) => {
      const sheet = fromSheet.get(date.iso) ?? null
      const proposed = sheet ? resolve(sheet.instructorLabel) : null
      const override = Object.prototype.hasOwnProperty.call(overrides, date.iso)
        ? overrides[date.iso]
        : undefined

      // Three states, and which one a date defaults to is read off the sheet.
      // A date with no coach marked but people present is the club meeting on
      // its own; a date whose coach label matches nobody in the portal is a
      // question for a human, and defaults to being left out rather than
      // quietly becoming self-practice.
      const disposition: DateDisposition =
        override !== undefined
          ? override === null
            ? 'SKIP'
            : override.instructorId
              ? 'COACH'
              : 'SELF_PRACTICE'
          : proposed
            ? 'COACH'
            : selfPractice.has(date.iso)
              ? 'SELF_PRACTICE'
              : 'SKIP'

      const instructorId =
        override !== undefined ? (override?.instructorId ?? null) : (proposed?.id ?? null)

      return {
        iso: date.iso,
        header: date.header,
        sheetLabel: sheet?.instructorLabel ?? null,
        instructorId,
        disposition,
        locked: disposition !== 'SKIP' && isLocked(raised, date.iso, instructorId),
        minutes:
          override !== undefined
            ? (override?.minutes ?? SELF_PRACTICE_MINUTES)
            : (sheet?.minutes || SELF_PRACTICE_MINUTES),
        overridden: override !== undefined,
        presentCount: parsed.members.filter((m) => m.presentOn.includes(date.iso)).length,
      }
    })

    const unknownInstructorLabels = [
      ...new Set(parsed.sessions.map((s) => s.instructorLabel).filter((label) => !resolve(label))),
    ]

    return {
      id: row.id,
      status: row.status,
      sourceTitle: row.sourceTitle,
      termName: row.term?.name ?? null,
      importedAt: row.importedAt,
      appliedAt: row.appliedAt,
      dates: parsed.dates.length,
      rows: parsed.members.length,
      membersCreated: row.membersCreated,
      sessionsCreated: row.sessionsCreated,
      marksImported: row.marksImported,
      error: row.error,
      parsed,
      plan,
      match: matchMembers(parsed.members, members),
      instructors,
      unknownInstructorLabels,
    }
  })
}

/** Terms an import can be filed against, most recent first. */
export async function listTerms(userId: string, orgId: string) {
  return dbAs(userId, (tx) =>
    tx.term.findMany({
      where: { orgId },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true, startDate: true, endDate: true },
    })
  )
}
