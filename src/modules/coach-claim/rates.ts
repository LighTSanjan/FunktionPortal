/** Resolve the rate in effect on each session date. */

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

/** Return the latest rate starting on or before the date. */
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
