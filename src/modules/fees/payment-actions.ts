'use server'

/** Paying, and deciding payments: a member declares, the exco confirm, reject, record or undo. */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { FeeTier } from '@prisma/client'
import { dbAs } from '@/core/db'
import { getOrgContext, requirePermission } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { resolveFee } from './tiers'
import { matchRosterRow } from '@/core/auth/roster-match'
import { validateProof, putProof, discardProof, ProofRejected, MAX_PROOF_BYTES } from './proof'
import { lockTermFees, writeDeclaration } from './declaration'
import { type FeeState, isUniqueViolation } from './action-state'

const declareSchema = z.object({
  termId: z.string().min(1),
  // The bank's own reference, so the exco can find the line on the statement.
  reference: z
    .string()
    .trim()
    .min(3, 'Copy the reference from your PayNow confirmation')
    .max(64, 'That is longer than a payment reference'),
})

/**
 * A member saying they have paid.
 *
 * A claim, not money. The amount is never posted by the browser — it comes
 * from the term's configured tier — and the status this writes can only ever
 * be DECLARED. Only the exco can move it to CONFIRMED, and never for
 * themselves, which is the one control the whole of fee collection rests on.
 *
 * A declaration without a screenshot is incomplete rather than pending: that
 * screenshot is the entire evidence base for the confirmation that follows.
 */
export async function declarePayment(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.declare')

  const parsed = declareSchema.safeParse({
    termId: formData.get('termId') ?? '',
    reference: formData.get('reference') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That declaration is not valid' }
  }

  const file = formData.get('proof')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Attach a screenshot of the PayNow confirmation.' }
  }
  if (file.size > MAX_PROOF_BYTES) {
    return { error: `That image is over ${MAX_PROOF_BYTES / 1_000_000} MB.` }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  let format
  try {
    format = validateProof(bytes)
  } catch (error) {
    if (error instanceof ProofRejected) return { error: error.message }
    throw error
  }

  type Problem = keyof typeof PROBLEMS
  type Context =
    | { problem: Problem }
    | {
        problem?: undefined
        member: { id: string; rosterLabel: string | null; isActive: boolean }
        term: { id: string; fullFeeCents: number; halfFeeCents: number; exchangeFeeCents: number | null }
        existingId: string | null
        fee: { tier: FeeTier; amountCents: number }
      }

  const context: Context = await dbAs(userId, async (tx) => {
    const member = await tx.member.findFirst({
      where: { orgId: org.id, userId },
      select: { id: true, rosterLabel: true, isActive: true },
    })
    if (!member) return { problem: 'ROSTER' as const }

    const term = await tx.term.findFirst({
      where: { id: parsed.data.termId, orgId: org.id },
      select: {
        id: true,
        fullFeeCents: true,
        halfFeeCents: true,
        exchangeFeeCents: true,
        closedAt: true,
      },
    })
    if (!term) return { problem: 'TERM' as const }
    if (term.closedAt) return { problem: 'CLOSED' as const }

    const existing = await tx.feePayment.findUnique({
      where: { termId_memberId: { termId: term.id, memberId: member.id } },
      select: { id: true, status: true },
    })
    if (existing?.status === 'CONFIRMED') return { problem: 'CONFIRMED' as const }

    const arrangement = await tx.feeArrangement.findUnique({
      where: { termId_memberId: { termId: term.id, memberId: member.id } },
      select: { tier: true, amountCents: true },
    })
    // Priced as if nothing had been paid: a refused declaration is replaced
    // by this one, and its old figure is not evidence of what is owed.
    const fee = resolveFee({
      payment: null,
      arrangement,
      rosterLabel: member.rosterLabel,
      isActive: member.isActive,
      rates: term,
    })
    // Somebody the roster has as having left owes nothing, and replacing that
    // with a full-term bill would take a graduated exco member's money.
    if (!fee.charged) return { problem: 'DEPARTED' as const }
    if (fee.amountCents === 0) return { problem: 'WAIVED' as const }

    return { member, term, existingId: existing?.id ?? null, fee }
  })

  if (context.problem) return { error: PROBLEMS[context.problem] }

  const { member, term } = context
  // Uploaded outside the transaction: it leaves the database for object
  // storage, and a pooled connection should not be held open across that.
  const proofPath = await putProof(term.id, member.id, bytes, format)

  let late: 'CLOSED' | 'DECIDED' | null
  try {
    late = await dbAs(userId, async (tx) => {
      await lockTermFees(tx, term.id)
      const outcome = await writeDeclaration(tx, {
        orgId: org.id,
        termId: term.id,
        memberId: member.id,
        declaredByUserId: userId,
        actorId: userId,
        reference: parsed.data.reference,
        proofPath,
      })
      if (outcome.written) return null
      return outcome.reason === 'CLOSED' ? ('CLOSED' as const) : ('DECIDED' as const)
    })
  } catch (error) {
    await discardProof(proofPath)
    throw error
  }

  // The screenshot went up but nothing points at it. It carries the payer's
  // name and account details, so it does not get to sit in storage forever.
  if (late) await discardProof(proofPath)

  if (late === 'CLOSED') return { error: PROBLEMS.CLOSED }
  if (late === 'DECIDED') {
    return {
      error:
        'The exco decided that payment while this was uploading. Reload to see what they said.',
    }
  }

  revalidatePath(`/${orgSlug}/fees`)
  return { error: null, ok: true }
}

const PROBLEMS = {
  ROSTER:
    'You are not on the club roster yet, so there is nothing to pay against. Ask an exco member to add you.',
  TERM: 'That term no longer exists.',
  CLOSED: 'That collection has closed. Speak to the treasurer.',
  CONFIRMED: 'Your payment for that term is already confirmed.',
  DEPARTED:
    'The roster has you as having left the club, so there is nothing to pay. If that is wrong, ask an exco member to put it right first.',
  WAIVED: 'Your fee for this term is waived, so there is nothing to pay.',
} as const

const decideSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().max(300).optional(),
  /**
   * OFFICIAL is the bulk collection banked in through the deposit form.
   * UNOFFICIAL is the exception path from the guidelines: money the exco end
   * up holding outside the OSL accounts, which needs a reason on the record
   * because there is no WBS element to quote against it and nothing for OSL
   * to reimburse.
   */
  route: z.enum(['OFFICIAL', 'UNOFFICIAL']).default('OFFICIAL'),
})

