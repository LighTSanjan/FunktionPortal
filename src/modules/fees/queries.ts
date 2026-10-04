/** Reading a term's collection, for the member and for the exco. */
import 'server-only'
import type { FeeTier, FormState, PaymentStatus, FeeRoute, PaymentSource } from '@prisma/client'
import { dbAs, inTurn } from '@/core/db'
import { fromDateColumn, singaporeDay, toDateColumn } from '@/lib/date-only'
import { resolveFee, tierFor, TIER_LABEL, type TermRates } from './tiers'

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
  /** Exco only. Closed with nothing on the OSL route leaves no deposit to file. */
  hasDeposit: boolean
  /** Closing wrote down who was charged what; read a closed term from that. */
  chargesRecorded: boolean
  /**
   * Whether this collection has a PayNow QR uploaded. Never the key itself —
   * the bytes come from a route that checks membership on every request, so
   * a key in a page's props would only be an invitation to bypass it.
   */
  hasPaynowQr: boolean
  paynowQrUploadedAt: Date | null
  /** The optional half-term QR, for whoever owes exactly the half rate. */
  hasHalfPaynowQr: boolean
  paynowHalfQrUploadedAt: Date | null
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
  /** A member's own declaration, or recorded by the exco off the statement. */
  source: PaymentSource | null
  /** Whether the fee was decided by the exco, fixed by a payment, or read off the roster. */
  feeSource: 'payment' | 'exco' | 'roster'
  /** The exco's own fee for this member this term, if they set one. */
  arrangement: { tier: FeeTier; amountCents: number | null; note: string | null } | null
  /** The member has a portal account linked to their roster row. */
  hasAccount: boolean
  /** This row is the person looking at the screen. Nobody records their own. */
  isYou: boolean
  /**
   * Who declared it. The exco screen needs this to stop offering a button
   * that the action will refuse: nobody decides their own payment.
   */
  declaredByUserId: string | null
  declaredAt: Date | null
  confirmedAt: Date | null
  confirmedByName: string | null
  rejectedReason: string | null
  /** What the roster label alone would charge, e.g. "Half term". */
  rosterFee: string
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
  paynowHalfQrPath: string | null
  paynowHalfQrUploadedAt: Date | null
  closedAt: Date | null
  chargesRecordedAt: Date | null
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
    // From the term, not from the deposit row: a member cannot see deposits.
    closed: row.closedAt !== null,
    filed: row.incomeDeposit?.submittedToOslAt != null,
    // Exco only: a member's session cannot see deposits, so to them this is
    // always false. A closed term without one had nothing to bank in.
    hasDeposit: row.incomeDeposit !== null,
    chargesRecorded: row.chargesRecordedAt !== null,
    hasPaynowQr: row.paynowQrPath !== null,
    paynowQrUploadedAt: row.paynowQrUploadedAt,
    hasHalfPaynowQr: row.paynowHalfQrPath !== null,
    paynowHalfQrUploadedAt: row.paynowHalfQrUploadedAt,
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
  paynowHalfQrPath: true,
  paynowHalfQrUploadedAt: true,
  closedAt: true,
  chargesRecordedAt: true,
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

export interface OwnTerm {
  id: string
  name: string
  /** A term running now or about to start, which is the one shown by default. */
  current: boolean
  /** The current term has not started yet. */
  upcoming: boolean
}

/**
 * The terms somebody has something in — a response they sent, a payment
 * against their roster row, or a fee the exco set for them — plus the current
 * one, newest first.
 *
 * "Your membership fee" opens on the current term, so without this a receipt
 * or a refused payment from last term was unreachable the day the next term
 * began, unless somebody had kept the link.
 */
