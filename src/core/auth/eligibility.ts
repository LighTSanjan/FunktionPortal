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

// The big personal providers because SUTD's mail filter quarantines the
// sign-in code as phishing — by October 2026 so hard that codes vanished
// before reaching even the user-visible quarantine — and a personal inbox is
// far gentler. A short list, not any domain: every code is sent from the
// club's mail account, and an open list would let anybody make it mail
// anybody. An account from any of these is a MEMBER that sees only the
// welcome screen and the join-and-pay form until the exco link it to a roster
// row (core/auth/standing.ts); a personal address carries no student ID, so
// that link is the exco confirming the ID the person claims.
export const SUTD_DOMAINS = ['mymail.sutd.edu.sg', 'alumni.sutd.edu.sg']
export const PERSONAL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'yahoo.com',
  'yahoo.com.sg',
]
const DEFAULT_DOMAINS = [...SUTD_DOMAINS, ...PERSONAL_DOMAINS]

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
