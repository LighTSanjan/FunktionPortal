'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { readBirthday, readStudentId } from '@/modules/membership-form/questions'

export interface WelcomeState {
  error: string | null
  ok?: boolean
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

/**
 * Save what somebody not yet on the roster says about themselves.
 *
 * All of it is a claim. The student ID goes where claimStudentId has always
 * put it — beside the roster row it names, for an exco member to confirm —
 * and nothing here links the account to a row or grants a role. Somebody
 * already on the roster has nothing to say here.
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
  revalidatePath(`/${orgSlug}`, 'layout')
  return { error: null, ok: true }
}