export async function listOwnTerms(userId: string, orgId: string): Promise<OwnTerm[]> {
  const [current, rows] = await Promise.all([
    currentTerm(userId, orgId),
    dbAs(userId, (tx) =>
      tx.term.findMany({
        where: {
          orgId,
          OR: [
            { membershipResponses: { some: { userId } } },
            { feePayments: { some: { member: { userId } } } },
            { feeArrangements: { some: { member: { userId } } } },
            { closeCharges: { some: { member: { userId } } } },
          ],
        },
        orderBy: { startDate: 'desc' },
        select: { id: true, name: true, startDate: true },
      })
    ),
  ])
  const terms = rows.map((row) => ({ id: row.id, name: row.name, startDate: row.startDate, current: row.id === current?.id }))
  if (current && !terms.some((term) => term.current)) {
    terms.push({ id: current.id, name: current.name, startDate: toDateColumn(current.startDate), current: true })
  }
  const upcoming = current !== null && current.startDate.getTime() > Date.now()
  return terms
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    .map(({ id, name, current }) => ({ id, name, current, upcoming: current && upcoming }))
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
  const { members, payments, arrangements, rates, charges, recorded } = await dbAs(userId, async (tx) => {
    const term = await tx.term.findFirst({
      where: { id: termId, orgId },
      select: { fullFeeCents: true, halfFeeCents: true, exchangeFeeCents: true, chargesRecordedAt: true },
    })
    // A closed collection is read from what was written down when it closed,
    // not from today's roster — even when that was nobody. Terms closed before
    // that was kept are still worked out live.
    const recorded = term?.chargesRecordedAt != null
    const charges = recorded ? await tx.termCloseCharge.findMany({ where: { orgId, termId } }) : []
    return {
      recorded,
      charges,
      // Active members, plus anybody who has a payment against this term.
      // Starting from the active roster alone drops a confirmed payer who has
      // since graduated — while closing the collection still banks their
      // money, so the board would preview a smaller figure than the one that
      // actually goes to OSL.
      // Anybody the exco set a fee for, too: putting somebody who has left
      // back on the list is exactly what setting their fee is for.
      members: await tx.member.findMany({
        where: {
          orgId,
          OR:
            recorded
              ? [{ id: { in: charges.map((charge) => charge.memberId) } }, { feePayments: { some: { termId } } }]
              : [
                  { isActive: true },
                  { feePayments: { some: { termId } } },
                  { feeArrangements: { some: { termId } } },
                ],
        },
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          fullName: true,
          studentId: true,
          rosterLabel: true,
          isActive: true,
          userId: true,
        },
      }),
      payments: await tx.feePayment.findMany({
        where: { orgId, termId },
        include: { confirmedBy: { select: { name: true } } },
      }),
      arrangements: await tx.feeArrangement.findMany({
        where: { orgId, termId },
        select: { memberId: true, tier: true, amountCents: true, note: true },
      }),
      rates: term,
    }
  })

  const byMember = new Map(payments.map((payment) => [payment.memberId, payment]))
  const arrangementFor = new Map(arrangements.map((row) => [row.memberId, row]))
  const termRates: TermRates = rates ?? {
    fullFeeCents: 0,
    halfFeeCents: 0,
    exchangeFeeCents: null,
  }

  const chargeFor = new Map(charges.map((charge) => [charge.memberId, charge]))
  const frozen = recorded

  const rows: PaymentRow[] = []
  for (const member of members) {
    const payment = byMember.get(member.id)
    const arrangement = arrangementFor.get(member.id) ?? null
    const charge = chargeFor.get(member.id)
    // The label as it was when the collection closed, so a relabel next term
    // does not reach back.
    const rosterLabel = charge ? charge.rosterLabel : member.rosterLabel
    const live = resolveFee({
      payment: payment ?? null,
      arrangement,
      rosterLabel,
      isActive: member.isActive,
      rates: termRates,
    })
    const fee =
      frozen && charge && !payment
        ? { ...live, tier: charge.tier, amountCents: charge.amountCents, charged: charge.amountCents > 0 || charge.onRoster }
        : live
    // Nobody who has left owes anything, and a row for them on the collection
    // screen is a row somebody will chase — unless they already paid, in
    // which case their money is in the total and the row has to be there to
    // explain it.
    if (!fee.charged && !payment) continue
    // A payment fixes the figure, but the question of whether the roster was
    // sure is still worth asking about a row nobody has decided.
    const rosterNow = resolveFee({
      payment: null,
      arrangement,
      rosterLabel,
      isActive: member.isActive,
      rates: termRates,
    })
    const roster = frozen ? { ...rosterNow, certain: true, charged: charge?.onRoster ?? false } : rosterNow
    rows.push({
      id: payment?.id ?? null,
      memberId: member.id,
      memberName: member.fullName,
      studentId: member.studentId,
      tier: fee.tier,
      amountCents: fee.amountCents,
      status: payment?.status ?? null,
      route: payment?.route ?? 'OFFICIAL',
      routeReason: payment?.routeReason ?? null,
      paymentReference: payment?.paymentReference ?? null,
      hasProof: Boolean(payment?.paymentProofPath),
      source: payment?.source ?? null,
      feeSource: fee.source,
      arrangement: arrangement
        ? { tier: arrangement.tier, amountCents: arrangement.amountCents, note: arrangement.note }
        : null,
      hasAccount: member.userId !== null,
      isYou: member.userId === userId,
      declaredByUserId: payment?.declaredByUserId ?? null,
      declaredAt: payment?.declaredAt ?? null,
      confirmedAt: payment?.confirmedAt ?? null,
      confirmedByName: payment?.confirmedBy?.name ?? null,
      rejectedReason: payment?.rejectedReason ?? null,
      // Still uncertain even once a declaration exists. The declaration
      // carries the same guess — a member is never asked which tier they are
      // on — so clearing the flag on sight of one would hide the warning at
      // exactly the moment somebody is about to confirm the guessed amount.
      rosterFee: rosterFeeLabel(rosterLabel),
      tierUncertain: !roster.certain,
      tierBecause: roster.because,
      onRoster: roster.charged,
    })
  }

  return { rows, totals: totalsFor(rows) }
}

