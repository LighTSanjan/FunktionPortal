/** Assembling the term fee summary from the collection. */
import 'server-only'
import { dbAs } from '@/core/db'
import { TIER_LABEL } from './tiers'
import { listCollection, getTerm, getDeposit } from './queries'
import type { FeeSummaryDocData, SummaryRow } from './summary-doc'

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmed',
  DECLARED: 'Declared, not yet checked',
  REJECTED: 'Refused',
}

/**
 * The club's own record of a term's collection.
 *
 * Deliberately unsigned. It is an internal record filed alongside the term
 * rather than a submission — the Income Deposit Form is what goes to OSL, and
 * it carries only the total. The rule is left blank for whoever files this,
 * and the audit log answers who closed the collection.
 */
export async function buildTermSummary(
  userId: string,
  orgId: string,
  orgName: string,
  termId: string
): Promise<FeeSummaryDocData | null> {
  const term = await getTerm(userId, orgId, termId)
  if (!term) return null

  const [{ rows, totals }, deposit, settings] = await Promise.all([
    listCollection(userId, orgId, termId),
    getDeposit(userId, orgId, termId),
    dbAs(userId, (tx) =>
      tx.organisationSettings.findUnique({
        where: { orgId },
        select: { brandBandColors: true, tagline: true },
      })
    ),
  ])

  const summaryRows: SummaryRow[] = rows.map((row) => ({
    memberName: row.memberName,
    tierLabel: TIER_LABEL[row.tier],
    amountCents: row.amountCents,
    statusLabel: row.status ? STATUS_LABEL[row.status] : 'Not paid',
    confirmedOn: row.confirmedAt ?? undefined,
    unofficial: row.route === 'UNOFFICIAL',
  }))

  return {
    organisationName: orgName,
    termName: term.name,
    rows: summaryRows,
    // Once the collection is closed, what was banked is what the deposit
    // says. Re-deriving it from a live roster would let a member leaving after
    // the fact change a figure that has already gone to the Office of Finance.
    bankedCents: deposit?.grossCents ?? totals.bankableCents,
    // Confirmed, but off the official route: money the exco hold outside the
    // OSL accounts, with no WBS element to quote and nothing to reimburse.
    unofficialCents: totals.confirmedCents - totals.bankableCents,
    outstandingCents: totals.owedCents,
    referenceNumber: deposit?.referenceNumber ?? undefined,
    finalCollectionAt: deposit?.finalCollectionAt ?? term.finalCollectionAt ?? undefined,
    branding: settings?.brandBandColors?.length
      ? { bandColors: settings.brandBandColors }
      : undefined,
  }
}
