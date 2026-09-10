import { describe, it, expect } from 'vitest'
import { OSL_REGISTERS } from '../register-osl'
import { SEED_FUND_ROWS as FY2026_SEED_FUND_ROWS } from '../register-fy2026'
import { UNACCOUNTED_REFERENCES } from '../register-fy2024'
import {
  UNOFFICIAL_ROWS,
  UNOFFICIAL_YEAR_TOTALS,
  UNOFFICIAL_SUMMARY,
} from '../register-unofficial'

/**
 * The register data in this folder is a hand transcription of somebody else's
 * bookkeeping — nine years of it, in a sheet with merged cells, three blocks
 * all labelled "Subtotal for 2021", and dates in four different formats.
 *
 * The only thing that makes that trustworthy is the control totals the sheets
 * publish themselves. If a figure is ever corrected here, or a row added, the
 * corresponding total has to be corrected with it or this fails — which is the
 * point. These are the numbers OSL will be looking at.
 */

const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0)

describe.each(OSL_REGISTERS)('the FY$financialYear OSL register', (register) => {
  const sections = [
    ['SEED_FUND', register.seedFund],
    ['INCOME', register.income],
    ['DONATION', register.donation],
  ] as const

  it.each(sections)("reconciles the %s section against the register's totals row", (section, rows) => {
    const want = register.controlTotals[section]
    expect(sum(rows, (r) => r.withoutGstCents ?? 0)).toBe(want.withoutGstCents)
    expect(sum(rows, (r) => r.withGstCents ?? 0)).toBe(want.withGstCents)
    expect(sum(rows, (r) => r.incomeCents ?? 0)).toBe(want.incomeCents)
  })

  it('lands the club on the balance printed in the sheet header', () => {
    // Every section total can be right while the year still ends somewhere
    // else — a row filed under the wrong section reconciles both totals it
    // touches and moves the balance. This is the check that catches that.
    if (register.closingBalanceCents === null) return

    const rows = [...register.seedFund, ...register.income, ...register.donation]
    // The GST-inclusive column is what left the bank, and it is the column the
    // register's own balance formula would use if the FY2026 blanks had been
    // filled in.
    const spent = sum(rows, (r) => r.withGstCents ?? 0)
    const received = sum(rows, (r) => r.incomeCents ?? 0)
    expect(received - spent).toBe(register.closingBalanceCents)
  })

  it('numbers every row it can, and says so where it cannot', () => {
    // A blank reference is allowed but never accidental: it means the register
    // itself has none, which is a thing OSL asks about.
    for (const row of [...register.seedFund, ...register.income]) {
      if (row.reference === null) expect(row.description.length).toBeGreaterThan(0)
    }
  })
})

