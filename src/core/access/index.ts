import 'server-only'

import { dbAdmin } from '@/core/db/admin'
import { dbAs } from '@/core/db'
import { writeAudit } from '@/core/audit'
import type { ExcoOffice, OrgRole } from '@prisma/client'

export const REQUEST_TTL_DAYS = 21

export interface AccessRequestRow {
  id: string
  userId: string
  userName: string
  userEmail: string
  requestedRole: OrgRole
  requestedOffice: ExcoOffice | null
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  createdAt: Date
  expiresAt: Date
  reviewedByName: string | null
  reviewedAt: Date | null
  decisionNote: string | null
}

const WITH_PEOPLE = {
  user: { select: { name: true, email: true } },
  reviewedBy: { select: { name: true } },
} as const

/** Return the exco access queue, pending requests first. */
export async function listAccessRequests(orgId: string): Promise<AccessRequestRow[]> {
  const rows = await dbAdmin.accessRequest.findMany({
    where: { orgId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: WITH_PEOPLE,
  })
  return rows.map(toRow)
}

export async function getOwnAccessRequest(
  orgId: string,
  userId: string
): Promise<AccessRequestRow | null> {
  const row = await dbAdmin.accessRequest.findFirst({
    where: { orgId, userId },
    orderBy: { createdAt: 'desc' },
    include: WITH_PEOPLE,
  })
  return row ? toRow(row) : null
}

export async function countPendingRequests(orgId: string): Promise<number> {
  return dbAdmin.accessRequest.count({
    where: { orgId, status: 'PENDING', expiresAt: { gt: new Date() } },
  })
}

type Row = Awaited<ReturnType<typeof dbAdmin.accessRequest.findMany>>[number] & {
  user: { name: string; email: string }
  reviewedBy: { name: string } | null
}

function toRow(row: Row): AccessRequestRow {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.name,
    userEmail: row.user.email,
    requestedRole: row.requestedRole,
    requestedOffice: row.requestedOffice,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    reviewedByName: row.reviewedBy?.name ?? null,
    reviewedAt: row.reviewedAt,
    decisionNote: row.decisionNote,
  }
}

export const OFFICE_LABELS: Record<ExcoOffice, string> = {
  PRESIDENT: 'President',
  VICE_PRESIDENT: 'Vice-President',
  TREASURER: 'Treasurer',
  ASSISTANT_TREASURER: 'Assistant Treasurer',
  SECRETARY: 'Secretary',
  OTHER: 'Other',
}

export async function getMembership(orgId: string, userId: string) {
  return dbAdmin.organisationMembership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { role: true, office: true, isActive: true },
  })
}

export async function createAccessRequest(args: {
  orgId: string
  userId: string
  requestedOffice: ExcoOffice
  reason: string
  expiresAt: Date
}): Promise<{ id: string }> {
  return dbAs(args.userId, async (tx) => {
    const request = await tx.accessRequest.create({
      data: {
        orgId: args.orgId,
        userId: args.userId,
        requestedRole: 'EXCO',
        requestedOffice: args.requestedOffice,
        reason: args.reason,
        expiresAt: args.expiresAt,
      },
      select: { id: true },
    })
    await writeAudit({
      orgId: args.orgId,
      actorId: args.userId,
      action: 'access.request',
      targetType: 'AccessRequest',
      targetId: request.id,
      after: { requestedRole: 'EXCO', requestedOffice: args.requestedOffice },
    }, tx)
    return request
  })
}

export async function cancelOwnRequest(
  orgId: string,
  userId: string,
  requestId: string
): Promise<number> {
  return dbAs(userId, async (tx) => {
    const { count } = await tx.accessRequest.updateMany({
      where: { id: requestId, orgId, userId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    })
    if (count === 1) {
      await writeAudit({
        orgId,
        actorId: userId,
        action: 'access.withdraw',
        targetType: 'AccessRequest',
        targetId: requestId,
        before: { status: 'PENDING' },
        after: { status: 'CANCELLED' },
      }, tx)
    }
    return count
  })
}

export async function findRequest(orgId: string, requestId: string) {
  return dbAdmin.accessRequest.findFirst({ where: { id: requestId, orgId } })
}

/**
 * Settle a request, its membership change and its audit row atomically.
 *
 * The request is re-read and claimed inside the transaction — pending, in
 * this organisation, unexpired — so two exco members deciding at once cannot
 * leave a membership promoted under a request marked refused. The role and
 * office granted come from that row, never from an earlier read. Returns
 * false if somebody else settled it first.
 */
export async function settleRequest(args: {
  orgId: string
  requestId: string
  reviewerUserId: string
  decision: 'APPROVED' | 'REJECTED'
  decisionNote: string | null
}): Promise<{ settled: false } | { settled: true; subjectUserId: string; grantRole: OrgRole; grantOffice: ExcoOffice | null }> {
  return dbAs(args.reviewerUserId, async (tx) => {
    const claimed = await tx.accessRequest.updateMany({
      where: {
        id: args.requestId,
        orgId: args.orgId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        userId: { not: args.reviewerUserId },
      },
      data: {
        status: args.decision,
        reviewedByUserId: args.reviewerUserId,
        reviewedAt: new Date(),
        decisionNote: args.decisionNote,
      },
    })
    if (claimed.count !== 1) return { settled: false as const }

    const request = await tx.accessRequest.findUniqueOrThrow({ where: { id: args.requestId } })
    const approved = args.decision === 'APPROVED'

    if (approved) {
      await tx.organisationMembership.update({
        where: { userId_orgId: { userId: request.userId, orgId: args.orgId } },
        data: { role: request.requestedRole, office: request.requestedOffice },
      })
    }

    await writeAudit(
      {
        orgId: args.orgId,
        actorId: args.reviewerUserId,
        action: approved ? 'access.approve' : 'access.reject',
        targetType: 'AccessRequest',
        targetId: request.id,
        before: { status: 'PENDING' },
        after: {
          status: args.decision,
          subjectUserId: request.userId,
          grantedRole: approved ? request.requestedRole : null,
          grantedOffice: approved ? request.requestedOffice : null,
        },
      },
      tx
    )

    return {
      settled: true as const,
      subjectUserId: request.userId,
      grantRole: request.requestedRole,
      grantOffice: request.requestedOffice,
    }
  })
}
