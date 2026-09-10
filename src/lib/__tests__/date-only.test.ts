import { describe, it, expect } from 'vitest'
import { toDateColumn, fromDateColumn } from '../date-only'

/**
 * The property that matters: a calendar date written to a `date` column and
 * read back is the same calendar date, in whatever timezone the server
 * happens to be in. Without it an invoice raised on the 15th came back
 * numbered and dated the 14th, disagreeing with the document number recorded
 * beside it.
 */
describe('date-only columns', () => {
  const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()]

  it('round-trips a local calendar date', () => {
    for (const [y, m, d] of [
      [2026, 9, 15],
      [2026, 1, 1],
      [2026, 12, 31],
      // Either side of a month boundary, where an off-by-one shows.
      [2027, 3, 1],
      [2027, 2, 28],
    ] as const) {
      const local = new Date(y, m - 1, d)
      expect(ymd(fromDateColumn(toDateColumn(local)))).toEqual([y, m, d])
    }
  })

  it('writes the local date part, not the UTC instant', () => {
    const stored = toDateColumn(new Date(2026, 8, 15))
    expect(stored.toISOString().slice(0, 10)).toBe('2026-09-15')
  })

  it('reads a UTC-midnight column as the same day locally', () => {
    expect(ymd(fromDateColumn(new Date('2026-09-15T00:00:00Z')))).toEqual([2026, 9, 15])
  })
})
