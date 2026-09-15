import type { Prisma } from '@prisma/client'
import type { ParsedSheet } from './parse'
import { matchMembers, isDepartedLabel, normaliseStudentId } from './match'

/** Idempotently apply a parsed sheet from either the UI or import script. */

/**
 * What the treasurer decided about one date.
 *
 * `null` leaves the date out entirely. An entry with a null `instructorId` is
 * self-practice: the class happened and nobody was paid for it, which is a
 * different statement from "we could not work out who taught it".
 */
export type DateOverride = { instructorId: string | null; minutes: number } | null

/** What a self-practice session is assumed to run for, absent any evidence. */
export const SELF_PRACTICE_MINUTES = 90

export interface ApplyArgs {
  orgId: string
  /** Null for command-line back-catalogue imports. */
  actorId: string | null
  importId: string
  parsed: ParsedSheet
  /** Per-date corrections from the review screen. Null keeps a date out. */
  overrides: Record<string, DateOverride>
}

export interface ApplyResult {
  membersCreated: number
  membersUpdated: number
  sessionsCreated: number
  sessionsUpdated: number
  marksImported: number
  /** Of the classes written, the ones with no coach on them. */
  selfPracticeDates: string[]
  /**
   * Dates left untouched because their month has already been raised. Not an
   * error and not silent: the sheet may well be right and the submitted
   * document wrong, and that is a decision for a person.
   */
  lockedDates: string[]
  /**
   * Dates whose class an earlier import recorded under a different coach — or
   * as self-practice — and which now carry the coach the sheet says.
   */
  coachChangedDates: string[]
  /**
   * Dates that produced nothing: either nobody attended, or the sheet names a
   * coach the portal does not have and a human has not resolved it.
   */
  skippedDates: string[]
}

