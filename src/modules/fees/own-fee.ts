/**
 * Who may decide their own fee.
 *
 * Nobody, as a rule: a second exco member confirms, refuses or records it.
 * The president and treasurer are the exception. The club's two officers
 * answer for the collection either way, and on an exco this size there is
 * often nobody else with the time to check theirs. The database holds the
 * same rule (app_decides_own_fee), and every decision is audited.
 */
import 'server-only'
import type { ExcoOffice } from '@prisma/client'
import { getMembership } from '@/core/access'

export const OFFICES_DECIDING_OWN_FEE: ExcoOffice[] = ['PRESIDENT', 'TREASURER']

export async function decidesOwnFee(orgId: string, userId: string): Promise<boolean> {
  const membership = await getMembership(orgId, userId)
  return Boolean(
    membership?.isActive &&
      membership.role === 'EXCO' &&
      membership.office &&
      OFFICES_DECIDING_OWN_FEE.includes(membership.office)
  )
}
