'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SELF_PRACTICE, SKIP } from './date-choice'
import type { Prisma } from '@prisma/client'
import { dbAs } from '@/core/db'
import { verifySession, getOrgContext, requirePermission } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { parseCsv } from './csv'
import { parseAttendanceSheet, SheetFormatError, type ParsedSheet } from './parse'
import { applyParsedSheet, type DateOverride } from './apply'
import { linkRosterToAccounts } from '@/core/auth/roster-link'

export interface ActionState {
  error: string | null
  ok?: boolean
}

const MAX_UPLOAD_BYTES = 2_000_000

const uploadSchema = z.object({
  termId: z.string().min(1, 'Choose the term this sheet covers'),
})

/** Parse and store a sheet for review without applying it. */
export async function uploadSheet(
  orgSlug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'session.manage')
  const { userId } = await verifySession()

  const fields = uploadSchema.safeParse({ termId: formData.get('termId') ?? '' })
  if (!fields.success) {
    return { error: fields.error.issues[0]?.message ?? 'Choose the term this sheet covers' }
  }

  const file = formData.get('sheet')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a CSV export of the attendance sheet' }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: 'That file is too large to be an attendance sheet' }
  }

  const text = await file.text()

  let importId: string

  try {
    importId = await dbAs(userId, async (tx) => {
      const term = await tx.term.findFirst({
        where: { id: fields.data.termId, orgId: org.id },
        select: { id: true, name: true, startDate: true, endDate: true },
      })
      if (!term) throw new SheetFormatError('That term no longer exists')

      const parsed = parseAttendanceSheet(parseCsv(text), {
        termStart: term.startDate,
        termEnd: term.endDate,
      })

      const created = await tx.attendanceImport.create({
        data: {
          orgId: org.id,
          termId: term.id,
          spreadsheetId: '',
          sourceTitle: file.name,
          status: 'NEEDS_MAPPING',
          parsed: parsed as unknown as Prisma.InputJsonValue,
          importedByUserId: userId,
        },
        select: { id: true },
      })

      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'attendance.import.parsed',
          targetType: 'AttendanceImport',
          targetId: created.id,
          metadata: {
            term: term.name,
            file: file.name,
            dates: parsed.dates.length,
            rows: parsed.members.length,
          },
        },
        tx
      )

      return created.id
    })
  } catch (error) {
    if (error instanceof SheetFormatError) return { error: error.message }
    throw error
  }

  revalidatePath(`/${orgSlug}/settings/attendance`)
  redirect(`/${orgSlug}/settings/attendance/${importId}`)
}

const mapSchema = z.object({
  importId: z.string().min(1),
  iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  instructorId: z.string(),
  minutes: z.coerce.number().int().min(0).max(600),
})

/**
 * Say what a date is: a coach's class, a self-practice session, or nothing.
 *
 * Three answers rather than two. If "nobody taught it" and "leave it out"
 * share a blank, a real self-practice date gets recorded nowhere at all.
 */
export async function mapDate(
  orgSlug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'session.manage')
  const { userId } = await verifySession()

  const fields = mapSchema.safeParse({
    importId: formData.get('importId') ?? '',
    iso: formData.get('iso') ?? '',
    instructorId: formData.get('instructorId') ?? '',
    minutes: formData.get('minutes') ?? '90',
  })
  if (!fields.success) return { error: 'That date could not be assigned' }
  const { importId, iso, instructorId, minutes } = fields.data

  const problem = await dbAs(userId, async (tx) => {
    const record = await tx.attendanceImport.findFirst({
      where: { id: importId, orgId: org.id },
      select: { id: true, status: true, dateInstructorMap: true },
    })
    if (!record) return 'That import no longer exists'
    if (record.status === 'APPLIED') return 'That import has already been applied'

    // The coach has to belong to this club. The import is scoped to the org,
    // but an id posted from the browser is not — and a class session pointing
    // at another club's coach corrupts both clubs' months.
    if (instructorId !== SKIP && instructorId !== SELF_PRACTICE) {
      const coach = await tx.instructor.findFirst({
        where: { id: instructorId, orgId: org.id },
        select: { id: true },
      })
      if (!coach) return 'That coach is not one of this club’s'
    }

    const overrides = { ...((record.dateInstructorMap ?? {}) as Record<string, unknown>) }
    if (instructorId === SKIP) overrides[iso] = null
    else if (instructorId === SELF_PRACTICE) overrides[iso] = { instructorId: null, minutes }
    else overrides[iso] = { instructorId, minutes }

    await tx.attendanceImport.update({
      where: { id: record.id },
      data: { dateInstructorMap: overrides as Prisma.InputJsonValue },
    })
    return null
  })
  if (problem) return { error: problem }

  revalidatePath(`/${orgSlug}/settings/attendance/${importId}`)
  return { error: null, ok: true }
}

export async function applyImport(
  orgSlug: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await getOrgContext(orgSlug)
  await requirePermission(org.id, 'session.manage')
  const { userId } = await verifySession()

  const importId = String(formData.get('importId') ?? '')
  if (!importId) return { error: 'Nothing to apply' }

  try {
    await dbAs(userId, async (tx) => {
      const record = await tx.attendanceImport.findFirst({
        where: { id: importId, orgId: org.id },
      })
      if (!record) throw new Error('Import not found')

      const result = await applyParsedSheet(tx, {
        orgId: org.id,
        actorId: userId,
        importId: record.id,
        parsed: record.parsed as unknown as ParsedSheet,
        overrides: (record.dateInstructorMap ?? {}) as Record<string, DateOverride>,
      })
      const { membersCreated, sessionsCreated, marksImported } = result

      await tx.attendanceImport.update({
        where: { id: record.id },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
          membersCreated,
          sessionsCreated,
          marksImported,
          error: null,
        },
      })

      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'attendance.import.applied',
          targetType: 'AttendanceImport',
          targetId: record.id,
          metadata: {
            membersCreated,
            sessionsCreated,
            marksImported,
            skipped: result.skippedDates.length,
            locked: result.lockedDates,
            coachChanged: result.coachChangedDates,
          },
        },
        tx
      )
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The import could not be applied'
    await dbAs(userId, (tx) =>
      tx.attendanceImport.updateMany({
        where: { id: importId, orgId: org.id },
        data: { status: 'FAILED', error: message },
      })
    )
    return { error: message }
  }

  // New rows can belong to people who signed in before the sheet had them.
  // Outside the import's transaction: a link that fails is one the exco can
  // still make by hand, and must not undo a whole trimester's attendance.
  await linkRosterToAccounts(org.id, userId).catch((error) => {
    console.error('[attendance] linking accounts to the roster failed', error)
  })

  revalidatePath(`/${orgSlug}/settings/attendance/${importId}`)
  revalidatePath(`/${orgSlug}/sessions`)
  revalidatePath(`/${orgSlug}/fees/collection`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}