/**
 * The exco confirming a declaration against the bank statement.
 *
 * Never your own. A member confirming their own payment is not a control, it
 * is a formality — the same reasoning as an access request nobody else
 * approves.
 */
export async function confirmPayment(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const parsed = decideSchema.safeParse({
    paymentId: formData.get('paymentId') ?? '',
    reason: formData.get('reason') ?? '',
    route: formData.get('route') ?? 'OFFICIAL',
  })
  if (!parsed.success) return { error: 'That payment could not be found' }

  const routeReason = parsed.data.reason?.trim() || null
  if (parsed.data.route === 'UNOFFICIAL' && !routeReason) {
    // Required by the guidelines and by the next treasurer: a figure sitting
    // outside the OSL accounts with no reason on it is one nobody can explain
    // at handover.
    return { error: 'Say why this one is outside the OSL collection.' }
  }

  const problem = await dbAs(userId, async (tx) => {
    const target = await tx.feePayment.findFirst({
      where: { id: parsed.data.paymentId, orgId: org.id },
      select: { termId: true },
    })
    if (target) await lockTermFees(tx, target.termId)
    const payment = await tx.feePayment.findFirst({
      where: { id: parsed.data.paymentId, orgId: org.id },
      select: {
        id: true,
        status: true,
        declaredByUserId: true,
        paymentProofPath: true,
        amountCents: true,
        term: { select: { closedAt: true } },
      },
    })
    if (!payment) return 'That payment no longer exists'
    if (payment.term.closedAt) return 'That collection is closed. Its payments are fixed.'
    if (payment.status === 'CONFIRMED') return null
    if (payment.declaredByUserId === userId) {
      return 'Somebody else has to confirm your own payment.'
    }
    if (!payment.paymentProofPath) {
      return 'That declaration has no screenshot against it, so there is nothing to check it by.'
    }

    // Conditional, so two treasurers working the queue at once cannot both
    // believe they were the one who confirmed it.
    const claimed = await tx.feePayment.updateMany({
      where: { id: payment.id, status: 'DECLARED' },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedByUserId: userId,
        route: parsed.data.route,
        routeReason,
        rejectedReason: null,
      },
    })
    if (claimed.count !== 1) return 'Somebody else has just decided that one. Reload the page.'

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.confirm',
        targetType: 'FeePayment',
        targetId: payment.id,
        before: { status: payment.status },
        after: {
          status: 'CONFIRMED',
          amountCents: payment.amountCents,
          route: parsed.data.route,
          routeReason,
        },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidatePath(`/${orgSlug}/fees`)
  return { error: null, ok: true }
}

/** Reject one, with a reason the member can read. */
export async function rejectPayment(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const parsed = decideSchema.safeParse({
    paymentId: formData.get('paymentId') ?? '',
    reason: formData.get('reason') ?? '',
  })
  if (!parsed.success) return { error: 'That payment could not be found' }
  const reason = parsed.data.reason?.trim()
  if (!reason) {
    // A refusal somebody cannot answer is a refusal they will bring to the
    // treasurer in person, which is the work this screen exists to avoid.
    return { error: 'Say why, so they know what to fix.' }
  }

  const problem = await dbAs(userId, async (tx) => {
    const target = await tx.feePayment.findFirst({
      where: { id: parsed.data.paymentId, orgId: org.id },
      select: { termId: true },
    })
    if (target) await lockTermFees(tx, target.termId)
    const payment = await tx.feePayment.findFirst({
      where: { id: parsed.data.paymentId, orgId: org.id },
      select: { id: true, status: true, declaredByUserId: true, term: { select: { closedAt: true } } },
    })
    if (!payment) return 'That payment no longer exists'
    if (payment.term.closedAt) return 'That collection is closed.'
    if (payment.declaredByUserId === userId) {
      return 'Somebody else has to decide your own payment.'
    }

    const claimed = await tx.feePayment.updateMany({
      where: { id: payment.id, status: 'DECLARED' },
      data: {
        status: 'REJECTED',
        rejectedReason: reason,
        confirmedAt: null,
        confirmedByUserId: null,
      },
    })
    if (claimed.count !== 1) return 'Somebody else has just decided that one. Reload the page.'

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.reject',
        targetType: 'FeePayment',
        targetId: payment.id,
        before: { status: payment.status },
        after: { status: 'REJECTED', reason },
      },
      tx
    )
    return null
  })

  if (problem) return { error: problem }
  revalidatePath(`/${orgSlug}/fees`)
  return { error: null, ok: true }
}

