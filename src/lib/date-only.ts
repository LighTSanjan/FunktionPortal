/** Convert between local calendar dates and Prisma/Postgres UTC `date` values. */

/** A local-midnight calendar date, ready for a `date` column. */
export function toDateColumn(local: Date): Date {
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()))
}

/** A `date` column, back to the local-midnight calendar date it represents. */
export function fromDateColumn(stored: Date): Date {
  return new Date(stored.getUTCFullYear(), stored.getUTCMonth(), stored.getUTCDate())
}

const SINGAPORE_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * The Singapore calendar day a moment falls on, as a local-midnight date.
 *
 * Also right for a `date` column read raw: its UTC midnight is 8am the same
 * day in Singapore. So a column that has held both — a date somebody typed, or
 * "today" stamped when nobody typed one — reads back as the day it meant.
 */
export function singaporeDay(moment: Date): Date {
  const [year, month, day] = SINGAPORE_DAY.format(moment).split('-').map(Number)
  return new Date(year, month - 1, day)
}
