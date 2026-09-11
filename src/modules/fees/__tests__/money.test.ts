/** Deriving GST for the Income Deposit Form. */
import { describe, it, expect } from 'vitest'
import { splitGst, exemptSplit, DEFAULT_GST_BASIS_POINTS } from '../money'

describe('splitGst', () => {
  it('derives the net from an inclusive gross at 9%', () => {
    // $109.00 collected is $100.00 of income and $9.00 of tax.
    expect(splitGst(109_00, DEFAULT_GST_BASIS_POINTS)).toEqual({
      grossCents: 109_00,
      netCents: 100_00,
      gstCents: 9_00,
    })
  })

  it('always adds back up to what was banked', () => {
    // The property that matters. Rounding net and tax independently produces
    // pairs that miss the gross by a cent, and the register reconciles
    // against the bank rather than against arithmetic.
    for (let gross = 0; gross <= 5_000; gross += 7) {
      const split = splitGst(gross, DEFAULT_GST_BASIS_POINTS)
      expect(split.netCents + split.gstCents).toBe(gross)
    }
  })

  it('handles a real term collection', () => {
    // 46 members at $35.00.
    const split = splitGst(1_610_00, DEFAULT_GST_BASIS_POINTS)
    expect(split.netCents).toBe(1_477_06)
    expect(split.gstCents).toBe(132_94)
    expect(split.netCents + split.gstCents).toBe(1_610_00)
  })

  it('is a no-op at a zero rate', () => {
    expect(splitGst(500_00, 0)).toEqual({ grossCents: 500_00, netCents: 500_00, gstCents: 0 })
  })

  it('refuses fractional cents rather than rounding them silently', () => {
    expect(() => splitGst(10.5, DEFAULT_GST_BASIS_POINTS)).toThrow()
    expect(() => splitGst(-100, DEFAULT_GST_BASIS_POINTS)).toThrow()
  })
})

describe('exemptSplit', () => {
  it('carries no tax component at all', () => {
    // Exempt is not the same as taxed at zero, and the form says so.
    expect(exemptSplit(250_00)).toEqual({ grossCents: 250_00, netCents: 250_00, gstCents: 0 })
  })
})
