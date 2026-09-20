import 'server-only'

import type { User as SupabaseUser } from '@supabase/supabase-js'
import { dbAdmin } from '@/core/db/admin'
import type { EmailProof } from './proof'
import { isAllowedDomain, normaliseEmail, pendingInvitation } from './eligibility'
import { linkAccountToRoster } from './roster-link'
import { alert } from '@/core/alerts'
import { logEvent } from '@/core/observability/logger'

export interface ProvisionResult {
  /** The address is proven for this account, now or from an earlier sign-in. */
  proven: boolean
  /**
   * This sign-in is what proved it. Whoever held the account before — which,
   * while "Confirm email" is off, may have been somebody who signed up as
   * this address — has to be shut out now: see secureProvenAccount.
   */
  newlyProven: boolean
}

/**
 * Mirror auth.users into public.users, and decide what the account may do.
 *
 * `proof` is what the request that called this has just seen — an emailed
 * code, or a provider that vouched for the address (core/auth/proof.ts). It
 * is never inferred from the Supabase user, whose email_confirmed_at is
 * stamped for any password sign-up while "Confirm email" is off.
 *
 * Only a proven address joins the club, is linked to its roster row, accepts
 * an invitation, or can bootstrap the first exco.
 */
export async function provisionUser(
  authUser: SupabaseUser,
  proof: EmailProof | null
): Promise<ProvisionResult> {
  const email = authUser.email
  if (!email) {
    // Every sign-in route the portal offers yields an email. If one ever does
    // not, failing loudly beats writing a user row with a synthesised address
    // that no invitation will ever match against.
    throw new Error(`Supabase user ${authUser.id} has no email address`)
  }

  const existing = await dbAdmin.user.findUnique({
    where: { id: authUser.id },
    select: { email: true, emailProvenAt: true },
  })

  // Proof is of an address. If the account's address has changed since, the
  // old proof says nothing about the new one.
  const sameAddress = existing ? normaliseEmail(existing.email) === normaliseEmail(email) : false
  const provenBefore = Boolean(existing?.emailProvenAt) && sameAddress
  const proven = provenBefore || proof !== null
  const now = new Date()

  if (existing) {
    await dbAdmin.user.update({
      where: { id: authUser.id },
      // `isActive` is deliberately not touched. It is how the exco disables
      // someone, and a disabled account that could re-enable itself by
      // signing in again would not be disabled at all.
      //
      // Nor is `name`: it comes from sign-up metadata anybody can set, and
      // it is printed under signatures. After the first sign-in it is the
      // person's to edit on their profile, where the change is audited.
      data: {
        email,
        ...(proof
          ? { emailProvenAt: now, emailProvenVia: proof.method }
          : sameAddress
            ? {}
            : { emailProvenAt: null, emailProvenVia: null }),
      },
    })
  } else {
    await dbAdmin.user.create({
      data: {
        id: authUser.id,
        email,
        name: displayName(authUser, email),
        ...(proof ? { emailProvenAt: now, emailProvenVia: proof.method } : {}),
      },
    })
  }

  if (proven) {
    await joinClub(authUser.id, email)
    await linkAccountToRoster(authUser.id, email)
  }

  return { proven, newlyProven: proven && !provenBefore }
}

/**
 * Give a proven address its membership, if it is entitled to one.
 *
 * An invitation wins, because it names the club. Otherwise a university
 * address joins the deployment's one club. Anybody else keeps their account
 * and sees the "ask the exco to invite you" screen.
 *
 * An invitation always grants MEMBER, whatever its role column says: exco is
 * granted on the access screen, by an exco member, as its own audited act.
 */
async function joinClub(userId: string, email: string): Promise<void> {
  const existing = await dbAdmin.organisationMembership.findFirst({
    where: { userId },
    select: { id: true },
  })
  if (existing) {
    // Already in — or disabled, which only the exco can undo. Still run the
    // bootstrap: the first exco arrives holding a MEMBER row.
    await bootstrapFirstExco(userId, email)
    return
  }

  const invitation = await pendingInvitation(email)
  if (invitation) {
    await dbAdmin.$transaction(async (tx) => {
      // Claimed inside the transaction, so two sign-ins racing on one
      // invitation cannot both spend it.
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, status: 'PENDING', expiresAt: { gt: new Date() } },
        data: { status: 'ACCEPTED' },
      })
      if (claimed.count !== 1) return
      await tx.organisationMembership.create({
        data: { userId, orgId: invitation.orgId, role: 'MEMBER', isActive: true },
      })
    })
  } else if (isAllowedDomain(email)) {
    // Exactly one organisation, or this is not a single-club deployment and
    // picking one would be a guess.
    const orgs = await dbAdmin.organisation.findMany({ select: { id: true }, take: 2 })
    if (orgs.length !== 1) return
    await dbAdmin.organisationMembership.create({
      data: { userId, orgId: orgs[0].id, role: 'MEMBER', isActive: true },
    })
  } else {
    return
  }

  await bootstrapFirstExco(userId, email)
}

// Bootstrap is disabled once any active EXCO exists, runs only for a proven
// address, and never reactivates a disabled membership.
async function bootstrapFirstExco(userId: string, email: string): Promise<void> {
  const allowed = (process.env.BOOTSTRAP_EXCO_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  if (!allowed.includes(email.toLowerCase())) return

  const promoted = await dbAdmin.$transaction(async (tx) => {
    // Two first sign-ins must not both see an empty exco table and promote
    // themselves. This lock exists only for the few milliseconds of bootstrap.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('funktion:first-exco-bootstrap'))`

    const anyExco = await tx.organisationMembership.findFirst({
      where: { role: 'EXCO', isActive: true },
      select: { id: true },
    })
    if (anyExco) return null

    const membership = await tx.organisationMembership.findFirst({
      where: { userId, isActive: true },
      select: { id: true, orgId: true, organisation: { select: { slug: true } } },
    })
    if (!membership) return null

    await tx.organisationMembership.update({
      where: { id: membership.id },
      data: { role: 'EXCO', office: 'TREASURER' },
    })
    await tx.auditLog.create({
      data: {
        orgId: membership.orgId,
        actorId: userId,
        action: 'access.bootstrap_exco',
        targetType: 'OrganisationMembership',
        targetId: membership.id,
        before: { role: 'MEMBER', office: null },
        after: { role: 'EXCO', office: 'TREASURER' },
        metadata: { configuredAllowlist: true },
      },
    })
    return { membershipId: membership.id, orgSlug: membership.organisation.slug }
  })

  if (!promoted) return
  logEvent('warn', 'access.first_exco_bootstrapped', { membershipId: promoted.membershipId })
  await alert(
    'exco_granted',
    { club: promoted.orgSlug, office: 'TREASURER', what: 'first-exco bootstrap' },
    { eventId: `first-exco:${promoted.membershipId}` }
  )
}

function displayName(authUser: SupabaseUser, email: string): string {
  const meta = authUser.user_metadata ?? {}
  const candidates = [meta.name, meta.full_name, meta.preferred_username]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 120)
  }

  return email.split('@')[0]
}
