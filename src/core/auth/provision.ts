import 'server-only'

import type { User as SupabaseUser } from '@supabase/supabase-js'
import { dbAdmin } from '@/core/db/admin'

// Mirror auth.users into public.users. This stays application-side because the
// migration role cannot install triggers in Supabase's auth schema.
export async function provisionUser(authUser: SupabaseUser): Promise<void> {
  const email = authUser.email
  if (!email) {
    // Every sign-in route the portal offers yields an email. If one ever does
    // not, failing loudly beats writing a user row with a synthesised address
    // that no invitation will ever match against.
    throw new Error(`Supabase user ${authUser.id} has no email address`)
  }

  const name = displayName(authUser, email)

  await dbAdmin.user.upsert({
    where: { id: authUser.id },
    // `isActive` is deliberately not touched. It is how the exco disables
    // someone, and a disabled account that could re-enable itself by signing
    // in again would not be disabled at all.
    update: { email, name },
    create: { id: authUser.id, email, name },
  })

  const verified = emailIsVerified(authUser)
  await joinDefaultOrganisation(authUser.id, email, verified)
  if (verified) await linkRosterMember(authUser.id, email)
}

/**
 * Whether the email on this account proves anything about who is holding it.
 *
 * Linking to a roster row and the first-exco bootstrap both key on email, so
 * both assume the address was verified. That stops being true the moment
 * Supabase's "Confirm email" is switched off: anyone can then sign up as
 * somebody else's SUTD address and would be linked to their roster row —
 * seeing their fee, and declaring payments as them — or, on a fresh
 * deployment, sign up as the bootstrap address and become the exco.
 *
 * So: an OAuth provider that verifies addresses itself (Google does) counts.
 * A password sign-up counts only when the deployment declares that Supabase
 * is confirming emails, with AUTH_EMAILS_ARE_VERIFIED=true. The default is
 * the safe one — nothing is linked automatically, and the exco confirm
 * student-ID claims by hand instead.
 */
export function emailIsVerified(authUser: Pick<SupabaseUser, 'app_metadata' | 'email_confirmed_at'>): boolean {
  const provider = authUser.app_metadata?.provider
  if (provider && provider !== 'email' && provider !== 'phone') return true
  return process.env.AUTH_EMAILS_ARE_VERIFIED === 'true' && Boolean(authUser.email_confirmed_at)
}

/** Organisations this account actually belongs to. */
async function activeOrgIds(userId: string): Promise<string[]> {
  const memberships = await dbAdmin.organisationMembership.findMany({
    where: { userId, isActive: true },
    select: { orgId: true },
  })
  return memberships.map((row) => row.orgId)
}

/**
 * Attach a signed-in account to its roster row, by email.
 *
 * A User is somebody who can sign in; a Member is somebody on the club roster.
 * Most members never sign in, and some users are not on the roster at all, so
 * the two are separate — but a member opening the portal to pay their
 * subscription has to be recognised as themselves.
 *
 * Only ever called for a verified address — see emailIsVerified. Where the
 * email is not verified, the member claims their student ID instead and an
 * exco member confirms it. It is matched case-insensitively and only where exactly one
 * unlinked row carries it, so a shared or duplicated address links nobody and
 * the exco is left to sort it out.
 */
async function linkRosterMember(userId: string, email: string): Promise<void> {
  const already = await dbAdmin.member.findFirst({ where: { userId }, select: { id: true } })
  if (already) return

  // Only rosters this account belongs to. Searching every organisation would
  // attach somebody to a club they have never joined the moment a second one
  // exists — including in the case just above, where the auto-join declined
  // to pick an organisation precisely because it could not tell which.
  const orgIds = await activeOrgIds(userId)
  if (orgIds.length === 0) return

  const candidates = await dbAdmin.member.findMany({
    where: {
      orgId: { in: orgIds },
      email: { equals: email, mode: 'insensitive' },
      userId: null,
    },
    select: { id: true },
    take: 2,
  })
  if (candidates.length !== 1) return

  await dbAdmin.member.update({ where: { id: candidates[0].id }, data: { userId } })
}

// Single-club deployments auto-join new accounts as MEMBER. Role permissions
// and RLS keep financial and roster data restricted to EXCO.
async function joinDefaultOrganisation(
  userId: string,
  email: string,
  verified: boolean
): Promise<void> {
  const existing = await dbAdmin.organisationMembership.findFirst({
    where: { userId },
    select: { id: true },
  })
  if (existing) {
    // Already in. Still run the bootstrap: with auto-join, the first exco now
    // arrives holding a MEMBER row, so it has to be able to upgrade one.
    if (verified) await bootstrapFirstExco(userId, email)
    return
  }

  // Exactly one organisation, or this is not a single-club deployment and
  // picking one would be a guess.
  const orgs = await dbAdmin.organisation.findMany({ select: { id: true }, take: 2 })
  if (orgs.length !== 1) return

  await dbAdmin.organisationMembership.create({
    data: { userId, orgId: orgs[0].id, role: 'MEMBER', isActive: true },
  })

  // Promotion to exco by email is only as good as the email. Unverified, it
  // is a sign-up form that makes whoever types the right address the club's
  // treasurer.
  if (verified) await bootstrapFirstExco(userId, email)

}

// Bootstrap is disabled once any active EXCO exists, runs only for a verified
// email (see emailIsVerified), and never reactivates a disabled membership.
async function bootstrapFirstExco(userId: string, email: string): Promise<void> {
  const allowed = (process.env.BOOTSTRAP_EXCO_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  if (!allowed.includes(email.toLowerCase())) return

  const anyExco = await dbAdmin.organisationMembership.findFirst({
    where: { role: 'EXCO', isActive: true },
    select: { id: true },
  })
  if (anyExco) return

  const membership = await dbAdmin.organisationMembership.findFirst({
    where: { userId, isActive: true },
    select: { id: true },
  })
  if (!membership) return

  await dbAdmin.organisationMembership.update({
    where: { id: membership.id },
    data: { role: 'EXCO', office: 'TREASURER' },
  })

  console.warn(
    `[bootstrap] promoted ${email} to EXCO (treasurer) as the club's first. ` +
      'Unset BOOTSTRAP_EXCO_EMAILS now.',
  )
}

function displayName(authUser: SupabaseUser, email: string): string {
  const meta = authUser.user_metadata ?? {}
  const candidates = [meta.name, meta.full_name, meta.preferred_username]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }

  return email.split('@')[0]
}
