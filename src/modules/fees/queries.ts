/** Reading a term's collection, for the member and for the exco. */
import 'server-only'
import type { FeeTier, PaymentStatus, FeeRoute } from '@prisma/client'
import { dbAs } from '@/core/db'
import { fromDateColumn } from '@/lib/date-only'
import { tierFor, amountForTier, type TermRates } from './tiers'

export interface TermRow {
  id: string
  name: string
  startDate: Date
  endDate: Date
  fullFeeCents: number
  halfFeeCents: number
  exchangeFeeCents: number | null
  collectionOpensAt: Date | null
  finalCollectionAt: Date | null
  /** True once the collection has been closed and the deposit form raised. */
  closed: boolean
  /**
   * True once somebody has recorded the deposit form as sent to OSL. Closing
   * and filing are different events, and a term closed months ago with an
   * unfiled form is the one OSL are waiting on.
   */
  filed: boolean
  /**
   * Whether this collection has a PayNow QR uploaded. Never the key itself —
   * the bytes come from a route that checks membership on every request, so
   * a key in a page's props would only be an invitation to bypass it.
   */
  hasPaynowQr: boolean
  paynowQrUploadedAt: Date | null
}

export interface PaymentRow {
  id: string | null
  memberId: string
  memberName: string
  /** Only shown to the exco, and only to reconcile a bank statement. */
  studentId: string | null
  tier: FeeTier
  amountCents: number
  status: PaymentStatus | null
  route: FeeRoute
  routeReason: string | null
  paymentReference: string | null
  hasProof: boolean
  /**
   * Who declared it. The exco screen needs this to stop offering a button
   * that the action will refuse: nobody decides their own payment.
   */
  declaredByUserId: string | null
  declaredAt: Date | null
  confirmedAt: Date | null
  confirmedByName: string | null
  rejectedReason: string | null
  /** The roster could not say which tier; somebody should look. */
  tierUncertain: boolean
  tierBecause: string
  /**
   * False for somebody who has left but already paid. They stay on the board
   * because their money is in the total, and they owe nothing further.
   */
  onRoster: boolean
}

export interface CollectionTotals {
  owedCents: number
  declaredCents: number
  confirmedCents: number
  /** Confirmed and routed through the official bulk collection. */
  bankableCents: number
  members: number
  declared: number
  confirmed: number
  rejected: number
}

function toTermRow(row: {
  id: string
  name: string
  startDate: Date
  endDate: Date
  fullFeeCents: number
  halfFeeCents: number
  exchangeFeeCents: number | null
  collectionOpensAt: Date | null
  finalCollectionAt: Date | null
  paynowQrPath: string | null
  paynowQrUploadedAt: Date | null
  incomeDeposit: { id: string; submittedToOslAt: Date | null } | null
}): TermRow {
  return {
    id: row.id,
    name: row.name,
    startDate: fromDateColumn(row.startDate),
    endDate: fromDateColumn(row.endDate),
    fullFeeCents: row.fullFeeCents,
    halfFeeCents: row.halfFeeCents,
    exchangeFeeCents: row.exchangeFeeCents,
    // Both are written as calendar dates at UTC midnight, and every other
    // date in the portal is a local calendar date. Left unconverted they read
    // as the previous day anywhere west of Greenwich — which is a deadline
    // shown a day early, by the one screen whose job is deadlines.
    collectionOpensAt: row.collectionOpensAt && fromDateColumn(row.collectionOpensAt),
    finalCollectionAt: row.finalCollectionAt && fromDateColumn(row.finalCollectionAt),
    closed: row.incomeDeposit !== null,
    filed: row.incomeDeposit?.submittedToOslAt != null,
    hasPaynowQr: row.paynowQrPath !== null,
    paynowQrUploadedAt: row.paynowQrUploadedAt,
  }
}

const TERM_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  fullFeeCents: true,
  halfFeeCents: true,
  exchangeFeeCents: true,
  collectionOpensAt: true,
  finalCollectionAt: true,
  paynowQrPath: true,
  paynowQrUploadedAt: true,
  incomeDeposit: { select: { id: true, submittedToOslAt: true } },
} as const

