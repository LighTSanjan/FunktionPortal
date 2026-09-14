'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { isAllowedDomain, normaliseEmail } from '@/core/auth/eligibility'
import { dbAs } from '@/core/db'
import { writeAudit } from '@/core/audit'
import { alert } from '@/core/alerts'

/**
 * Letting in somebody without a university address.
 *
 * An invitation is an address the exco vouch for: the first time that
 * address signs in and proves it holds the inbox, it joins the club as a
 * member and the invitation is spent. It grants MEMBER only; exco access is
 * still granted on the access screen.
 */
export interface InvitationState {
  error: string | null
  invited?: string
}

const INVITATION_DAYS = 30

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('That does not look like an email address'),
})

export async function inviteByEmail(
  orgSlug: string,
  _prev: InvitationState,
  formData: FormData
): Promise<InvitationState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'org.manage_members')

  const parsed = inviteSchema.safeParse({ email: formData.get('email') ?? '' })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'That address is not valid' }
  const email = normaliseEmail(parsed.data.email)

  if (isAllowedDomain(email)) {
    return { error: 'SUTD addresses do not need an invitation. They can sign in already.' }
  }

  const error = await dbAs(userId, async (tx) => {
    const existingMember = await tx.organisationMembership.findFirst({
      where: { orgId: org.id, user: { email: { equals: email, mode: 'insensitive' } } },
      select: { id: true },
    })
    if (existingMember) return 'That address already has an account in the club.'

    const pending = await tx.invitation.findFirst({
      where: { orgId: org.id, email, status: 'PENDING', expiresAt: { gt: new Date() } },
      select: { id: true },
    })
    if (pending) return 'That address is already invited.'

    const invitation = await tx.invitation.create({
      data: {
        orgId: org.id,
        email,
        role: 'MEMBER',
        // Not used to sign in — the invitation is matched by proven address —
        // but the column is unique and required.
        token: randomBytes(24).toString('base64url'),
        expiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000),
      },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'invitation.create',
        targetType: 'Invitation',
        targetId: invitation.id,
        after: { email },
      },
      tx
    )
    return null
  })
  if (error) return { error }

  await alert('access_changed', { what: 'invitation sent', email })
  revalidatePath(`/${orgSlug}/settings/invitations`)
  return { error: null, invited: email }
}

export async function revokeInvitation(orgSlug: string, invitationId: string): Promise<void> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'org.manage_members')

  await dbAs(userId, async (tx) => {
    const revoked = await tx.invitation.updateMany({
      where: { id: invitationId, orgId: org.id, status: 'PENDING' },
      data: { status: 'REVOKED' },
    })
    if (revoked.count === 1) {
      await writeAudit(
        { orgId: org.id, actorId: userId, action: 'invitation.revoke', targetType: 'Invitation', targetId: invitationId },
        tx
      )
    }
  })
  revalidatePath(`/${orgSlug}/settings/invitations`)
}
