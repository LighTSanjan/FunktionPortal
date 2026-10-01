'use server'

/** The exco handling responses: putting people on the roster, removing a response, releasing a held payment. */
import { z } from 'zod'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { lockTermFees, writeDeclaration } from '@/modules/fees/declaration'
import { discardProof } from '@/modules/fees/proof'
import { revalidateForm, type FormActionState } from './action-state'

const matchSchema = z.object({
  responseId: z.string().min(1),
  target: z.string().min(1, 'Pick a roster row, or add them as new'),
})

/**
 * Put a response from somebody who was not linked on the roster.
 *
 * Either against an existing row — the exco know the person, and see why the
 * portal thinks it is them — or as a new member. Their account is linked to
 * the row, and any payment held on the response moves to the row, to be
 * checked like every other.
 */
export async function matchResponse(
  orgSlug: string,
  _prev: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId: actorId } = await requirePermission(org.id, 'org.manage_members')

  const parsed = matchSchema.safeParse({
    responseId: formData.get('responseId') ?? '',
    target: formData.get('target') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Pick a roster row' }

  type Outcome = { problem: string } | { problem: null; message: string }
  const outcome = await dbAs(actorId, async (tx): Promise<Outcome> => {
    const found = await tx.membershipResponse.findFirst({
      where: { id: parsed.data.responseId, orgId: org.id },
      select: { termId: true },
    })
    if (!found) return { problem: 'That response has been removed.' }
    await lockTermFees(tx, found.termId)

    const response = await tx.membershipResponse.findFirstOrThrow({ where: { id: parsed.data.responseId } })
    if (response.memberId) return { problem: 'That response is already on the roster.' }

    const membership = await tx.organisationMembership.findUnique({
      where: { userId_orgId: { userId: response.userId, orgId: org.id } },
      select: { isActive: true },
    })
    if (!membership?.isActive) return { problem: 'That account is no longer a member of the club.' }

    const linked = await tx.member.findFirst({ where: { userId: response.userId }, select: { id: true, orgId: true, fullName: true } })

    let memberId: string
    let memberName: string
    if (parsed.data.target === 'NEW') {
      if (linked) {
        return { problem: `That account is already ${linked.fullName} on the roster. Match the response to them.` }
      }
      if (response.studentId) {
        const clash = await tx.member.findFirst({
          where: { orgId: org.id, studentId: response.studentId },
          select: { fullName: true },
        })
        if (clash) {
          return {
            problem: `${clash.fullName} is already on the roster with student ID ${response.studentId}. Match them to that row, or check with both people.`,
          }
        }
      }
      const created = await tx.member.create({
        data: {
          orgId: org.id,
          fullName: response.fullName,
          studentId: response.studentId,
          email: response.email,
          userId: response.userId,
          birthDay: response.birthDay,
          birthMonth: response.birthMonth,
          birthYear: response.birthYear,
          graduationYear: response.graduationYear,
        },
        select: { id: true, fullName: true },
      })
      memberId = created.id
      memberName = created.fullName
      await writeAudit(
        {
          orgId: org.id,
          actorId,
          action: 'member.add_from_form',
          targetType: 'Member',
          targetId: created.id,
          after: { fullName: created.fullName, userId: response.userId },
        },
        tx
      )
    } else {
      const member = await tx.member.findFirst({
        where: { id: parsed.data.target, orgId: org.id },
        select: { id: true, fullName: true, userId: true },
      })
      if (!member) return { problem: 'That roster row no longer exists.' }
      if (member.userId && member.userId !== response.userId) {
        return { problem: `${member.fullName} is already linked to a different account.` }
      }
      if (linked && linked.id !== member.id) {
        return { problem: `That account is already ${linked.fullName} on the roster.` }
      }
      const decided = await tx.feePayment.findFirst({
        where: { memberId: member.id, confirmedByUserId: response.userId },
        select: { id: true },
      })
      if (decided) {
        return {
          problem: 'That account confirmed a payment for this roster row, so linking it would make that its own fee. Undo the payment first.',
        }
      }
      if (!member.userId) {
        await tx.member.update({
          where: { id: member.id },
          data: { userId: response.userId },
        })
        await writeAudit(
          {
            orgId: org.id,
            actorId,
            action: 'member.link_account',
            targetType: 'Member',
            targetId: member.id,
            after: { userId: response.userId, memberName: member.fullName, via: 'membership form' },
          },
          tx
        )
      }
      memberId = member.id
      memberName = member.fullName
    }

    await tx.membershipResponse.update({
      where: { id: response.id },
      data: { memberId, matchedById: actorId, matchedAt: new Date() },
    })

    let message = `${response.fullName} is on the roster as ${memberName}.`
    if (response.heldProofPath) {
      const moved = await writeDeclaration(tx, {
        orgId: org.id,
        termId: response.termId,
        memberId,
        declaredByUserId: response.userId,
        actorId,
        reference: response.heldReference ?? '',
        proofPath: response.heldProofPath,
        declaredAt: response.heldAt ?? response.submittedAt,
      })
      if (moved.written) {
        await tx.membershipResponse.update({
          where: { id: response.id },
          data: { heldReference: null, heldProofPath: null, heldAmountCents: null, heldAt: null },
        })
        message += ' Their payment is waiting to be checked.'
      } else {
        // Kept on the response, so the screenshot is not lost with the reason.
        message +=
          moved.reason === 'DECIDED'
            ? ' They had already paid, so the payment on their response was not moved. Check whether it was sent twice.'
            : ' They owe nothing this term, so the payment on their response was not moved.'
      }
    }

    await writeAudit(
      {
        orgId: org.id,
        actorId,
        action: 'form.match',
        targetType: 'MembershipResponse',
        targetId: response.id,
        after: { memberId, new: parsed.data.target === 'NEW' },
      },
      tx
    )
    return { problem: null, message }
  })

  if (outcome.problem !== null) return { error: outcome.problem }
  revalidateForm(orgSlug)
  return { error: null, ok: true, message: outcome.message }
}

/**
 * Remove a response — a duplicate, or somebody who is not joining after all.
 * A payment held on it goes with it, screenshot included, so that takes a
 * reason — what happened to the money — exactly as clearing one does. A
 * payment already on the roster stays where it is.
 */
export async function removeResponse(orgSlug: string, responseId: string, reason = ''): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')
  const why = reason.trim()
  if (why.length > 300) return { error: 'Keep it under 300 characters.' }

  const outcome = await dbAs(userId, async (tx) => {
    const found = await tx.membershipResponse.findFirst({
      where: { id: responseId, orgId: org.id },
      select: { termId: true },
    })
    if (!found) return { problem: null, proof: null }
    await lockTermFees(tx, found.termId)
    // Read again under the lock: a payment may have landed on it meanwhile.
    const response = await tx.membershipResponse.findFirst({
      where: { id: responseId, orgId: org.id },
      select: { id: true, fullName: true, memberId: true, heldProofPath: true, heldAmountCents: true, heldReference: true },
    })
    if (!response) return { problem: null, proof: null }
    if (response.heldProofPath && why.length < 3) {
      return { problem: 'It holds a payment. Say what happened to the money, e.g. refunded on 20 Sep.', proof: null }
    }
    await tx.membershipResponse.delete({ where: { id: response.id } })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'form.response_remove',
        targetType: 'MembershipResponse',
        targetId: response.id,
        before: {
          fullName: response.fullName,
          memberId: response.memberId,
          heldPayment: Boolean(response.heldProofPath),
          ...(response.heldProofPath ? { amountCents: response.heldAmountCents, reference: response.heldReference } : {}),
        },
        ...(why ? { after: { reason: why } } : {}),
      },
      tx
    )
    return { problem: null, proof: response.heldProofPath }
  })

  if (outcome.problem) return { error: outcome.problem }
  if (outcome.proof) await discardProof(outcome.proof)
  revalidateForm(orgSlug)
  return { error: null, ok: true }
}

