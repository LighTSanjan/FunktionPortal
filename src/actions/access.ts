'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { verifySession, getOrgContext, requirePermission } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { alert } from '@/core/alerts'
import {
  REQUEST_TTL_DAYS,
  getMembership,
  createAccessRequest,
  cancelOwnRequest,
  findRequest,
  settleRequest,
} from '@/core/access'

export interface AccessActionState {
  error: string | null
  ok?: boolean
}

const OFFICES = [
  'PRESIDENT',
  'VICE_PRESIDENT',
  'TREASURER',
  'ASSISTANT_TREASURER',
  'SECRETARY',
  'OTHER',
] as const

const requestSchema = z.object({
  requestedOffice: z.enum(OFFICES),
  reason: z
    .string()
    .trim()
    .min(20, 'Say a bit more — an approver deciding from a name alone is an approver clicking yes')
    .max(1000, 'Keep it under 1000 characters'),
})

export async function requestAccess(
  orgSlug: string,
  _prev: AccessActionState,
  formData: FormData
): Promise<AccessActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()

  const parsed = requestSchema.safeParse({
    requestedOffice: formData.get('requestedOffice') ?? '',
    reason: formData.get('reason') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That request is not valid' }
  }

  const membership = await getMembership(org.id, userId)
  if (!membership?.isActive) return { error: 'You are not an active member of this club' }
  if (membership.role === 'EXCO') {
    return { error: 'You already have exco access. Ask an exco member to change your office.' }
  }

  const expiresAt = new Date(Date.now() + REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000)

  try {
    const created = await createAccessRequest({
      orgId: org.id,
      userId,
      requestedOffice: parsed.data.requestedOffice,
      reason: parsed.data.reason,
      expiresAt,
    })

    await writeAudit({
      orgId: org.id,
      actorId: userId,
      action: 'access.request',
      targetType: 'AccessRequest',
      targetId: created.id,
      after: { requestedRole: 'EXCO', requestedOffice: parsed.data.requestedOffice },
    })
  } catch {
    // The partial unique index on (org, user) WHERE status = 'PENDING'.
    return { error: 'You already have a request waiting. Withdraw it before raising another.' }
  }

  revalidatePath(`/${orgSlug}/access`)
  return { error: null, ok: true }
}

/** Withdraw your own pending request. */
export async function withdrawAccessRequest(
  orgSlug: string,
  requestId: string
): Promise<AccessActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()

  const cancelled = await cancelOwnRequest(org.id, userId, requestId)
  if (cancelled === 0) return { error: 'That request is no longer open' }

  revalidatePath(`/${orgSlug}/access`)
  return { error: null, ok: true }
}

const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  decisionNote: z.string().trim().max(1000).optional(),
})

// Membership and request status change in one transaction inside settleRequest().
export async function decideAccessRequest(
  orgSlug: string,
  requestId: string,
  _prev: AccessActionState,
  formData: FormData
): Promise<AccessActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'org.manage_members')

  const parsed = decisionSchema.safeParse({
    decision: formData.get('decision') ?? '',
    decisionNote: formData.get('decisionNote') ?? undefined,
  })
  if (!parsed.success) return { error: 'That decision is not valid' }

  const request = await findRequest(org.id, requestId)
  if (!request) return { error: 'That request no longer exists' }
  if (request.status !== 'PENDING') return { error: 'That request has already been settled' }

  // The database enforces this too (access_requests_reviewer_is_not_requester),
  // but failing here gives a sentence rather than a constraint violation.
  if (request.userId === userId) {
    return { error: 'You cannot decide your own request. Another exco member has to.' }
  }
  if (request.expiresAt < new Date()) {
    return { error: 'That request has expired. Ask them to raise a new one.' }
  }

  const outcome = await settleRequest({
    orgId: org.id,
    requestId: request.id,
    reviewerUserId: userId,
    decision: parsed.data.decision,
    decisionNote: parsed.data.decisionNote || null,
  })
  if (!outcome.settled) return { error: 'Somebody else has just settled that request.' }

  if (parsed.data.decision === 'APPROVED') {
    await alert('exco_granted', { office: outcome.grantOffice, club: org.slug })
  }

  revalidatePath(`/${orgSlug}/settings/access`)
  return { error: null, ok: true }
}