const recordSchema = z.object({
  termId: z.string().min(1),
  memberId: z.string().min(1),
  reference: z.string().trim().max(64, 'That is longer than a payment reference'),
  route: z.enum(['OFFICIAL', 'UNOFFICIAL']).default('OFFICIAL'),
  reason: z.string().trim().max(300),
})

/**
 * Record a payment straight off the bank statement.
 *
 * Most members never open the portal, and a payment could only start as
 * their own declaration — so most of the roster could never be marked as
 * paid. The bank statement is the evidence here, not a screenshot, which is
 * the same thing a declaration is checked against anyway.
 *
 * Never your own. That is the one control the collection rests on, and the
 * database refuses it as well.
 */
export async function recordPayment(
  orgSlug: string,
  _prev: FeeState,
  formData: FormData
): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const parsed = recordSchema.safeParse({
    termId: formData.get('termId') ?? '',
    memberId: formData.get('memberId') ?? '',
    reference: formData.get('reference') ?? '',
    route: formData.get('route') ?? 'OFFICIAL',
    reason: formData.get('reason') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'That payment is not valid' }
  const { termId, memberId, reference, route } = parsed.data
  const routeReason = parsed.data.reason || null
  if (route === 'UNOFFICIAL' && !routeReason) {
    return { error: 'Say why this one is outside the OSL collection.' }
  }

  const problem = await dbAs(userId, async (tx) => {
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
    if (!term) return 'That term no longer exists.'
    if (term.closedAt) return 'That collection is closed.'

    const member = await tx.member.findFirst({
      where: { id: memberId, orgId: org.id },
      select: { id: true, fullName: true, userId: true, rosterLabel: true, isActive: true, email: true, studentId: true },
    })
    if (!member) return 'That person is not on the roster.'
    if (member.userId === userId) return 'Somebody else has to record your own fee.'
    // Not linked yet, but plainly theirs: the row would be linked to this
    // account the next time it signs in, turning this into its own payment.
    const actor = await tx.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (actor && matchRosterRow(actor.email, [member])) {
      return 'That roster row looks like yours. Somebody else has to record your own fee.'
    }

    const key = { termId_memberId: { termId: term.id, memberId: member.id } }
    const existing = await tx.feePayment.findUnique({
      where: key,
      select: { id: true, status: true, declaredByUserId: true, paymentReference: true },
    })
    if (existing?.status === 'CONFIRMED') return null
    if (existing?.declaredByUserId === userId) return 'Somebody else has to decide your own payment.'

    const arrangement = await tx.feeArrangement.findUnique({
      where: key,
      select: { tier: true, amountCents: true },
    })
    const fee = resolveFee({
      payment: null,
      arrangement,
      rosterLabel: member.rosterLabel,
      isActive: member.isActive,
      rates: term,
    })
    if (fee.amountCents === 0) return `${member.fullName} owes nothing this term.`

    const now = new Date()
    const confirmed = {
      status: 'CONFIRMED' as const,
      confirmedAt: now,
      confirmedByUserId: userId,
      route,
      routeReason,
      rejectedReason: null,
    }

    let paymentId: string
    if (existing?.status === 'DECLARED') {
      // Their own declaration, confirmed from the statement rather than the
      // screenshot. It stays a declaration; only its status moves.
      const claimed = await tx.feePayment.updateMany({
        where: { id: existing.id, status: 'DECLARED' },
        data: { ...confirmed, paymentReference: reference || existing.paymentReference },
      })
      if (claimed.count !== 1) return 'Somebody else has just decided that one. Reload the page.'
      paymentId = existing.id
    } else if (existing) {
      const claimed = await tx.feePayment.updateMany({
        where: { id: existing.id, status: 'REJECTED' },
        // Still the member's declaration, screenshot and all — so an undo
        // sends it back to be checked rather than deleting their evidence.
        data: {
          ...confirmed,
          tier: fee.tier,
          amountCents: fee.amountCents,
          paymentReference: reference || existing.paymentReference,
        },
      })
      if (claimed.count !== 1) return 'Somebody else has just decided that one. Reload the page.'
      paymentId = existing.id
    } else {
      const created = await tx.feePayment.create({
        data: {
          orgId: org.id,
          termId: term.id,
          memberId: member.id,
          tier: fee.tier,
          amountCents: fee.amountCents,
          source: 'RECORDED',
          paymentReference: reference || null,
          ...confirmed,
        },
        select: { id: true },
      })
      paymentId = created.id
    }

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.record',
        targetType: 'FeePayment',
        targetId: paymentId,
        before: { status: existing?.status ?? null },
        after: {
          status: 'CONFIRMED',
          tier: fee.tier,
          amountCents: fee.amountCents,
          route,
          routeReason,
          reference: reference || null,
        },
      },
      tx
    )
    return null
  }).catch((error) => {
    if (isUniqueViolation(error)) return 'Somebody else has just recorded that one. Reload the page.'
    throw error
  })

  if (problem) return { error: problem }
  revalidatePath(`/${orgSlug}/fees`)
  revalidatePath(`/${orgSlug}/fees/collection`)
  revalidatePath(`/${orgSlug}/dashboard`)
  return { error: null, ok: true }
}

