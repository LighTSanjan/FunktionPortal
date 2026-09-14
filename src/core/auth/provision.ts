import 'server-only'

import type { User as SupabaseUser } from '@supabase/supabase-js'
import { dbAdmin } from '@/core/db/admin'
import type { EmailProof } from './proof'
import { isAllowedDomain, normaliseEmail, pendingInvitation } from './eligibility'

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
    await linkRosterMember(authUser.id, email)
  }

  return { proven, newlyProven: proven && !provenBefore }
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
 * Only ever called for a proven address. Where the roster has no email for
 * somebody, they claim their student ID instead and an exco member confirms
 * it. It is matched case-insensitively and only where exactly one unlinked row
 * carries it, so a shared or duplicated address links nobody and the exco is
 * left to sort it out.
 */
async function linkRosterMember(userId: string, email: string): Promise<void> {
  const already = await dbAdmin.member.findFirst({ where: { userId }, select: { id: true } })
  if (already) return

  // Only rosters this account belongs to. Searching every organisation would
  // attach somebody to a club they have never joined.
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
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 120)
  }

  return email.split('@')[0]
}
