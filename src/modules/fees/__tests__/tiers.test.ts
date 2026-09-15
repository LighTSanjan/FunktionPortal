/** Reading a hand-typed roster label as a fee tier. */
import { describe, it, expect } from 'vitest'
import { tierFor, amountForTier, resolveFee } from '../tiers'

const RATES = { fullFeeCents: 70_00, halfFeeCents: 35_00, exchangeFeeCents: null }

describe('tierFor', () => {
  it('reads the labels the club actually uses', () => {
    // Every one of these is in the 2026 roster as it stands.
    expect(tierFor('Confirmed').tier).toBe('FULL')
    expect(tierFor('1/2 term').tier).toBe('HALF')
    expect(tierFor('Confirmed; Exchange').tier).toBe('EXCHANGE_DISCOUNT')
    expect(tierFor('Graduated').tier).toBeNull()
  })

  it('ignores the note somebody left after the semicolon', () => {
    const reading = tierFor('Confirmed; praying for swift recovery')
    expect(reading.tier).toBe('FULL')
    expect(reading.certain).toBe(true)
  })

  it('charges nobody who has left', () => {
    for (const label of ['Graduated', 'Left after Term 5', 'Alumni', 'Exited']) {
      expect(tierFor(label).tier, label).toBeNull()
    }
  })

  it('flags a hedge instead of treating it as a decision', () => {
    // "May come back?" is three real rows. A question mark in the status
    // column is not somebody agreeing to pay seventy dollars.
    const reading = tierFor('May come back?')
    expect(reading.tier).toBe('FULL')
    expect(reading.certain).toBe(false)
  })

  it('flags an empty or unfamiliar label rather than guessing quietly', () => {
    expect(tierFor(null).certain).toBe(false)
    expect(tierFor('').certain).toBe(false)
    const odd = tierFor('committee')
    expect(odd.tier).toBe('FULL')
    expect(odd.certain).toBe(false)
    // The screen that asks has to be able to say what it read.
    expect(odd.because).toContain('committee')
  })

  it('reads exchange ahead of half where a label says both', () => {
    expect(tierFor('1/2 term; Exchange').tier).toBe('EXCHANGE_DISCOUNT')
  })
})

describe('what a null tier means', () => {
  it('is "owes nothing", never "we could not tell"', () => {
    // Both the member's own page and the declaration action used to do
    // `?? 'FULL'` on this, which turned a graduated member into a
    // seventy-dollar bill and would have taken their money.
    for (const label of ['Graduated', 'Left after Term 5', 'Alumni']) {
      const reading = tierFor(label)
      expect(reading.tier, label).toBeNull()
      expect(reading.certain, label).toBe(true)
    }
  })

  it('is not what an unreadable label produces', () => {
    // An unfamiliar label is a question, and a question is not a departure.
    expect(tierFor('committee').tier).not.toBeNull()
    expect(tierFor(null).tier).not.toBeNull()
  })
})

describe('amountForTier', () => {
  it('charges the term rates', () => {
    expect(amountForTier('FULL', RATES)).toBe(70_00)
    expect(amountForTier('HALF', RATES)).toBe(35_00)
    expect(amountForTier('WAIVED', RATES)).toBe(0)
  })

  it('falls back to the half rate for exchange, and prefers a stated one', () => {
    expect(amountForTier('EXCHANGE_DISCOUNT', RATES)).toBe(35_00)
    expect(amountForTier('EXCHANGE_DISCOUNT', { ...RATES, exchangeFeeCents: 20_00 })).toBe(20_00)
  })
})

describe('resolveFee', () => {
  const base = { payment: null, arrangement: null, rosterLabel: 'Confirmed', isActive: true, rates: RATES }

  it('reads the roster when nobody has decided', () => {
    expect(resolveFee({ ...base, rosterLabel: '1/2 term' })).toMatchObject({
      tier: 'HALF',
      amountCents: 35_00,
      source: 'roster',
      charged: true,
    })
  })

  it('lets the exco put somebody on a lesser fee, whatever the roster says', () => {
    const fee = resolveFee({ ...base, arrangement: { tier: 'CUSTOM', amountCents: 20_00 } })
    expect(fee).toMatchObject({ tier: 'CUSTOM', amountCents: 20_00, source: 'exco', certain: true })
    expect(resolveFee({ ...base, arrangement: { tier: 'WAIVED', amountCents: null } }).amountCents).toBe(0)
  })

  it('clears the doubt a hedged label raises once the exco decide', () => {
    expect(resolveFee({ ...base, rosterLabel: 'May come back?' }).certain).toBe(false)
    expect(
      resolveFee({ ...base, rosterLabel: 'May come back?', arrangement: { tier: 'HALF', amountCents: null } }).certain
    ).toBe(true)
  })

  it('prices an exco-set tier from the rates, so a corrected rate reaches them', () => {
    const fee = resolveFee({
      ...base,
      arrangement: { tier: 'HALF', amountCents: null },
      rates: { ...RATES, halfFeeCents: 40_00 },
    })
    expect(fee.amountCents).toBe(40_00)
  })

  it('charges somebody who has left only if the exco say so', () => {
    expect(resolveFee({ ...base, rosterLabel: 'Graduated' }).charged).toBe(false)
    expect(resolveFee({ ...base, isActive: false }).charged).toBe(false)
    expect(
      resolveFee({ ...base, rosterLabel: 'Graduated', arrangement: { tier: 'FULL', amountCents: null } }).charged
    ).toBe(true)
  })

  it('never reprices what was paid', () => {
    const fee = resolveFee({
      ...base,
      payment: { tier: 'FULL', amountCents: 60_00 },
      arrangement: { tier: 'HALF', amountCents: null },
    })
    expect(fee).toMatchObject({ tier: 'FULL', amountCents: 60_00, source: 'payment' })
  })

  it('prices a custom amount from the arrangement', () => {
    expect(amountForTier('CUSTOM', RATES, 12_50)).toBe(12_50)
    expect(amountForTier('CUSTOM', RATES)).toBe(0)
  })
})

