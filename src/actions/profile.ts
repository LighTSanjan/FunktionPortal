'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySession, getOrgContext } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { ownRosterRow, retireLogin, updateOwnRosterRow } from '@/core/auth/own-profile'
import { writeAudit } from '@/core/audit'
import { createSupabaseServer } from '@/core/auth/supabase-server'
import { supabaseAdmin } from '@/core/auth/admin-client'
import { ID_TAKEN, linkAccountByStudentId, rosterRowForStudentId } from '@/core/auth/roster-link'
import { LINKING_COOKIE } from '@/core/auth/return-path'
import { isDemo } from '@/core/auth/demo'
import { appUrl } from '@/lib/app-url'
import { readBirthday, readStudentId } from '@/modules/membership-form/questions'
import { checkPhoto, discardPhoto, putPhoto } from '@/modules/photos'
import { isEmptyLogin } from '@/core/auth/empty-login'

export interface ProfileState {
  error: string | null
  ok?: boolean
  /** Keyed by field: `name`, `studentId`, `birthday`. */
  fieldErrors?: Record<string, string>
}

/**
 * Save somebody's own name, birthday and — until the roster has them — the
 * student ID they say is theirs.
 *
 * Once they are on the roster, the name and birthday they give are the
 * roster's too, and marked as theirs so the next attendance import does not
 * type over them. The student ID is the roster's from then on: imports match
 * on it, so changing it is the exco's job.
 */
export async function updateProfile(orgSlug: string, _prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()

  const fieldErrors: Record<string, string> = {}

  const name = String(formData.get('name') ?? '').trim().replace(/\s+/g, ' ')
  if (name.length < 2) fieldErrors.name = 'Put in your full name.'
  else if (name.length > 120) fieldErrors.name = 'That name is longer than we can keep.'

  const day = String(formData.get('birthDay') ?? '')
  const month = String(formData.get('birthMonth') ?? '')
  const year = String(formData.get('birthYear') ?? '')
  const birthday = day || month || year ? readBirthday(day, month, year) : null
  if (typeof birthday === 'string') fieldErrors.birthday = birthday

  const member = await ownRosterRow(org.id, userId)

  const typedId = String(formData.get('studentId') ?? '').trim()
  const studentId = member || !typedId ? null : readStudentId(typedId)
  if (!member && typedId && !studentId) fieldErrors.studentId = 'Your student ID is the seven digits on your student card.'
  if (studentId) {
    const row = await rosterRowForStudentId(org.id, studentId)
    if (row?.linkedTo && row.linkedTo !== userId) fieldErrors.studentId = ID_TAKEN
  }

  if (Object.keys(fieldErrors).length > 0 || typeof birthday === 'string') {
    return { error: 'A few things need fixing first.', fieldErrors }
  }

  const user = await dbAs(userId, async (tx) => {
    const before = await tx.user.findUnique({
      where: { id: userId },
      select: { name: true, claimedStudentId: true, joiningAs: true },
    })
    await tx.user.update({
      where: { id: userId },
      data: {
        name,
        ...(birthday ? { birthDay: birthday.day, birthMonth: birthday.month, birthYear: birthday.year } : {}),
        ...(studentId ? { claimedStudentId: studentId, claimedStudentIdAt: new Date() } : {}),
      },
    })
    // Audited because the name is a signature line. A quiet rename between
    // generating a document and submitting it should leave a trail.
    if (before && before.name !== name) {
      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'user.rename',
          targetType: 'User',
          targetId: userId,
          before: { name: before.name },
          after: { name },
        },
        tx
      )
    }
    if (studentId && before?.claimedStudentId !== studentId) {
      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'member.claim_student_id',
          targetType: 'User',
          targetId: userId,
          after: { studentId },
        },
        tx
      )
    }
    return before
  })

  if (member) {
    const changed = [
      ...(member.fullName !== name ? ['fullName'] : []),
      ...(birthday &&
      (member.birthDay !== birthday.day || member.birthMonth !== birthday.month || member.birthYear !== birthday.year)
        ? ['birthDay', 'birthMonth', 'birthYear']
        : []),
    ]
    if (changed.length > 0) {
      await updateOwnRosterRow(userId, member.id, {
        fullName: name,
        birthday,
        overriddenFields: [...new Set([...member.overriddenFields, ...changed])],
      })
      await writeAudit({
        orgId: org.id,
        actorId: userId,
        action: 'member.update_own',
        targetType: 'Member',
        targetId: member.id,
        // Which fields, never the birthday itself: the audit log is read more widely.
        after: { fields: changed, ...(changed.includes('fullName') ? { fullName: name } : {}) },
      })
    }
  } else if (studentId && user?.joiningAs === 'RETURNING') {
    // Somebody coming back who got their ID wrong on the welcome screen.
    await linkAccountByStudentId(userId, org.id, studentId)
  }

  revalidatePath(`/${orgSlug}`, 'layout')
  return { error: null, ok: true }
}

