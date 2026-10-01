import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { dbAdmin } from '@/core/db/admin'
import { getOrgContext, verifySession } from './dal'

/**
 * Where somebody stands with the club, as far as the portal is concerned.
 *
 *   FULL     exco, or a member whose account is linked to their roster row
 *   WELCOME  signed in, not on the roster, hasn't said who they are yet
 *   JOINING  has said who they are, and waits for the exco to match them
 *
 * Anyone can sign in now — any proven address, Gmail included — so a MEMBER
 * role alone no longer means the club knows who this is. Until an exco member
 * links the account to a roster row, the portal shows it the welcome screen
 * and the join-and-pay form, nothing else.
 *
 * A typed student ID never moves anybody to FULL, and never grants a role:
 * student IDs are printed on every attendance sheet. The link is made either
 * from a proven SUTD address (roster-link.ts) or by an exco member.
 */
export type Standing = 'FULL' | 'WELCOME' | 'JOINING'

export const getStanding = cache(async (orgSlug: string): Promise<Standing> => {
  const { org, membership } = await getOrgContext(orgSlug)
  if (membership.role === 'EXCO') return 'FULL'

  const { userId } = await verifySession()
  const [member, user] = await Promise.all([
    dbAdmin.member.findFirst({ where: { orgId: org.id, userId }, select: { id: true } }),
    dbAdmin.user.findUnique({ where: { id: userId }, select: { onboardedAt: true } }),
  ])
  if (member) return 'FULL'
  return user?.onboardedAt ? 'JOINING' : 'WELCOME'
})

/** Where somebody who is not FULL belongs. */
function joiningHome(orgSlug: string, standing: Exclude<Standing, 'FULL'>): string {
  return standing === 'WELCOME' ? `/${orgSlug}/welcome` : `/${orgSlug}/fees`
}

/**
 * For a page only a full member may see. Called from the page itself, not
 * only the layout: a layout is kept across client-side navigation, so a check
 * there alone would let a link inside the portal walk straight past it.
 */
export async function requireFullMember(orgSlug: string): Promise<void> {
  const standing = await getStanding(orgSlug)
  if (standing !== 'FULL') redirect(joiningHome(orgSlug, standing))
}