function rosterFeeLabel(label: string | null): string {
  const reading = tierFor(label)
  return reading.tier ? TIER_LABEL[reading.tier] : 'not charged'
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
  /** The term's membership form, and whether it is taking responses. */
  form: { state: FormState; forYou: boolean } | null
  /** This person's response to it, if they have sent one. */
  response: { onRoster: boolean; heldPayment: boolean } | null
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
    const [formRow, responseRow] = term
      ? await inTurn([
          tx.membershipForm.findFirst({
            where: { orgId, termId: term.id },
            // RLS shows a member only their own recipient row, so any row
            // here means the form is for them.
            select: { state: true, audience: true, recipients: { select: { memberId: true }, take: 1 } },
          }),
          tx.membershipResponse.findFirst({
            where: { orgId, termId: term.id, userId },
            select: { memberId: true, heldProofPath: true },
          }),
        ])
      : [null, null]
    const form = term
      ? {
          state: formRow?.state ?? ('DRAFT' as const),
          forYou:
            !formRow ||
            formRow.audience === 'EVERYONE' ||
            (member !== null && formRow.recipients.some((row) => row.memberId === member.id)),
        }
      : null
    const response = responseRow
      ? { onRoster: responseRow.memberId !== null, heldPayment: responseRow.heldProofPath !== null }
      : null
    if (!member || !term) {
      return {
        member: member ? { id: member.id, fullName: member.fullName } : null,
        term,
        form,
        response,
        tier: 'FULL' as FeeTier,
        owesNothing: false,
        amountCents: 0,
        payment: null,
      }
    }

    const [payment, arrangement] = await inTurn([
      tx.feePayment.findUnique({
        where: { termId_memberId: { termId: term.id, memberId: member.id } },
      }),
      tx.feeArrangement.findUnique({
        where: { termId_memberId: { termId: term.id, memberId: member.id } },
        select: { tier: true, amountCents: true },
      }),
    ])
    // A closed term says what it said when it closed, not what today's roster
    // would charge.
    const charge =
      term.chargesRecorded && !payment
        ? await tx.termCloseCharge.findUnique({
            where: { termId_memberId: { termId: term.id, memberId: member.id } },
          })
        : null
    const live = resolveFee({
      payment,
      arrangement,
      rosterLabel: member.rosterLabel,
      isActive: member.isActive,
      rates: term,
    })
    const fee =
      term.chargesRecorded && !payment
        ? charge
          ? { ...live, tier: charge.tier, amountCents: charge.amountCents, charged: charge.amountCents > 0 }
          : { ...live, amountCents: 0, charged: false }
        : live
    // Not charged is not a missing fee: it is the roster saying they have
    // left, and somebody who has left owes nothing. A waived fee is the same
    // answer reached by a person.
    const owesNothing = !payment && (!fee.charged || fee.amountCents === 0)

    return {
      member: { id: member.id, fullName: member.fullName },
      term,
      form,
      response,
      tier: fee.tier,
      owesNothing,
      amountCents: owesNothing ? 0 : fee.amountCents,
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
    finalCollectionAt: row.finalCollectionAt && singaporeDay(row.finalCollectionAt),
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

/**
 * The QR a member should scan for what they owe: the half-term one when they
 * owe exactly the half rate and it is up, otherwise the full-term one. Each
 * can have its amount fixed inside it, so the wrong one would charge the
 * wrong figure. Null until the full-term QR, the required one, is up.
 */
export function paynowQrSrc(orgSlug: string, term: TermRow, amountCents: number): string | null {
  if (!term.hasPaynowQr) return null
  const half =
    term.hasHalfPaynowQr && term.halfFeeCents !== term.fullFeeCents && amountCents === term.halfFeeCents
  return `/${orgSlug}/fees/qr/${term.id}${half ? '?rate=half' : ''}`
}