export async function listTerms(userId: string, orgId: string): Promise<TermRow[]> {
  const rows = await dbAs(userId, (tx) =>
    tx.term.findMany({ where: { orgId }, orderBy: { startDate: 'desc' }, select: TERM_SELECT })
  )
  return rows.map(toTermRow)
}

/**
 * The term a collection would be for.
 *
 * The one running today, or — between terms — the next one to start. A
 * treasurer opening this screen in the fortnight before a term wants to see
 * the term they are about to collect for, not the one that just ended.
 */
export async function currentTerm(userId: string, orgId: string): Promise<TermRow | null> {
  const now = new Date()
  return dbAs(userId, async (tx) => {
    const running = await tx.term.findFirst({
      where: { orgId, startDate: { lte: now }, endDate: { gte: now } },
      select: TERM_SELECT,
    })
    if (running) return toTermRow(running)

    const next = await tx.term.findFirst({
      where: { orgId, startDate: { gt: now } },
      orderBy: { startDate: 'asc' },
      select: TERM_SELECT,
    })
    return next ? toTermRow(next) : null
  })
}

export async function getTerm(
  userId: string,
  orgId: string,
  termId: string
): Promise<TermRow | null> {
  const row = await dbAs(userId, (tx) =>
    tx.term.findFirst({ where: { id: termId, orgId }, select: TERM_SELECT })
  )
  return row ? toTermRow(row) : null
}

/**
 * Every active member and where their payment stands.
 *
 * Built from the roster rather than from the payment table, because the
 * question the exco is answering is "who has not paid", and a member with no
 * row at all is exactly the answer they need. A row with a null id is somebody
 * who has not declared.
 */
export async function listCollection(
  userId: string,
  orgId: string,
  termId: string
): Promise<{ rows: PaymentRow[]; totals: CollectionTotals }> {
  const { members, payments, rates } = await dbAs(userId, async (tx) => {
    const term = await tx.term.findFirst({
      where: { id: termId, orgId },
      select: { fullFeeCents: true, halfFeeCents: true, exchangeFeeCents: true },
    })
    return {
      // Active members, plus anybody who has a payment against this term.
      // Starting from the active roster alone drops a confirmed payer who has
      // since graduated — while closing the collection still banks their
      // money, so the board would preview a smaller figure than the one that
      // actually goes to OSL.
      members: await tx.member.findMany({
        where: {
          orgId,
          OR: [{ isActive: true }, { feePayments: { some: { termId } } }],
        },
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          fullName: true,
          studentId: true,
          rosterLabel: true,
          isActive: true,
        },
      }),
      payments: await tx.feePayment.findMany({
        where: { orgId, termId },
        include: { confirmedBy: { select: { name: true } } },
      }),
      rates: term,
    }
  })

  const byMember = new Map(payments.map((payment) => [payment.memberId, payment]))
  const termRates: TermRates = rates ?? {
    fullFeeCents: 0,
    halfFeeCents: 0,
    exchangeFeeCents: null,
  }

  const rows: PaymentRow[] = []
  for (const member of members) {
    const reading = tierFor(member.rosterLabel)
    const payment = byMember.get(member.id)

    // Nobody who has left owes anything, and a row for them on the collection
    // screen is a row somebody will chase — unless they already paid, in
    // which case their money is in the total and the row has to be there to
    // explain it.
    if ((reading.tier === null || !member.isActive) && !payment) continue
    const tier = payment?.tier ?? reading.tier ?? 'FULL'
    rows.push({
      id: payment?.id ?? null,
      memberId: member.id,
      memberName: member.fullName,
      studentId: member.studentId,
      tier,
      amountCents: payment?.amountCents ?? amountForTier(tier, termRates),
      status: payment?.status ?? null,
      route: payment?.route ?? 'OFFICIAL',
      routeReason: payment?.routeReason ?? null,
      paymentReference: payment?.paymentReference ?? null,
      hasProof: Boolean(payment?.paymentProofPath),
      declaredByUserId: payment?.declaredByUserId ?? null,
      declaredAt: payment?.declaredAt ?? null,
      confirmedAt: payment?.confirmedAt ?? null,
      confirmedByName: payment?.confirmedBy?.name ?? null,
      rejectedReason: payment?.rejectedReason ?? null,
      // Still uncertain even once a declaration exists. The declaration
      // carries the same guess — a member is never asked which tier they are
      // on — so clearing the flag on sight of one would hide the warning at
      // exactly the moment somebody is about to confirm the guessed amount.
      tierUncertain: !reading.certain,
      tierBecause: reading.because,
      onRoster: member.isActive && reading.tier !== null,
    })
  }

  return { rows, totals: totalsFor(rows) }
}

