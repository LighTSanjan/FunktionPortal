/**
 * Which rate applied when.
 *
 * The rate rises at term and year boundaries and guests are booked at
 * whatever was agreed for that workshop, so "the instructor's rate" is only
 * ever meaningful with a date attached. Resolving it per session rather than
 * per invoice also means a month that straddles a rise bills correctly
 * without anyone noticing it straddled one.
 *
 * Pure. Takes plain rows, so the caller maps from the database and this stays
 * testable without one.
 */

import { isoDate } from './theme'

export interface RateSchedule {
  hourlyRateCents: number
  /** The first date this rate applies to. No end date — the next row ends it. */
  effectiveFrom: Date
  note?: string
}

export class NoRateError extends Error {
  constructor(readonly instructorName: string, readonly on: Date) {
    super(
      `No rate on file for ${instructorName} on ${isoDate(on)}. ` +
        'Every session has to bill at a rate somebody agreed, so add one effective ' +
        'from that date or earlier before generating the invoice.',
    )
    this.name = 'NoRateError'
  }
}

/** Midnight-comparable, so a rate effective on the 1st covers a class on the 1st. */
function atMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * The rate in force on a date: the latest one starting on or before it.
 *
 * Throws rather than defaulting. A missing rate is somebody not having agreed
 * a price yet, and inventing one produces an invoice that looks authoritative
 * and is wrong.
 */
export function rateForDate(rates: RateSchedule[], on: Date, instructorName = 'this instructor'): number {
  const when = atMidnight(on)

  const applicable = rates
    .filter((r) => atMidnight(r.effectiveFrom) <= when)
    .sort((a, b) => atMidnight(b.effectiveFrom) - atMidnight(a.effectiveFrom))

  if (applicable.length === 0) {
    throw new NoRateError(instructorName, on)
  }
  return applicable[0].hourlyRateCents
}

/** The distinct rates a set of dates bills at, ascending. */
export function distinctRates(rates: RateSchedule[], dates: Date[], instructorName?: string): number[] {
  const seen = new Set(dates.map((d) => rateForDate(rates, d, instructorName)))
  return [...seen].sort((a, b) => a - b)
}
