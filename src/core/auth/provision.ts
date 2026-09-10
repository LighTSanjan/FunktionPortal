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

  await joinDefaultOrganisation(authUser.id, email)
}

// Single-club deployments auto-join new accounts as MEMBER. Role permissions
// and RLS keep financial and roster data restricted to EXCO.
async function joinDefaultOrganisation(userId: string, email: string): Promise<void> {
  const existing = await dbAdmin.organisationMembership.findFirst({
    where: { userId },
    select: { id: true },
  })
  if (existing) {
    // Already in. Still run the bootstrap: with auto-join, the first exco now
    // arrives holding a MEMBER row, so it has to be able to upgrade one.
    await bootstrapFirstExco(userId, email)
    return
  }

  // Exactly one organisation, or this is not a single-club deployment and
  // picking one would be a guess.
  const orgs = await dbAdmin.organisation.findMany({ select: { id: true }, take: 2 })
  if (orgs.length !== 1) return

  await dbAdmin.organisationMembership.create({
    data: { userId, orgId: orgs[0].id, role: 'MEMBER', isActive: true },
  })

  await bootstrapFirstExco(userId, email)

}

// Bootstrap is disabled once any active EXCO exists. It trusts only the email
// verified by Supabase and never reactivates a disabled membership.
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
