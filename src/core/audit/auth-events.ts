/** Record auth events in each organisation the user belongs to. */
import { headers } from 'next/headers'
import { dbAdmin } from '@/core/db/admin'
import { writeAudit } from '@/core/audit'

export type AuthEventAction =
  | 'auth.sign_in'
  | 'auth.sign_in_failed'
  | 'auth.sign_out'
  // A changed password is a change of who can act as this person, so it
  // belongs in the same log as the sign-ins it enables.
  | 'auth.password_reset'
  | 'auth.connect_google'

async function requestMetadata(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
  const userAgent = h.get('user-agent')
  return { ip, userAgent }
}

export async function logAuthEvent(userId: string, action: AuthEventAction): Promise<void> {
  const metadata = await requestMetadata()

  const memberships = await dbAdmin.organisationMembership.findMany({
    where: { userId, isActive: true },
    select: { orgId: true },
  })

  await Promise.all(
    memberships.map((m) =>
      writeAudit({
        orgId: m.orgId,
        actorId: userId,
        action,
        targetType: 'user',
        targetId: userId,
        metadata,
      })
    )
  )
}