/**
 * Let go of a payment held on a response that could not move to the roster —
 * somebody who had already paid, or owes nothing. The exco say what they did
 * about the money (refunded, or it was the same payment twice), and it is
 * audited. The screenshot goes with it.
 */
export async function clearHeldPayment(
  orgSlug: string,
  _prev: FormActionState,
  formData: FormData
): Promise<FormActionState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')
  const responseId = String(formData.get('responseId') ?? '')
  const reason = String(formData.get('reason') ?? '').trim()
  if (reason.length < 3) return { error: 'Say what happened to the money, e.g. refunded on 20 Sep.' }
  if (reason.length > 300) return { error: 'Keep it under 300 characters.' }

  const outcome = await dbAs(userId, async (tx) => {
    const found = await tx.membershipResponse.findFirst({ where: { id: responseId, orgId: org.id }, select: { termId: true } })
    if (!found) return { problem: 'That response has been removed.' }
    await lockTermFees(tx, found.termId)
    const response = await tx.membershipResponse.findFirstOrThrow({ where: { id: responseId } })
    if (!response.heldProofPath) return { problem: null, proof: null }
    if (!response.memberId) return { problem: 'Put them on the roster first. Their payment moves across when you do.' }
    await tx.membershipResponse.update({
      where: { id: response.id },
      data: { heldReference: null, heldProofPath: null, heldAmountCents: null, heldAt: null },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'form.held_payment_cleared',
        targetType: 'MembershipResponse',
        targetId: response.id,
        before: { amountCents: response.heldAmountCents, reference: response.heldReference },
        after: { reason },
      },
      tx
    )
    return { problem: null, proof: response.heldProofPath }
  })

  if (outcome.problem) return { error: outcome.problem }
  if (outcome.proof) await discardProof(outcome.proof)
  revalidateForm(orgSlug)
  return { error: null, ok: true, message: 'Held payment cleared.' }
}
