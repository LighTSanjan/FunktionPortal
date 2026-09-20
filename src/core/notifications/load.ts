import 'server-only'

import type { OrgRole } from '@prisma/client'
import { countPendingRequests } from '@/core/access'
import { dbAs } from '@/core/db'
import type { PortalNotification } from './types'

const DAY = 24 * 60 * 60 * 1000

/**
 * Small, live queue for the global bell.
 *
 * These are unresolved jobs, not pretend "unread" messages. An item vanishes
 * when the underlying work is completed, so the count cannot drift away from
 * the records it represents.
 */
export async function loadPortalNotifications({
  userId,
  orgId,
  orgSlug,
  role,
  now = new Date(),
}: {
  userId: string
  orgId: string
  orgSlug: string
  role: OrgRole
  now?: Date
}): Promise<PortalNotification[]> {
  if (role !== 'EXCO') return []

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [pendingAccess, work] = await Promise.all([
    countPendingRequests(orgId),
    dbAs(userId, async (tx) => {
      // Kept sequential inside the user-scoped transaction. Some Postgres
      // drivers queue concurrent queries on one connection with a warning.
      const overdueInvoices = await tx.invoice.count({
        where: {
          orgId,
          status: { in: ['GENERATED', 'SIGNED'] },
          submittedToOslAt: null,
          submissionDueAt: { lt: now },
        },
      })
      const declaredPayments = await tx.feePayment.groupBy({
        by: ['termId'],
        where: { orgId, status: 'DECLARED' },
        _count: { _all: true },
      })
      const pendingClaims = await tx.user.count({
        where: {
          claimedStudentId: { not: null },
          memberships: { some: { orgId, isActive: true } },
          member: null,
        },
      })
      const unmatchedResponses = await tx.membershipResponse.groupBy({
        by: ['termId'],
        where: { orgId, memberId: null, term: { closedAt: null } },
        _count: { _all: true },
      })
      const terms = await tx.term.findMany({
        where: { orgId },
        select: { id: true, name: true },
      })
      const sessionsThisMonth = await tx.classSession.count({
        where: { orgId, heldOn: { gte: monthStart, lt: monthEnd } },
      })

      return { overdueInvoices, declaredPayments, pendingClaims, unmatchedResponses, terms, sessionsThisMonth }
    }),
  ])

  const items: PortalNotification[] = []
  const termName = new Map(work.terms.map((term) => [term.id, term.name]))

  if (pendingAccess > 0) {
    items.push({
      id: 'access-requests',
      tone: 'urgent',
      title: `${pendingAccess} access request${pendingAccess === 1 ? '' : 's'} waiting`,
      detail: 'Another exco member must approve or reject each request.',
      href: `/${orgSlug}/settings/access`,
    })
  }

  if (work.overdueInvoices > 0) {
    items.push({
      id: 'overdue-invoices',
      tone: 'urgent',
      title: `${work.overdueInvoices} coach document${work.overdueInvoices === 1 ? '' : 's'} overdue`,
      detail: 'Generated coach claims have passed their OSL submission date.',
      href: `/${orgSlug}/monthly-run`,
    })
  }

  for (const row of work.declaredPayments) {
    const count = row._count._all
    items.push({
      id: `declared-payments-${row.termId}`,
      tone: 'attention',
      title: `${count} fee payment${count === 1 ? '' : 's'} to check`,
      detail: `Match ${termName.get(row.termId) ?? 'the term'} declarations to the bank statement.`,
      href: `/${orgSlug}/fees/collection?term=${row.termId}&tab=payments&show=check`,
    })
  }

  if (work.pendingClaims > 0) {
    items.push({
      id: 'pending-roster-claims',
      tone: 'attention',
      title: `${work.pendingClaims} member${work.pendingClaims === 1 ? '' : 's'} waiting for a roster match`,
      detail: 'Confirm their student ID so they can see and pay what they owe.',
      href: `/${orgSlug}/fees/collection?tab=responses`,
    })
  }

  for (const row of work.unmatchedResponses) {
    const count = row._count._all
    items.push({
      id: `unmatched-responses-${row.termId}`,
      tone: 'attention',
      title: `${count} membership response${count === 1 ? '' : 's'} to match`,
      detail: `Put ${termName.get(row.termId) ?? 'the term'} responses on the roster.`,
      href: `/${orgSlug}/fees/collection?term=${row.termId}&tab=responses`,
    })
  }

  if (now.getDate() >= 20 && work.sessionsThisMonth === 0) {
    const daysLeft = Math.max(0, Math.ceil((monthEnd.getTime() - now.getTime()) / DAY))
    items.push({
      id: 'no-sessions-this-month',
      tone: 'info',
      title: 'No classes recorded this month',
      detail: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left before the month closes.`,
      href: `/${orgSlug}/sessions`,
    })
  }

  return items
}
