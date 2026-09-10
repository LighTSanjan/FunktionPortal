import type { Prisma } from '@prisma/client'
import type { ParsedSheet } from './parse'
import { matchMembers, isDepartedLabel, normaliseStudentId } from './match'

/** Idempotently apply a parsed sheet from either the UI or import script. */

export type DateOverride = { instructorId: string; minutes: number } | null

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
  /** Dates left out because no coach could be put against them. */
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

  // ── Which class belongs to which coach ───────────────────
  const byShortCode = new Map(instructors.map((i) => [i.shortCode.toLowerCase(), i.id]))
  const byFullName = new Map(instructors.map((i) => [i.fullName.toLowerCase(), i.id]))

  const plan = new Map<string, { instructorId: string; minutes: number }>()
  for (const session of parsed.sessions) {
    const instructorId =
      byShortCode.get(session.instructorLabel.toLowerCase()) ??
      byFullName.get(session.instructorLabel.toLowerCase())
    if (instructorId) plan.set(session.iso, { instructorId, minutes: session.minutes })
  }
  for (const [iso, override] of Object.entries(overrides)) {
    if (override === null) plan.delete(iso)
    else plan.set(iso, override)
  }

  // Include departed members only where the sheet marks them present.
  const roster = parsed.members
    .filter((row) => memberIdByRow.has(row.rowNumber))
    .filter((row) => !isDepartedLabel(row.rosterLabel) || row.presentOn.length > 0)

  let sessionsCreated = 0
  let sessionsUpdated = 0
  let marksImported = 0

  for (const [iso, { instructorId, minutes }] of plan) {
    const heldOn = new Date(`${iso}T00:00:00Z`)
    const existing = await tx.classSession.findFirst({
      where: { orgId, instructorId, heldOn },
      select: { id: true },
    })

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
    skippedDates: parsed.dates.map((d) => d.iso).filter((iso) => !plan.has(iso)),
  }
}