function totalsFor(rows: PaymentRow[]): CollectionTotals {
  const totals: CollectionTotals = {
    owedCents: 0,
    declaredCents: 0,
    confirmedCents: 0,
    bankableCents: 0,
    members: rows.length,
    declared: 0,
    confirmed: 0,
    rejected: 0,
  }

  for (const row of rows) {
    // A rejected declaration leaves the money still owed; somebody who has
    // left the roster owes nothing more whatever happened to their claim.
    if (row.status !== 'CONFIRMED' && row.onRoster) totals.owedCents += row.amountCents

    if (row.status === 'DECLARED') {
      totals.declared++
      totals.declaredCents += row.amountCents
    }
    if (row.status === 'REJECTED') totals.rejected++
    if (row.status === 'CONFIRMED') {
      totals.confirmed++
      totals.confirmedCents += row.amountCents
      // Only the official route is banked in through the deposit form; the
      // unofficial one is money the exco hold outside the OSL accounts.
      if (row.route === 'OFFICIAL') totals.bankableCents += row.amountCents
    }
  }
  return totals
}

export interface OwnFee {
  member: { id: string; fullName: string } | null
  term: TermRow | null
  tier: FeeTier
  /** The roster has them as having left; there is nothing to pay. */
  owesNothing: boolean
  amountCents: number
  payment: {
    id: string
    status: PaymentStatus
    paymentReference: string | null
    declaredAt: Date | null
    confirmedAt: Date | null
    rejectedReason: string | null
    hasProof: boolean
  } | null
}

/** What the signed-in member owes, and what they have said about it. */
export async function getOwnFee(
  userId: string,
  orgId: string,
  termId: string | null
): Promise<OwnFee> {
  const term = termId ? await getTerm(userId, orgId, termId) : await currentTerm(userId, orgId)

  return dbAs(userId, async (tx) => {
    const member = await tx.member.findFirst({
      where: { orgId, userId },
      select: { id: true, fullName: true, rosterLabel: true, isActive: true },
    })
    if (!member || !term) {
      return {
        member: member ? { id: member.id, fullName: member.fullName } : null,
        term,
        tier: 'FULL' as FeeTier,
        owesNothing: false,
        amountCents: 0,
        payment: null,
      }
    }

    const payment = await tx.feePayment.findUnique({
      where: { termId_memberId: { termId: term.id, memberId: member.id } },
    })
    const reading = tierFor(member.rosterLabel)
    const tier = payment?.tier ?? reading.tier ?? 'FULL'
    // A null tier is not a missing one: it is the roster saying they have
    // left, and somebody who has left owes nothing.
    const owesNothing = !payment && (reading.tier === null || !member.isActive)

    return {
      member: { id: member.id, fullName: member.fullName },
      term,
      tier,
      owesNothing,
      amountCents: owesNothing ? 0 : (payment?.amountCents ?? amountForTier(tier, term)),
      payment: payment
        ? {
            id: payment.id,
            status: payment.status,
            paymentReference: payment.paymentReference,
            declaredAt: payment.declaredAt,
            confirmedAt: payment.confirmedAt,
            rejectedReason: payment.rejectedReason,
            hasProof: Boolean(payment.paymentProofPath),
          }
        : null,
    }
  })
}

/** The stored screenshot key for one payment, for the exco review screen. */
export async function proofKeyFor(
  userId: string,
  orgId: string,
  paymentId: string
): Promise<string | null> {
  const row = await dbAs(userId, (tx) =>
    tx.feePayment.findFirst({
      where: { id: paymentId, orgId },
      select: { paymentProofPath: true },
    })
  )
  return row?.paymentProofPath ?? null
}

