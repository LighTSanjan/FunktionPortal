import 'server-only'

import { dbAdmin } from '@/core/db/admin'

/**
 * Whether this login holds nothing the club would miss: no roster row, no
 * exco role, no payment, no form sent. Only such a login can be removed by
 * the person holding it.
 */
export async function isEmptyLogin(userId: string): Promise<boolean> {
  const [member, exco, payment, response] = await Promise.all([
    dbAdmin.member.findFirst({ where: { userId }, select: { id: true } }),
    dbAdmin.organisationMembership.findFirst({ where: { userId, role: 'EXCO' }, select: { id: true } }),
    dbAdmin.feePayment.findFirst({ where: { declaredByUserId: userId }, select: { id: true } }),
    dbAdmin.membershipResponse.findFirst({ where: { userId }, select: { id: true } }),
  ])
  return !member && !exco && !payment && !response
}
