/**
 * Writing a declaration, shared by the member's own "I've paid", the
 * membership form, and the exco matching a form response to its roster row.
 * All three have to price it and guard it the same way.
 */
import 'server-only'
import type { FeeTier, Prisma } from '@prisma/client'
import { writeAudit } from '@/core/audit'
import { resolveFee } from './tiers'

/**
 * Take this term's fee lock for the rest of the transaction.
 *
 * Every write to a term's fees and payments, and closing it, takes the same
 * lock, so none of them can interleave: a payment undone while the collection
 * closes, or a fee changed while a payment is recorded against the old one,
 * would each leave figures that disagree for good. The volume is a few dozen
 * writes a term, so serialising them costs nothing anybody will notice.
 */
export async function lockTermFees(tx: Prisma.TransactionClient, termId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`fees:${termId}`}, 0))`
}

export type DeclarationOutcome =
  | { written: true; paymentId: string; tier: FeeTier; amountCents: number }
  | { written: false; reason: 'CLOSED' | 'DECIDED' | 'NOTHING_OWED' | 'GONE' }

/**
 * Record that somebody says they paid, against one roster row.
 *
 * Call with the term's fee lock held. Everything is read again here, because
 * the screenshot upload before it is not instant: the exco may have confirmed
 * the payment, changed the fee or closed the collection in the meantime.
 *
 * A re-declaration replaces the last one, so somebody who paid the wrong
 * amount and paid again does not leave two claims to choose between — but
 * only while it is undecided. A confirmation that landed during the upload is
 * never rolled back into a declaration.
 */
export async function writeDeclaration(
  tx: Prisma.TransactionClient,
  input: {
    orgId: string
    termId: string
    memberId: string
    declaredByUserId: string
    /** Who is doing the writing, for the audit log. */
    actorId: string
    reference: string
    proofPath: string
    declaredAt?: Date
  }
): Promise<DeclarationOutcome> {
  const term = await tx.term.findFirst({
    where: { id: input.termId, orgId: input.orgId },
    select: { closedAt: true, fullFeeCents: true, halfFeeCents: true, exchangeFeeCents: true },
  })
  if (!term || term.closedAt) return { written: false, reason: 'CLOSED' }

  const member = await tx.member.findFirst({
    where: { id: input.memberId, orgId: input.orgId },
    select: { rosterLabel: true, isActive: true },
  })
  if (!member) return { written: false, reason: 'GONE' }

  const key = { termId_memberId: { termId: input.termId, memberId: input.memberId } }
  const [existing, arrangement] = await Promise.all([
    tx.feePayment.findUnique({ where: key, select: { id: true, status: true } }),
    tx.feeArrangement.findUnique({ where: key, select: { tier: true, amountCents: true } }),
  ])
  if (existing?.status === 'CONFIRMED') return { written: false, reason: 'DECIDED' }

  // Priced as if nothing had been paid: a refused declaration is replaced by
  // this one, and its old figure is not evidence of what is owed.
  const fee = resolveFee({
    payment: null,
    arrangement,
    rosterLabel: member.rosterLabel,
    isActive: member.isActive,
    rates: term,
  })
  if (!fee.charged || fee.amountCents === 0) return { written: false, reason: 'NOTHING_OWED' }

  const data = {
    tier: fee.tier,
    amountCents: fee.amountCents,
    status: 'DECLARED' as const,
    declaredAt: input.declaredAt ?? new Date(),
    declaredByUserId: input.declaredByUserId,
    paymentReference: input.reference,
    paymentProofPath: input.proofPath,
    source: 'DECLARATION' as const,
    rejectedReason: null,
    confirmedAt: null,
    confirmedByUserId: null,
  }

  let paymentId: string
  if (existing) {
    const claimed = await tx.feePayment.updateMany({
      where: { id: existing.id, status: { in: ['DECLARED', 'REJECTED'] } },
      data,
    })
    if (claimed.count !== 1) return { written: false, reason: 'DECIDED' }
    paymentId = existing.id
  } else {
    const created = await tx.feePayment.create({
      data: { orgId: input.orgId, termId: input.termId, memberId: input.memberId, ...data },
      select: { id: true },
    })
    paymentId = created.id
  }

  await writeAudit(
    {
      orgId: input.orgId,
      actorId: input.actorId,
      action: 'fee.declare',
      targetType: 'FeePayment',
      targetId: paymentId,
      // The reference, never the screenshot. An audit log is read by more
      // people than the bucket is.
      after: { tier: fee.tier, amountCents: fee.amountCents, reference: input.reference },
    },
    tx
  )
  return { written: true, paymentId, tier: fee.tier, amountCents: fee.amountCents }
}