describe('the OSL registers as a series', () => {
  it('opens each year where the last one closed, give or take three cents', () => {
    // FY2024 closes at $1,842.79 and FY2025 opens at $1,842.82; FY2025 closes
    // at $2,620.47 and FY2026 opens at $2,620.44. Three cents appear at one
    // boundary and disappear at the next, so the club's position today is
    // right by accident. Pinned rather than corrected: the spreadsheets are
    // the authority, and this is what they say.
    const carried = (year: number) =>
      OSL_REGISTERS.find((r) => r.financialYear === year)?.income[0].incomeCents ?? null

    expect(carried(2025)).toBe(184_282)
    expect(carried(2026)).toBe(262_044)

    const fy2024 = OSL_REGISTERS.find((r) => r.financialYear === 2024)!
    const fy2025 = OSL_REGISTERS.find((r) => r.financialYear === 2025)!
    expect(carried(2025)! - fy2024.closingBalanceCents!).toBe(3)
    expect(carried(2026)! - fy2025.closingBalanceCents!).toBe(-3)
  })

  it('keeps the IV series unique across the three years', () => {
    // Except the two July locking fees, one per year, each split across both
    // funds because the seed fund ran out mid-invoice — $350.00 short in
    // FY2024, $194.10 in FY2025. One number, two rows, deliberately.
    const seen = new Map<string, number>()
    for (const register of OSL_REGISTERS) {
      for (const row of [...register.seedFund, ...register.income]) {
        if (!row.reference?.startsWith('IV')) continue
        seen.set(row.reference, (seen.get(row.reference) ?? 0) + 1)
      }
    }
    const repeated = [...seen].filter(([, n]) => n > 1).map(([ref]) => ref)
    expect(repeated).toEqual(['IV24-097-0010', 'IV25-097-0011'])
  })

  it('records IV24-097-0024 as unaccounted for rather than skipping it', () => {
    // The FY2024 register jumps 0023 → 0025. A gap in a running series is
    // exactly what OSL queries, so it is written down rather than left to be
    // rediscovered.
    const numbers = OSL_REGISTERS.find((r) => r.financialYear === 2024)!
      .income.map((row) => row.reference)
    expect(numbers).toContain('IV24-097-0023')
    expect(numbers).toContain('IV24-097-0025')
    expect(numbers).not.toContain('IV24-097-0024')
    expect(UNACCOUNTED_REFERENCES).toContain('IV24-097-0024')
  })
})

describe('the FY2026 OSL register', () => {
  it('leaves the four un-numbered coach rows without a without-GST figure', () => {
    // Not an oversight in the transcription — it is the defect in the register
    // that makes its own Seed Fund balance read $1,520.00 instead of $305.00,
    // because that formula subtracts the without-GST column.
    const blank = FY2026_SEED_FUND_ROWS.filter((r) => r.withGstCents !== null && r.withoutGstCents === null)
    expect(blank).toHaveLength(4)
    expect(sum(blank, (r) => r.withGstCents ?? 0)).toBe(121_500)
  })
})

describe('the unofficial funds register', () => {
  it.each(Object.keys(UNOFFICIAL_YEAR_TOTALS).map(Number))(
    'reconciles %i against the subtotal published under it',
    (year) => {
      const rows = UNOFFICIAL_ROWS.filter((r) => r.year === year)
      const want = UNOFFICIAL_YEAR_TOTALS[year]
      expect(sum(rows, (r) => r.creditCents)).toBe(want.creditCents)
      expect(sum(rows, (r) => r.debitCents)).toBe(want.debitCents)
    }
  )

  it("reconciles against the sheet's summary box", () => {
    const credit = sum(UNOFFICIAL_ROWS, (r) => r.creditCents)
    const debit = sum(UNOFFICIAL_ROWS, (r) => r.debitCents)
    expect(credit).toBe(UNOFFICIAL_SUMMARY.totalCreditCents)
    expect(debit).toBe(UNOFFICIAL_SUMMARY.totalDebitCents)
    expect(credit - debit).toBe(UNOFFICIAL_SUMMARY.netBalanceCents)
  })

  it('puts the club at $677.14 of unofficial money on 1 April 2026', () => {
    // The balance the FY2026 fund account opens at. Derived rather than
    // asserted from the sheet, which only publishes the closing figure: take
    // the closing $550.19 back out through the year's own movement.
    const fy2026 = UNOFFICIAL_ROWS.filter(
      (r) => r.on !== null && r.on >= '2026-04-01' && r.on <= '2027-03-31'
    )
    const opening =
      UNOFFICIAL_SUMMARY.netBalanceCents -
      sum(fy2026, (r) => r.creditCents) +
      sum(fy2026, (r) => r.debitCents)

    expect(fy2026).toHaveLength(13)
    expect(opening).toBe(67_714)
  })

  it('carries every row with a usable date in ISO form', () => {
    for (const row of UNOFFICIAL_ROWS) {
      if (row.on === null) continue
      expect(row.on, row.description).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(row.on)), row.description).toBe(false)
    }
  })
})