export async function applyParsedSheet(
  tx: Prisma.TransactionClient,
  { orgId, actorId, importId, parsed, overrides }: ApplyArgs
): Promise<ApplyResult> {
  const [existingMembers, instructors] = await Promise.all([
    tx.member.findMany({
      where: { orgId },
      select: { id: true, fullName: true, studentId: true, email: true },
    }),
    tx.instructor.findMany({
      where: { orgId },
      select: { id: true, shortCode: true, fullName: true },
    }),
  ])

  // ── Members ──────────────────────────────────────────────
  const { matched, unmatched } = matchMembers(parsed.members, existingMembers)
  const memberIdByRow = new Map<number, string>()

  for (const match of matched) {
    const row = match.row
    await tx.member.update({
      where: { id: match.memberId },
      data: {
        fullName: row.fullName,
        // `?? undefined` rather than `?? null`: a blank cell in this term's
        // sheet is not evidence that a phone number the club already has is
        // wrong, and overwriting it with null would lose it.
        email: row.email ?? undefined,
        phone: row.phone ?? undefined,
        academicTerm: row.academicTerm ?? undefined,
        rosterLabel: row.rosterLabel,
        isActive: !isDepartedLabel(row.rosterLabel),
        lastImportId: importId,
      },
    })
    memberIdByRow.set(row.rowNumber, match.memberId)
  }

  // Deduplicate by student ID, then create new members in one statement.
  const newByStudentId = new Map<string, typeof unmatched>()
  for (const row of unmatched) {
    const id = normaliseStudentId(row.studentId)!
    newByStudentId.set(id, [...(newByStudentId.get(id) ?? []), row])
  }

  if (newByStudentId.size > 0) {
    await tx.member.createMany({
      data: [...newByStudentId].map(([studentId, [row]]) => ({
        orgId,
        fullName: row.fullName,
        studentId,
        email: row.email,
        phone: row.phone,
        birthDay: row.birthDay,
        birthMonth: row.birthMonth,
        birthYear: row.birthYear,
        academicTerm: row.academicTerm,
        rosterLabel: row.rosterLabel,
        isActive: !isDepartedLabel(row.rosterLabel),
        lastImportId: importId,
      })),
    })

    const created = await tx.member.findMany({
      where: { orgId, studentId: { in: [...newByStudentId.keys()] } },
      select: { id: true, studentId: true },
    })
    const idByStudentId = new Map(created.map((m) => [m.studentId!, m.id]))
    for (const [studentId, rows] of newByStudentId) {
      const memberId = idByStudentId.get(studentId)
      if (!memberId) continue
      for (const row of rows) memberIdByRow.set(row.rowNumber, memberId)
    }
  }

  const plan = buildDatePlan(parsed, overrides, instructors)

  // Include departed members only where the sheet marks them present.
  const roster = parsed.members
    .filter((row) => memberIdByRow.has(row.rowNumber))
    .filter((row) => !isDepartedLabel(row.rosterLabel) || row.presentOn.length > 0)

  let sessionsCreated = 0
  let sessionsUpdated = 0
  let marksImported = 0
  const lockedDates: string[] = []
  const coachChangedDates: string[] = []

  // Months whose documents have already been raised. A trimester sheet spans
  // several months and a re-import is routine, so without this an import
  // quietly rewrites the classes and marks behind an attendance sheet that is
  // already with the Office of Finance.
  const raisedMonths = await raisedMonthKeys(tx, orgId)

  // Which earlier imports count as this same sheet: the same term's, or for a
  // command-line import with no term, the same spreadsheet. A class another
  // term's sheet put on the same date is somebody else's record.
  const source = await tx.attendanceImport.findFirst({
    where: { id: importId, orgId },
    select: { termId: true, spreadsheetId: true },
  })
  const sameSheet: Prisma.AttendanceImportWhereInput | null = source?.termId
    ? { termId: source.termId }
    : source?.spreadsheetId
      ? { spreadsheetId: source.spreadsheetId }
      : null

  for (const [iso, { instructorId, minutes }] of plan) {
    const heldOn = new Date(`${iso}T00:00:00Z`)
    if (isLocked(raisedMonths, iso, instructorId)) {
      lockedDates.push(iso)
      continue
    }

    // A sheet has one class a date. A class an earlier import wrote for this
    // date under another coach — or as self-practice — is the same class with
    // the coach corrected, not a second one: left alone, both coaches were
    // billed for one evening. Classes somebody recorded by hand are theirs
    // and are never touched here.
    const stale = sameSheet === null ? [] : await tx.classSession.findMany({
      where: {
        orgId,
        heldOn,
        import: sameSheet,
        // Spelled out: in SQL "not this coach" never matches a NULL coach.
        ...(instructorId === null
          ? { instructorId: { not: null } }
          : { OR: [{ instructorId: null }, { instructorId: { not: instructorId } }] }),
      },
      select: { id: true, instructorId: true },
    })
    if (stale.some((row) => isLocked(raisedMonths, iso, row.instructorId))) {
      // The old coach's month is already raised: changing the class would
      // change a document that exists. Void that month first.
      lockedDates.push(iso)
      continue
    }

    let existing = await tx.classSession.findFirst({
      where: { orgId, instructorId, heldOn },
      select: { id: true },
    })
    for (const row of stale) {
      if (existing) {
        await tx.classSession.delete({ where: { id: row.id } })
      } else {
        existing = await tx.classSession.update({
          where: { id: row.id },
          data: { instructorId },
          select: { id: true },
        })
      }
    }
    if (stale.length > 0) coachChangedDates.push(iso)

    const session = existing
      ? await tx.classSession.update({
          where: { id: existing.id },
          data: { durationMinutes: minutes, importId },
          select: { id: true },
        })
      : await tx.classSession.create({
          data: { orgId, instructorId, heldOn, durationMinutes: minutes, importId },
          select: { id: true },
        })
    if (existing) sessionsUpdated++
    else sessionsCreated++

    await tx.sessionAttendance.deleteMany({ where: { sessionId: session.id } })
    const rows = roster.map((row) => ({
      orgId,
      sessionId: session.id,
      memberId: memberIdByRow.get(row.rowNumber)!,
      present: row.presentOn.includes(iso),
      recordedById: actorId,
    }))
    await tx.sessionAttendance.createMany({ data: rows })
    marksImported += rows.filter((r) => r.present).length
  }

  return {
    membersCreated: newByStudentId.size,
    membersUpdated: matched.length,
    sessionsCreated,
    sessionsUpdated,
    marksImported,
    lockedDates,
    coachChangedDates: coachChangedDates.sort(),
    selfPracticeDates: [...plan.entries()]
      .filter(([iso, entry]) => entry.instructorId === null && !lockedDates.includes(iso))
      .map(([iso]) => iso)
      .sort(),
    skippedDates: parsed.dates.map((d) => d.iso).filter((iso) => !plan.has(iso)),
  }
}