export interface DepositRow {
  id: string
  referenceNumber: string | null
  wbsElement: string
  grossCents: number
  netCents: number
  gstCents: number
  finalCollectionAt: Date | null
  submissionDueAt: Date | null
  submittedToOslAt: Date | null
}

/** The deposit form's figures, once a collection has been closed. */
export async function getDeposit(
  userId: string,
  orgId: string,
  termId: string
): Promise<DepositRow | null> {
  const row = await dbAs(userId, (tx) =>
    tx.incomeDeposit.findFirst({
      where: { termId, orgId },
      include: { referenceNumber: { select: { formatted: true } } },
    })
  )
  if (!row) return null
  return {
    id: row.id,
    referenceNumber: row.referenceNumber?.formatted ?? null,
    wbsElement: row.wbsElement,
    grossCents: row.grossCents,
    netCents: row.netCents,
    gstCents: row.gstCents,
    finalCollectionAt: row.finalCollectionAt,
    submissionDueAt: row.submissionDueAt,
    submittedToOslAt: row.submittedToOslAt,
  }
}

export interface UnlinkedAccount {
  userId: string
  name: string
  email: string
  /** The student ID the account says it is, if it has said. */
  claimedStudentId: string | null
  /**
   * The roster row carrying that student ID, when exactly one unlinked row
   * does. The exco still confirms it — this only saves them the search.
   */
  suggestedMemberId: string | null
  /** Another account has claimed the same student ID. Somebody is wrong. */
  contested: boolean
}

/**
 * Signed-in accounts with no roster row, and roster rows with no account.
 *
 * The two halves of the same problem: somebody signed up with a personal
 * address rather than the one the club holds, so nothing matched. Shown
 * together because the fix is to put one against the other.
 */
export async function listUnlinked(
  userId: string,
  orgId: string
): Promise<{
  accounts: UnlinkedAccount[]
  members: { id: string; fullName: string; studentId: string | null }[]
}> {
  return dbAs(userId, async (tx) => {
    const linked = await tx.member.findMany({
      where: { orgId, userId: { not: null } },
      select: { userId: true },
    })
    const linkedIds = linked.map((row) => row.userId!).filter(Boolean)

    const memberships = await tx.organisationMembership.findMany({
      where: { orgId, isActive: true, userId: { notIn: linkedIds.length ? linkedIds : ['-'] } },
      select: {
        user: { select: { id: true, name: true, email: true, claimedStudentId: true } },
      },
      // Claims first: somebody who has said who they are is the quick one to
      // confirm, and the one waiting on the club rather than on themselves.
      orderBy: { createdAt: 'asc' },
    })

    const members = await tx.member.findMany({
      where: { orgId, isActive: true, userId: null },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, studentId: true },
    })

    const byStudentId = new Map<string, string[]>()
    for (const member of members) {
      const id = member.studentId?.replace(/\D/g, '')
      if (!id) continue
      byStudentId.set(id, [...(byStudentId.get(id) ?? []), member.id])
    }

    const claimCounts = new Map<string, number>()
    for (const row of memberships) {
      const claim = row.user.claimedStudentId
      if (claim) claimCounts.set(claim, (claimCounts.get(claim) ?? 0) + 1)
    }

    const accounts = memberships.map((row) => {
      const claim = row.user.claimedStudentId
      const matches = claim ? (byStudentId.get(claim) ?? []) : []
      return {
        userId: row.user.id,
        name: row.user.name,
        email: row.user.email,
        claimedStudentId: claim,
        suggestedMemberId: matches.length === 1 ? matches[0] : null,
        contested: claim ? (claimCounts.get(claim) ?? 0) > 1 : false,
      }
    })

    accounts.sort((a, b) => Number(Boolean(b.claimedStudentId)) - Number(Boolean(a.claimedStudentId)))

    return {
      accounts,
      // The student ID is on the option so the exco can check a claim against
      // it. They can already see it on the roster; this is the same screen.
      members: members.map(({ id, fullName, studentId }) => ({ id, fullName, studentId })),
    }
  })
}
