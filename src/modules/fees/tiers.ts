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

/** The order the exco are offered them in. */
export const TIER_CHOICES: readonly FeeTier[] = ['FULL', 'HALF', 'EXCHANGE_DISCOUNT', 'CUSTOM', 'WAIVED']

export interface ResolvedFee {
  tier: FeeTier
  amountCents: number
  /** Whether a person has decided this, or the portal read it off the roster. */
  source: 'payment' | 'exco' | 'roster'
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
 * Otherwise the exco's own decision, and only then the roster label — which
 * is a hand-typed cell, read generously and flagged when unsure.
 */
export function resolveFee(input: {
  payment: { tier: FeeTier; amountCents: number } | null
  arrangement: { tier: FeeTier; amountCents: number | null } | null
  rosterLabel: string | null
  isActive: boolean
  rates: TermRates
}): ResolvedFee {
  const { payment, arrangement, rosterLabel, isActive, rates } = input

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