/** One entry per date that will produce a class. */
export type DatePlan = Map<string, { instructorId: string | null; minutes: number }>

/**
 * Decide what each date in the sheet is, before anything is written.
 *
 * Three outcomes, and the difference between two of them is the whole point:
 * a date with no coach marked but people present is the club meeting on its
 * own, which is a class; a date whose coach label matches nobody in the portal
 * is a question nobody has answered, which is not. Collapsing those two into
 * one blank is how five real dates across the 2026 trimesters — one with
 * twenty-five people on it — were recorded nowhere at all.
 *
 * Pure, and separated from the write for that reason.
 */
export function buildDatePlan(
  parsed: ParsedSheet,
  overrides: Record<string, DateOverride>,
  instructors: { id: string; fullName: string; shortCode: string }[]
): DatePlan {
  const byShortCode = new Map(instructors.map((i) => [i.shortCode.toLowerCase(), i.id]))
  const byFullName = new Map(instructors.map((i) => [i.fullName.toLowerCase(), i.id]))

  const plan: DatePlan = new Map()
  for (const session of parsed.sessions) {
    const instructorId =
      byShortCode.get(session.instructorLabel.toLowerCase()) ??
      byFullName.get(session.instructorLabel.toLowerCase())
    if (instructorId) plan.set(session.iso, { instructorId, minutes: session.minutes })
  }

  // The sheet cannot supply a length for these, because the length was read
  // off the coach's own mark. SELF_PRACTICE_MINUTES is the usual class and is
  // editable on the review screen; nothing is billed from it either way.
  for (const iso of parsed.unattributedDates) {
    if (!plan.has(iso)) plan.set(iso, { instructorId: null, minutes: SELF_PRACTICE_MINUTES })
  }

  for (const [iso, override] of Object.entries(overrides)) {
    if (override === null) plan.delete(iso)
    else plan.set(iso, override)
  }
  return plan
}

/**
 * `2026-05` for every month that already has a non-void invoice, keyed by the
 * coach it was raised for.
 *
 * `null` in the key set means "any coach", which is how a self-practice date
 * is checked: it prints on every attendance sheet for its month, so any raised
 * month locks it.
 */
export async function raisedMonthKeys(
  tx: Prisma.TransactionClient,
  orgId: string
): Promise<Set<string>> {
  const invoices = await tx.invoice.findMany({
    where: { orgId, status: { not: 'VOID' } },
    select: { instructorId: true, periodYear: true, periodMonth: true },
  })

  const keys = new Set<string>()
  for (const invoice of invoices) {
    const month = `${invoice.periodYear}-${String(invoice.periodMonth).padStart(2, '0')}`
    keys.add(`${invoice.instructorId}@${month}`)
    keys.add(`*@${month}`)
  }
  return keys
}

export function isLocked(raised: Set<string>, iso: string, instructorId: string | null): boolean {
  const month = iso.slice(0, 7)
  return instructorId
    ? raised.has(`${instructorId}@${month}`)
    : raised.has(`*@${month}`)
}
