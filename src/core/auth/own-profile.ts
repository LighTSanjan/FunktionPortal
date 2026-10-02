import 'server-only'

import { dbAdmin } from '@/core/db/admin'

/**
 * The few writes somebody makes to their own records that row-level security
 * would not let them make as themselves: their roster row, which is the
 * exco's table, and switching off their own login. Every caller keys these
 * on the session's own id, never on one from a request.
 */

export interface OwnRosterRow {
  id: string
  fullName: string
  studentId: string | null
  birthDay: number | null
  birthMonth: number | null
  birthYear: number | null
  overriddenFields: string[]
}

export async function ownRosterRow(orgId: string, userId: string): Promise<OwnRosterRow | null> {
  return dbAdmin.member.findFirst({
    where: { orgId, userId },
    select: {
      id: true,
      fullName: true,
      studentId: true,
      birthDay: true,
      birthMonth: true,
      birthYear: true,
      overriddenFields: true,
    },
  })
}

/** Their own name and birthday, onto their own roster row. */
export async function updateOwnRosterRow(
  userId: string,
  memberId: string,
  data: { fullName: string; birthday: { day: number; month: number; year: number | null } | null; overriddenFields: string[] }
): Promise<void> {
  await dbAdmin.member.updateMany({
    where: { id: memberId, userId },
    data: {
      fullName: data.fullName,
      ...(data.birthday
        ? { birthDay: data.birthday.day, birthMonth: data.birthday.month, birthYear: data.birthday.year }
        : {}),
      overriddenFields: data.overriddenFields,
    },
  })
}

/**
 * Switch off a login that has been removed from Supabase. The row stays
 * because the audit log names it; its address is released so the same
 * address can sign up again.
 */
export async function retireLogin(userId: string): Promise<void> {
  await dbAdmin.user.update({
    where: { id: userId },
    data: { isActive: false, email: `removed-${userId}@removed.invalid`, photoPath: null },
  })
  await dbAdmin.organisationMembership.updateMany({ where: { userId }, data: { isActive: false } })
}
