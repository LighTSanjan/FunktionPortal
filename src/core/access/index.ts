import 'server-only'

import { dbAdmin } from '@/core/db/admin'
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
  return dbAdmin.accessRequest.create({
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
}

export async function cancelOwnRequest(
  orgId: string,
  userId: string,
  requestId: string
): Promise<number> {
  const { count } = await dbAdmin.accessRequest.updateMany({
    where: { id: requestId, orgId, userId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  })
  return count
}

export async function findRequest(orgId: string, requestId: string) {
  return dbAdmin.accessRequest.findFirst({ where: { id: requestId, orgId } })
}

/** Settle a request and its membership change atomically. */
export async function settleRequest(args: {
  orgId: string
  requestId: string
  subjectUserId: string
  reviewerUserId: string
  decision: 'APPROVED' | 'REJECTED'
  decisionNote: string | null
  grantRole: OrgRole
  grantOffice: ExcoOffice | null
}): Promise<void> {
  await dbAdmin.$transaction(async (tx) => {
    await tx.accessRequest.update({
      where: { id: args.requestId },
      data: {
        status: args.decision,
        reviewedByUserId: args.reviewerUserId,
        reviewedAt: new Date(),
        decisionNote: args.decisionNote,
      },
    })

    if (args.decision === 'APPROVED') {
      await tx.organisationMembership.update({
        where: { userId_orgId: { userId: args.subjectUserId, orgId: args.orgId } },
        data: { role: args.grantRole, office: args.grantOffice },
      })
    }
  })
}