/**
 * Take back a decision about a payment, while the collection is still open.
 *
 * A member's own declaration goes back to waiting, screenshot and all, so the
 * evidence is not lost with the mistake. A payment the exco recorded off the
 * statement had no existence apart from that record, so it goes. Either way
 * the audit log keeps what was there.
 */
export async function undoPayment(orgSlug: string, paymentId: string): Promise<FeeState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await requirePermission(org.id, 'fee.manage')

  const problem = await dbAs(userId, async (tx) => {
    const target = await tx.feePayment.findFirst({
      where: { id: paymentId, orgId: org.id },
      select: { termId: true },
    })
    if (target) await lockTermFees(tx, target.termId)
    const payment = await tx.feePayment.findFirst({
      where: { id: paymentId, orgId: org.id },
      select: {
        id: true,
        status: true,
        source: true,
        amountCents: true,
        route: true,
        term: { select: { closedAt: true } },
      },
    })
    if (!payment) return 'That payment no longer exists.'
    if (payment.term.closedAt) return 'That collection is closed and banked. Its payments are fixed.'
    if (payment.status === 'DECLARED') return null

    if (payment.source === 'RECORDED') {
      await tx.feePayment.deleteMany({ where: { id: payment.id, status: payment.status } })
    } else {
      const reverted = await tx.feePayment.updateMany({
        where: { id: payment.id, status: payment.status },
        data: {
          status: 'DECLARED',
          confirmedAt: null,
          confirmedByUserId: null,
          rejectedReason: null,
          route: 'OFFICIAL',
          routeReason: null,
        },
      })
      if (reverted.count !== 1) return 'Somebody else has just changed that one. Reload the page.'
    }

    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'fee.undo',
        targetType: 'FeePayment',
        targetId: payment.id,
        before: { status: payment.status, source: payment.source, amountCents: payment.amountCents, route: payment.route },
        after: { status: payment.source === 'RECORDED' ? null : 'DECLARED' },
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
