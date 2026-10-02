'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { ID_TAKEN, linkAccountByStudentId, rosterRowForStudentId } from '@/core/auth/roster-link'
import { takeAttempt } from '@/core/auth/throttle'
import { writeAudit } from '@/core/audit'
import { readBirthday, readStudentId } from '@/modules/membership-form/questions'

export interface WelcomeState {
  error: string | null
  ok?: boolean
  /** Their student ID matched a roster row, and the account is now on it. */
  linked?: boolean
  /** Keyed by field: `joiningAs`, `fullName`, `studentId`, `birthday`, `graduationYear`. */
  fieldErrors?: Record<string, string>
}

const joiningSchema = z.enum(['NEW', 'RETURNING'])

/** This year or one of the next six — what the welcome screen offers — or undefined. */
function readGraduationYear(value: FormDataEntryValue | null): number | undefined {
  const year = Number(value)
  const first = new Date().getFullYear()
  return Number.isInteger(year) && year >= first && year <= first + 6 ? year : undefined
}

export type StudentIdLookup =
  | { status: 'found'; fullName: string; birthDay: string; birthMonth: string; birthYear: string }
  | { status: 'taken' | 'unknown' | 'slow-down' }

/**
 * Who is on the roster under this student ID, so somebody coming back has
 * their name and birthday filled in for them.
 *
 * The club chose this knowing student IDs run in sequence: anybody signed in
 * could walk through them. So it answers only accounts not yet on the roster,
 * a few times an hour, and every answer is in the audit log.
 */
export async function lookUpStudentId(orgSlug: string, typed: string): Promise<StudentIdLookup> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.declare')

  const studentId = readStudentId(typed)
  if (!studentId) return { status: 'unknown' }

  const linked = await dbAs(userId, (tx) => tx.member.findFirst({ where: { orgId: org.id, userId }, select: { id: true } }))
  if (linked) return { status: 'unknown' }

  const allowed = await takeAttempt([
    { key: `roster-lookup:hour:${userId}`, max: 8, windowSeconds: 60 * 60 },
    { key: `roster-lookup:day:${userId}`, max: 20, windowSeconds: 24 * 60 * 60 },
  ])
  if (!allowed) return { status: 'slow-down' }

  const row = await rosterRowForStudentId(org.id, studentId)
  if (!row) return { status: 'unknown' }
  if (row.linkedTo && row.linkedTo !== userId) return { status: 'taken' }

  await writeAudit({
    orgId: org.id,
    actorId: userId,
    action: 'member.look_up_student_id',
    targetType: 'Member',
    targetId: row.id,
    after: { studentId },
  })
  return {
    status: 'found',
    fullName: row.fullName,
    birthDay: row.birthDay ? String(row.birthDay) : '',
    birthMonth: row.birthMonth ? String(row.birthMonth) : '',
    birthYear: row.birthYear ? String(row.birthYear) : '',
  }
}

/**
 * Save what somebody not yet on the roster says about themselves.
 *
 * Somebody coming back whose student ID is on the roster is linked to that
 * row there and then. Anybody else's ID is a claim, kept beside the account
 * for an exco member to confirm. Nothing here grants a role, and a row that
 * is already somebody's is never moved.
 */
export async function saveWelcome(orgSlug: string, _prev: WelcomeState, formData: FormData): Promise<WelcomeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.declare')

  const fieldErrors: Record<string, string> = {}

  const joining = joiningSchema.safeParse(formData.get('joiningAs'))
  if (!joining.success) fieldErrors.joiningAs = 'Say whether you’re new or coming back.'

  const fullName = String(formData.get('fullName') ?? '').trim().replace(/\s+/g, ' ')
  if (fullName.length < 2) fieldErrors.fullName = 'Put in your full name, as on your student card.'
  else if (fullName.length > 120) fieldErrors.fullName = 'That name is longer than we can keep.'

  const studentId = readStudentId(String(formData.get('studentId') ?? ''))
  if (!studentId) fieldErrors.studentId = 'Your student ID is the seven digits on your student card.'

  const birthday = readBirthday(
    String(formData.get('birthDay') ?? ''),
    String(formData.get('birthMonth') ?? ''),
    String(formData.get('birthYear') ?? '')
  )
  if (typeof birthday === 'string') fieldErrors.birthday = birthday

  // Asked only of somebody new: a returning member's row already says.
  const graduationYear = joining.success && joining.data === 'NEW' ? readGraduationYear(formData.get('graduationYear')) : null
  if (graduationYear === undefined) fieldErrors.graduationYear = 'Pick the year you expect to graduate.'

  if (Object.keys(fieldErrors).length > 0 || !joining.success || !studentId || typeof birthday === 'string' || graduationYear === undefined) {
    return { error: 'A few things need fixing first.', fieldErrors }
  }

  const existing = joining.data === 'RETURNING' ? await rosterRowForStudentId(org.id, studentId) : null
  if (existing?.linkedTo && existing.linkedTo !== userId) {
    return { error: 'A few things need fixing first.', fieldErrors: { studentId: ID_TAKEN } }
  }

  const problem = await dbAs(userId, async (tx) => {
    const linked = await tx.member.findFirst({ where: { orgId: org.id, userId }, select: { id: true } })
    if (linked) return 'You’re already on the club roster.'

    const now = new Date()
    await tx.user.update({
      where: { id: userId },
      data: {
        name: fullName,
        joiningAs: joining.data,
        claimedStudentId: studentId,
        claimedStudentIdAt: now,
        birthDay: birthday.day,
        birthMonth: birthday.month,
        birthYear: birthday.year,
        graduationYear,
        onboardedAt: now,
      },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'member.welcome',
        targetType: 'User',
        targetId: userId,
        // Never the birthday: the audit log is read more widely.
        after: { joiningAs: joining.data, studentId },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }

  const linked = existing ? (await linkAccountByStudentId(userId, org.id, studentId)) === 'linked' : false
  // Once linked, this page sends them home; refreshing it now would do that
  // before they've seen they're in. The screen goes on with a full load.
  if (!linked) revalidatePath(`/${orgSlug}`, 'layout')
  return { error: null, ok: true, linked }
}