export async function uploadPhoto(orgSlug: string, _prev: ProfileState, formData: FormData): Promise<ProfileState> {
  await getOrgContext(orgSlug)
  const { userId, photoPath } = await verifySession()

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) return { error: 'Pick a photo first.' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const format = checkPhoto(bytes)
  if (format !== 'png' && format !== 'jpg') return { error: format }

  const key = await putPhoto(userId, bytes, format)
  await dbAs(userId, (tx) => tx.user.update({ where: { id: userId }, data: { photoPath: key } }))
  await discardPhoto(photoPath)

  revalidatePath(`/${orgSlug}`, 'layout')
  return { error: null, ok: true }
}

export async function removePhoto(orgSlug: string): Promise<ProfileState> {
  await getOrgContext(orgSlug)
  const { userId, photoPath } = await verifySession()
  await dbAs(userId, (tx) => tx.user.update({ where: { id: userId }, data: { photoPath: null } }))
  await discardPhoto(photoPath)
  revalidatePath(`/${orgSlug}`, 'layout')
  return { error: null, ok: true }
}

/**
 * Add Google as a second way into this same account.
 *
 * One person, one account: whichever way they sign in, it is the same roles,
 * payments and history. Supabase sends them through Google and back to the
 * callback, which sees the cookie set here and returns them to their profile.
 * Needs "Manual linking" on in the Supabase project's Auth settings.
 */
export async function connectGoogle(orgSlug: string): Promise<ProfileState> {
  await getOrgContext(orgSlug)
  if (isDemo()) return { error: 'The demo has no Google sign-in.' }

  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: `${appUrl()}/auth/callback`, queryParams: { prompt: 'select_account' } },
  })
  if (error || !data?.url) {
    return { error: /manual linking/i.test(error?.message ?? '') ? 'Connecting Google isn’t switched on yet. Ask the exco.' : 'Google couldn’t be reached. Try again.' }
  }

  ;(await cookies()).set(LINKING_COOKIE, `/${orgSlug}/settings/profile`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60,
    path: '/',
  })
  redirect(data.url)
}

/** Take Google off again. Never the last way in. */
export async function disconnectGoogle(orgSlug: string): Promise<ProfileState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()

  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUserIdentities()
  const identities = data?.identities ?? []
  const google = identities.find((identity) => identity.provider === 'google')
  if (!google) return { error: 'Google isn’t connected.' }
  if (identities.length < 2) return { error: 'Google is the only way you sign in, so it has to stay.' }

  const { error } = await supabase.auth.unlinkIdentity(google)
  if (error) return { error: 'Google couldn’t be disconnected. Try again.' }

  await writeAudit({
    orgId: org.id,
    actorId: userId,
    action: 'user.disconnect_google',
    targetType: 'User',
    targetId: userId,
  })
  revalidatePath(`/${orgSlug}/settings/profile`)
  return { error: null, ok: true }
}

/**
 * Remove a second, empty login — usually a Google account somebody signed in
 * with before connecting Google to the account they already had. Its Google
 * sign-in is freed to connect there.
 *
 * The row stays, switched off and with its address released, because the
 * audit log names it; the Supabase account goes.
 */
export async function removeLogin(orgSlug: string): Promise<ProfileState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId, email } = await verifySession()
  if (!(await isEmptyLogin(userId))) {
    return { error: 'This login has club records on it, so it can’t be removed. Ask the exco.' }
  }

  await writeAudit({
    orgId: org.id,
    actorId: userId,
    action: 'user.remove_login',
    targetType: 'User',
    targetId: userId,
    before: { email },
  })
  const { error } = await supabaseAdmin().auth.admin.deleteUser(userId)
  if (error) return { error: 'That login couldn’t be removed. Try again.' }

  await retireLogin(userId)

  await (await createSupabaseServer()).auth.signOut().catch(() => undefined)
  redirect('/sign-in')
}
