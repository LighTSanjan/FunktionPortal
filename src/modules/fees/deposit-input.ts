/** Assembling the Income Deposit Form's inputs from a closed collection. */
import 'server-only'
import { dbAs } from '@/core/db'
import { OFFICE_LABELS } from '@/core/access'
import { NO_OFFICE } from '@/modules/coach-claim/documents'
import { TIER_LABEL } from './tiers'
import { listCollection, getTerm, getDeposit } from './queries'
import { DEFAULT_GST_BASIS_POINTS } from './money'
import type { DepositFormInput, DepositLine } from './deposit-form'

/**
 * What OSL's form needs, read from what was actually banked.
 *
 * The breakdown is by tier rather than by member: the form asks for item,
 * price and quantity, and forty-five lines of "membership subscription, $70,
 * 1" is a worse answer to that question than one line saying forty-two. It
 * also keeps the members' names off a document that leaves the club.
 *
 * Only money on the official route is counted. Anything the exco confirmed as
 * held outside OSL was never banked into the DBS Max wallet, and including it
 * would make the form disagree with the bank statement it is checked against.
 */
export async function depositFormInput(
  userId: string,
  orgId: string,
  orgName: string,
  termId: string
): Promise<DepositFormInput | null> {
  const term = await getTerm(userId, orgId, termId)
  if (!term) return null

  const deposit = await getDeposit(userId, orgId, termId)
  if (!deposit) return null

  const [{ rows }, settings, submitter] = await Promise.all([
    listCollection(userId, orgId, termId),
    dbAs(userId, (tx) =>
      tx.organisationSettings.findUnique({
        where: { orgId },
        select: { gstBasisPoints: true },
      })
    ),
    dbAs(userId, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      })
      const membership = await tx.organisationMembership.findFirst({
        where: { orgId, userId },
        select: { office: true },
      })
      const member = await tx.member.findFirst({
        where: { orgId, userId },
        select: { studentId: true },
      })
      return {
        name: user?.name ?? '',
        studentId: member?.studentId ?? null,
        office: membership?.office ?? null,
      }
    }),
  ])

  const banked = rows.filter((row) => row.status === 'CONFIRMED' && row.route !== 'UNOFFICIAL')

  // Grouped by tier AND by amount: a rate changed part-way through a
  // collection leaves two prices behind the same tier, and averaging them
  // would produce a quantity times a price that does not equal what was
  // banked.
  const groups = new Map<string, DepositLine>()
  for (const row of banked) {
    const key = `${row.tier}:${row.amountCents}`
    const existing = groups.get(key)
    if (existing) existing.quantity += 1
    else {
      groups.set(key, {
        description: `Membership subscription — ${TIER_LABEL[row.tier].toLowerCase()}`,
        unitPriceCents: row.amountCents,
        quantity: 1,
      })
    }
  }

  return {
    referenceNumber: deposit.referenceNumber,
    organisationName: orgName,
    eventName: `${term.name} membership subscriptions`,
    eventDate: printedDate(term.finalCollectionAt ?? term.endDate),
    description: `Membership subscriptions collected from members for ${term.name}`,
    wbsElement: deposit.wbsElement,
    lines: [...groups.values()].sort((a, b) => b.unitPriceCents - a.unitPriceCents),
    submittedBy: {
      name: submitter.name,
      studentId: submitter.studentId,
      // Never invented. Somebody with no recorded office signs as what they
      // are, rather than as the Treasurer they may not be — the same rule the
      // coach documents follow, and the same labels.
      designation: submitter.office ? OFFICE_LABELS[submitter.office] : NO_OFFICE,
    },
    gstBasisPoints: settings?.gstBasisPoints ?? DEFAULT_GST_BASIS_POINTS,
  }
}

function printedDate(value: Date): string {
  return value.toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
