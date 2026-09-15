/**
 * Writing down who was charged what, at the moment a collection closes.
 *
 * Everything before closing is worked out live, from the roster, the exco's
 * fee decisions and the term's rates. After closing, nothing about the term
 * should move — but the roster does: people join, graduate, get relabelled.
 * These rows are the collection as it stood, and a closed term is read back
 * from them.
 */
import 'server-only'
import type { Prisma } from '@prisma/client'
import { resolveFee } from './tiers'

/** Call inside the closing transaction, with the fee lock held, before closedAt is set. */
export async function writeCloseCharges(
  tx: Prisma.TransactionClient,
  orgId: string,
  termId: string
): Promise<number> {
  const term = await tx.term.findFirst({
    where: { id: termId, orgId },
    select: { fullFeeCents: true, halfFeeCents: true, exchangeFeeCents: true },
  })
  if (!term) return 0

  // The same people listCollection shows: the active roster, plus anybody
  // with a payment or an exco-set fee for this term.
  const members = await tx.member.findMany({
    where: {
      orgId,
      OR: [{ isActive: true }, { feePayments: { some: { termId } } }, { feeArrangements: { some: { termId } } }],
    },
    select: { id: true, rosterLabel: true, isActive: true },
  })
  const payments = await tx.feePayment.findMany({
    where: { orgId, termId },
    select: { memberId: true, tier: true, amountCents: true },
  })
  const arrangements = await tx.feeArrangement.findMany({
    where: { orgId, termId },
    select: { memberId: true, tier: true, amountCents: true },
  })
  const paymentFor = new Map(payments.map((row) => [row.memberId, row]))
  const arrangementFor = new Map(arrangements.map((row) => [row.memberId, row]))

  const rows: Prisma.TermCloseChargeCreateManyInput[] = []
  for (const member of members) {
    const payment = paymentFor.get(member.id) ?? null
    const arrangement = arrangementFor.get(member.id) ?? null
    const fee = resolveFee({ payment, arrangement, rosterLabel: member.rosterLabel, isActive: member.isActive, rates: term })
    if (!fee.charged && !payment) continue
    const roster = resolveFee({ payment: null, arrangement, rosterLabel: member.rosterLabel, isActive: member.isActive, rates: term })
    rows.push({
      termId,
      memberId: member.id,
      orgId,
      tier: fee.tier,
      amountCents: fee.amountCents,
      rosterLabel: member.rosterLabel,
      onRoster: roster.charged,
    })
  }

  if (rows.length > 0) await tx.termCloseCharge.createMany({ data: rows })
  return rows.length
}
