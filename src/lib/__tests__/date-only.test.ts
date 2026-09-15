import { describe, it, expect } from 'vitest'
import { toDateColumn, fromDateColumn, singaporeDay } from '../date-only'
import { isoDate } from '@/modules/coach-claim/theme'

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

  it('fills a date field with the day that was stored, not the day before', () => {
    // A term's final collection on the 30th, read back as a local calendar
    // date. toISOString() east of UTC gave the 29th and saving wrote it back.
    expect(isoDate(fromDateColumn(new Date('2026-09-30T00:00:00Z')))).toBe('2026-09-30')
  })

  it('reads an instant as the Singapore day it falls on', () => {
    // 7am on the 30th in Singapore is still the 29th in UTC.
    expect(ymd(singaporeDay(new Date('2026-09-29T23:00:00Z')))).toEqual([2026, 9, 30])
    // A date column's UTC midnight is 8am the same day in Singapore.
    expect(ymd(singaporeDay(new Date('2026-09-30T00:00:00Z')))).toEqual([2026, 9, 30])
    expect(ymd(singaporeDay(new Date('2026-09-30T15:59:00Z')))).toEqual([2026, 9, 30])
    expect(ymd(singaporeDay(new Date('2026-09-30T16:00:00Z')))).toEqual([2026, 10, 1])
  })
})
