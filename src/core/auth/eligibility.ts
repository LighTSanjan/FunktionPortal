import 'server-only'

/**
 * Who may join the club on the portal.
 *
 * Anyone can hold an account — Supabase will create one for any address that
 * asks — but an account is not access. Access starts with a membership, and
 * a membership is created on sign-in only for a proven address that is
 * either on a university domain the deployment lists, or was invited by the
 * exco (instructors, members with no university address).
 *
 * Existing memberships are never taken away here. The exco disable accounts
 * from the access screen.
 */
import { dbAdmin } from '@/core/db/admin'
import { listEnv } from './proof'

const DEFAULT_DOMAINS = ['mymail.sutd.edu.sg', 'alumni.sutd.edu.sg']

export function allowedDomains(): string[] {
  const configured = listEnv('ALLOWED_EMAIL_DOMAINS')
  return configured.length > 0 ? configured : DEFAULT_DOMAINS
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isAllowedDomain(email: string): boolean {
  const domain = normaliseEmail(email).split('@')[1]
  return Boolean(domain) && allowedDomains().includes(domain)
}

export async function pendingInvitation(email: string) {
  const [invitation] = await dbAdmin.$queryRaw<Array<{ id: string; org_id: string }>>`
    SELECT id, org_id FROM invitations
    WHERE lower(email) = ${normaliseEmail(email)}
      AND status = 'PENDING'
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1
  `
  return invitation ? { id: invitation.id, orgId: invitation.org_id } : null
}

/** Whether a first sign-in from this address would be let into the club. */
export async function mayJoin(email: string): Promise<boolean> {
  return isAllowedDomain(email) || (await pendingInvitation(email)) !== null
}
