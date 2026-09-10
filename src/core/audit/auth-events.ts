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

/**
 * Log a failed sign-in attempt — only when the email matches an existing
 * user. An unknown email has no org to scope the event to, and is bot/scanner
 * noise the org-level audit trail doesn't need.
 */
export async function logFailedSignIn(email: string): Promise<void> {
  const user = await dbAdmin.user.findUnique({
    where: { email },
    select: { id: true },
  })
  if (!user) return

  await logAuthEvent(user.id, 'auth.sign_in_failed')
}
