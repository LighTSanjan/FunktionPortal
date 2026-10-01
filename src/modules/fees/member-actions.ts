'use server'

/** Who pays what: tying accounts to roster rows, and the exco setting a member's fee. */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { FeeTier } from '@prisma/client'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission, verifySession } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { resolveFee, TIER_LABEL } from './tiers'
import { discardProof } from './proof'
import { lockTermFees } from './declaration'
import { type FeeState } from './action-state'

const claimSchema = z.object({
  studentId: z
    .string()
    .transform((value) => value.replace(/\D/g, ''))
    .pipe(
      z
        .string()
        .min(5, 'That does not look like a student ID — it is the number on your student card')
        .max(12, 'That is longer than a student ID')
    ),
})

/**
 * An account saying which roster row it is, by student ID.
 *
 * Student IDs are unique and never change, which makes them the right key.
 * They are also printed on every attendance sheet and run in sequence, which
 * is why this links nothing: it records the claim, and an exco member — who
 * can see the roster row it matches and knows the person — confirms it.
 */
export async function claimStudentId(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()

  const parsed = claimSchema.safeParse({ studentId: String(formData.get('studentId') ?? '') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That student ID is not valid' }
  }

  const problem = await dbAs(userId, async (tx) => {
    const linked = await tx.member.findFirst({ where: { orgId: org.id, userId }, select: { id: true } })
    if (linked) return 'Your account is already linked to the roster.'

    await tx.user.update({
      where: { id: userId },
      data: { claimedStudentId: parsed.data.studentId, claimedStudentIdAt: new Date() },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'member.claim_student_id',
        targetType: 'User',
        targetId: userId,
        after: { studentId: parsed.data.studentId },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidatePath(`/${orgSlug}/fees`)
  revalidatePath(`/${orgSlug}/fees/collection`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}

const linkSchema = z.object({
  userId: z.string().min(1),
  memberId: z.string().min(1),
})

/**
 * Attach a signed-in account to a roster row by hand.
 *
 * Sign-in links itself when the account's email is the one the club already
 * holds, which covers most people. It does not cover somebody who signed up
 * with a personal address, and asking them to pick their own row would be
 * asking them to assert an identity — so the club does it, and it is audited.
 */
export async function linkMemberAccount(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId: actorId } = await requirePermission(org.id, 'org.manage_members')

  const parsed = linkSchema.safeParse({
    userId: formData.get('userId') ?? '',
    memberId: formData.get('memberId') ?? '',
  })
  if (!parsed.success) return { error: 'Pick both an account and a roster row' }

  const problem = await dbAs(actorId, async (tx) => {
    const member = await tx.member.findFirst({
      where: { id: parsed.data.memberId, orgId: org.id },
      select: { id: true, fullName: true, userId: true },
    })
    if (!member) return 'That roster row no longer exists'
    if (member.userId) return `${member.fullName} is already linked to an account.`

    // The roster row is scoped to this organisation; the account has to be
    // too. Without this an id posted from anywhere attaches a stranger's
    // account to a club roster row, and the rightful owner can never link.
    const membership = await tx.organisationMembership.findUnique({
      where: { userId_orgId: { userId: parsed.data.userId, orgId: org.id } },
      select: { isActive: true },
    })
    if (!membership?.isActive) return 'That account is not a member of this organisation.'

    const taken = await tx.member.findFirst({
      where: { orgId: org.id, userId: parsed.data.userId },
      select: { fullName: true },
    })
    const decided = await tx.feePayment.findFirst({
      where: { memberId: member.id, confirmedByUserId: parsed.data.userId },
      select: { id: true },
    })
    if (decided) {
      return 'That account confirmed a payment for this roster row, so linking it would make that its own fee. Undo the payment first.'
    }
    if (taken) {
      // One account, one roster row. Two would make "what do I owe" ambiguous
      // and let one person hold two subscriptions.
      return `That account is already linked to ${taken.fullName}.`
    }

    await tx.member.update({
      where: { id: member.id },
      data: { userId: parsed.data.userId },
    })
    // The claim is left on the account. It only ever surfaces for accounts
    // with no roster row, so once linked it stops showing — and the users
    // policy rightly will not let one person rewrite another's row to tidy it.
    await writeAudit(
      {
        orgId: org.id,
        actorId,
        action: 'member.link_account',
        targetType: 'Member',
        targetId: member.id,
        after: { userId: parsed.data.userId, memberName: member.fullName },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidatePath(`/${orgSlug}/fees`)
  revalidatePath(`/${orgSlug}/fees/collection`)
  return { error: null, ok: true }
}

const setFeeSchema = z.object({
  termId: z.string().min(1),
  memberIds: z.array(z.string().min(1)).min(1, 'Pick somebody first').max(300),
  tier: z.enum(['FULL', 'HALF', 'EXCHANGE_DISCOUNT', 'WAIVED', 'CUSTOM', 'ROSTER']),
  amount: z.string().trim(),
  note: z.string().trim().max(200, 'Keep the note short'),
})

/**
 * Set what one or more members pay this term.
 *
 * Without this the fee is read off the roster's free-text label. This is the
 * exco deciding directly, for everybody ticked at once. "ROSTER" takes the
 * decision back and lets the label speak again.
 *
 * A confirmed payment is left alone: what was paid was paid, and changing the
 * fee underneath it would restate a figure already counted toward the bank.
 * A declaration still waiting is repriced with it, so the amount the exco
 * check the screenshot against is the one they just chose.
 */
export async function setMemberFees(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const parsed = setFeeSchema.safeParse({
    termId: formData.get('termId') ?? '',
    memberIds: formData.getAll('memberId').map(String),
    tier: formData.get('tier') ?? '',
    amount: formData.get('amount') ?? '',
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Pick a fee' }
  }
  const { termId, memberIds, tier, note } = parsed.data

  let customCents: number | null = null
  if (tier === 'CUSTOM') {
    const dollars = Number(parsed.data.amount)
    if (!parsed.data.amount || !Number.isFinite(dollars) || dollars <= 0) {
      return { error: 'Type the amount they should pay. For nothing at all, choose Waived.' }
    }
    if (dollars > 10_000) return { error: 'That is more than a membership fee.' }
    customCents = Math.round(dollars * 100)
  }

  const outcome = await dbAs(userId, async (tx) => {
    await lockTermFees(tx, termId)
    const term = await tx.term.findFirst({
      where: { id: termId, orgId: org.id },
      select: {
        id: true,
        closedAt: true,
        fullFeeCents: true,
        halfFeeCents: true,
        exchangeFeeCents: true,
      },
    })
    if (!term) return { error: 'That term no longer exists.' }
    if (term.closedAt) return { error: 'That collection is closed. Its fees are fixed now.' }

    const unique = [...new Set(memberIds)]
    const members = await tx.member.findMany({
      where: { orgId: org.id, id: { in: unique } },
      select: { id: true, fullName: true, rosterLabel: true, isActive: true },
    })
    if (members.length !== unique.length) return { error: 'Somebody on that list is not on the roster.' }

    const payments = await tx.feePayment.findMany({
      where: { termId: term.id, memberId: { in: unique } },
      select: {
        id: true,
        memberId: true,
        status: true,
        tier: true,
        amountCents: true,
        paymentReference: true,
        paymentProofPath: true,
        rejectedReason: true,
      },
    })
    const paymentFor = new Map(payments.map((row) => [row.memberId, row]))

    const changed: string[] = []
    const paid: string[] = []
    const waiting: string[] = []
    /** Screenshots of refused claims that waiving made moot, removed after commit. */
    const discarded: string[] = []
    const cleared: string[] = []

    for (const member of members) {
      const payment = paymentFor.get(member.id)
      if (payment?.status === 'CONFIRMED') {
        paid.push(member.fullName)
        continue
      }

      const arrangement: { tier: FeeTier; amountCents: number | null } | null =
        tier === 'ROSTER' ? null : { tier, amountCents: customCents }
      const fee = resolveFee({
        payment: null,
        arrangement,
          rosterLabel: member.rosterLabel,
        isActive: member.isActive,
        rates: term,
      })
      if (payment?.status === 'DECLARED' && fee.amountCents === 0) {
        // They have said they paid. Waiving the fee under a declaration leaves
        // a claim for money nobody owes; decide the claim first.
        waiting.push(member.fullName)
        continue
      }
      // A claim the exco already refused is decided. Waiving the fee ends it:
      // nothing is owed, so there is nothing left to pay again, and a refused
      // row left under a waiver would keep telling the member to.
      const refusedClaim = payment?.status === 'REJECTED' && fee.amountCents === 0 ? payment : null

      const key = { termId_memberId: { termId: term.id, memberId: member.id } }
      const before = await tx.feeArrangement.findUnique({
        where: key,
        select: { tier: true, amountCents: true, note: true },
      })
      if (arrangement) {
        await tx.feeArrangement.upsert({
          where: key,
          create: {
            orgId: org.id,
            termId: term.id,
            memberId: member.id,
            tier: arrangement.tier,
            amountCents: customCents,
            note: note || null,
            setById: userId,
          },
          update: { tier: arrangement.tier, amountCents: customCents, note: note || null, setById: userId },
        })
      } else if (before) {
        await tx.feeArrangement.delete({ where: key })
      }

      if (refusedClaim) {
        await tx.feePayment.deleteMany({ where: { id: refusedClaim.id, status: 'REJECTED' } })
        if (refusedClaim.paymentProofPath) discarded.push(refusedClaim.paymentProofPath)
        cleared.push(member.fullName)
      } else if (payment) {
        await tx.feePayment.updateMany({
          where: { id: payment.id, status: { in: ['DECLARED', 'REJECTED'] } },
          data: { tier: fee.tier, amountCents: fee.amountCents },
        })
      }

      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'fee.set_fee',
          targetType: 'Member',
          targetId: member.id,
          before: before ?? { tier: 'ROSTER' },
          after: {
            termId: term.id,
            tier: fee.tier,
            amountCents: fee.amountCents,
            source: fee.source,
            note: note || null,
            // What the waiver cleared away, so the log still shows the claim.
            // The reference and the reason, never the screenshot.
            ...(refusedClaim
              ? {
                  clearedRefusedClaim: {
                    reference: refusedClaim.paymentReference,
                    amountCents: refusedClaim.amountCents,
                    rejectedReason: refusedClaim.rejectedReason,
                  },
                }
              : {}),
          },
        },
        tx
      )
      changed.push(member.fullName)
    }

    return { changed, paid, waiting, discarded, cleared, label: tier === 'ROSTER' ? null : TIER_LABEL[tier] }
  })

  if ('error' in outcome) return { error: outcome.error ?? 'That could not be saved' }
  for (const key of outcome.discarded) await discardProof(key)

  const parts: string[] = []
  if (outcome.changed.length > 0) {
    parts.push(
      outcome.label
        ? `${describePeople(outcome.changed)} ${outcome.changed.length === 1 ? 'is' : 'are'} on ${outcome.label.toLowerCase()} now.`
        : `${describePeople(outcome.changed)} ${outcome.changed.length === 1 ? 'goes' : 'go'} back to what the roster says.`
    )
  }
  if (outcome.cleared.length > 0) {
    parts.push(
      `The payment you couldn’t match from ${describePeople(outcome.cleared)} is cleared, since there’s nothing to pay now.`
    )
  }
  if (outcome.paid.length > 0) {
    parts.push(`${describePeople(outcome.paid)} already paid, so left as is. Undo the payment first to change it.`)
  }
  if (outcome.waiting.length > 0) {
    parts.push(`${describePeople(outcome.waiting)} said they paid. Check that first.`)
  }

  revalidatePath(`/${orgSlug}/fees`)
  revalidatePath(`/${orgSlug}/fees/collection`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: outcome.changed.length > 0, message: parts.join(' ') }
}

function describePeople(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.length} people`
}
