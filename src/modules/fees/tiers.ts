/**
 * What a member owes for a term, read off the roster label the club already
 * keeps.
 *
 * The labels are free text typed into a spreadsheet by four years of
 * secretaries — "Confirmed", "1/2 term", "Confirmed; Exchange", and one that
 * reads "Confirmed; praying for swift recovery". So this reads them
 * generously and says how sure it is, rather than pretending a hand-typed
 * cell is an enum. Anything it is not sure about is shown to the exco before
 * a figure is charged to anybody.
 */
import type { FeeTier } from '@prisma/client'
import { isDepartedLabel } from '@/modules/attendance/match'

export interface TierReading {
  /** Null means nothing is owed: they are not on the roster this term. */
  tier: FeeTier | null
  /**
   * False when the label did not clearly say. The tier is still the best
   * guess, and the exco is asked before it becomes a charge.
   */
  certain: boolean
  /** Why, in a phrase, for the screen that asks. */
  because: string
}

const HALF = /\b(1\/2|half)\b/i
const EXCHANGE = /\bexchange\b/i
const CONFIRMED = /\bconfirmed\b/i
/** "May come back?" — a question mark is not a roster decision. */
const HEDGED = /\?|maybe|unsure|tbc/i

export function tierFor(rosterLabel: string | null): TierReading {
  const label = (rosterLabel ?? '').trim()

  if (label === '') {
    return { tier: 'FULL', certain: false, because: 'no status on the roster' }
  }
  if (isDepartedLabel(label)) {
    return { tier: null, certain: true, because: 'left the club' }
  }
  if (HEDGED.test(label)) {
    // Read before the others on purpose: "May come back?" carries none of the
    // words below, and a hedge is the whole content of the cell.
    return { tier: 'FULL', certain: false, because: 'the roster is not sure they are here' }
  }
  if (EXCHANGE.test(label)) {
    return { tier: 'EXCHANGE_DISCOUNT', certain: true, because: 'on exchange' }
  }
  if (HALF.test(label)) {
    return { tier: 'HALF', certain: true, because: 'half a term' }
  }
  if (CONFIRMED.test(label)) {
    // Anything after a semicolon is a note somebody left for themselves.
    return { tier: 'FULL', certain: true, because: 'confirmed for the term' }
  }
  return { tier: 'FULL', certain: false, because: `the roster says "${label}"` }
}

export interface TermRates {
  fullFeeCents: number
  halfFeeCents: number
  /** Null charges an exchange student the half-term rate. */
  exchangeFeeCents: number | null
}

/**
 * The figure for a tier. The browser never posts one.
 *
 * Exchange falls back to the half-term rate where the club has not set its
 * own, because that is the arrangement the rate exists for — but it is a
 * separate field so that a club charging exchange students something else can
 * say so rather than have it inferred here.
 */
export function amountForTier(tier: FeeTier, rates: TermRates, customCents?: number | null): number {
  switch (tier) {
    case 'FULL':
      return rates.fullFeeCents
    case 'HALF':
      return rates.halfFeeCents
    case 'EXCHANGE_DISCOUNT':
      return rates.exchangeFeeCents ?? rates.halfFeeCents
    case 'WAIVED':
      return 0
    case 'CUSTOM':
      return customCents ?? 0
  }
}

export const TIER_LABEL: Record<FeeTier, string> = {
  FULL: 'Full term',
  HALF: 'Half term',
  EXCHANGE_DISCOUNT: 'Exchange',
  WAIVED: 'Waived',
  CUSTOM: 'Custom amount',
}

/**
 * The fees a member may pick for themselves on the form. Never a waiver or a
 * figure of their own: those are the exco's to give.
 */
export const MEMBER_CHOICES: readonly FeeTier[] = ['FULL', 'HALF', 'EXCHANGE_DISCOUNT']

/** The order the exco are offered them in. */
export const TIER_CHOICES: readonly FeeTier[] = ['FULL', 'HALF', 'EXCHANGE_DISCOUNT', 'CUSTOM', 'WAIVED']

export interface ResolvedFee {
  tier: FeeTier
  amountCents: number
  /**
   * Whether a payment fixed this, the exco decided it, the member picked it on
   * the membership form, or the portal read it off the roster.
   */
  source: 'payment' | 'exco' | 'member' | 'roster'
  /** False when the roster label was a guess nobody has confirmed. */
  certain: boolean
  because: string
  /**
   * Whether this member is charged for the term at all. False for somebody
   * the roster has as having left, unless the exco set a fee or they paid.
   */
  charged: boolean
}

/**
 * What one member owes for one term, and why.
 *
 * A payment fixes it: whatever was confirmed or declared is what was paid.
 * Otherwise the exco's own decision, then what the member picked on the
 * membership form, and only then the roster label — which is a hand-typed
 * cell, read generously and flagged when unsure.
 *
 * A member's pick is their word, not the club's. It is charged, because
 * somebody who says they are here for half the term should be asked for half,
 * but it is flagged whenever the roster says something different, so the exco
 * see "picked half, roster says full" before they confirm the money.
 */
export function resolveFee(input: {
  payment: { tier: FeeTier; amountCents: number } | null
  arrangement: { tier: FeeTier; amountCents: number | null } | null
  /** The fee picked on this term's membership form, if one was. */
  choice?: FeeTier | null
  rosterLabel: string | null
  isActive: boolean
  rates: TermRates
}): ResolvedFee {
  const { payment, arrangement, choice, rosterLabel, isActive, rates } = input

  if (payment) {
    return {
      tier: payment.tier,
      amountCents: payment.amountCents,
      source: 'payment',
      certain: true,
      because: 'what was paid',
      charged: true,
    }
  }

  if (arrangement) {
    return {
      tier: arrangement.tier,
      amountCents: amountForTier(arrangement.tier, rates, arrangement.amountCents),
      source: 'exco',
      certain: true,
      because: 'set by the exco',
      charged: true,
    }
  }

  const reading = tierFor(rosterLabel)

  if (choice && MEMBER_CHOICES.includes(choice)) {
    // Somebody not on the roster at all, or whose row nobody was sure of, is
    // taken at their word. Otherwise their word has to agree with the roster.
    const agrees = rosterLabel === null || !reading.certain || reading.tier === choice
    return {
      tier: choice,
      amountCents: amountForTier(choice, rates),
      source: 'member',
      certain: agrees,
      because: agrees
        ? `picked ${TIER_LABEL[choice].toLowerCase()} on the form`
        : `picked ${TIER_LABEL[choice].toLowerCase()}, the roster says ${reading.tier ? TIER_LABEL[reading.tier].toLowerCase() : 'they left'}`,
      // Filling in this term's form is saying you are here this term.
      charged: true,
    }
  }

  const tier = reading.tier ?? 'FULL'
  return {
    tier,
    amountCents: amountForTier(tier, rates),
    source: 'roster',
    certain: reading.certain,
    because: reading.because,
    charged: reading.tier !== null && isActive,
  }
}
