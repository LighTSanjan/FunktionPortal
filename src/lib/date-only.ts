/** Convert between local calendar dates and Prisma/Postgres UTC `date` values. */

/** A local-midnight calendar date, ready for a `date` column. */
export function toDateColumn(local: Date): Date {
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()))
}

/** A `date` column, back to the local-midnight calendar date it represents. */
export function fromDateColumn(stored: Date): Date {
  return new Date(stored.getUTCFullYear(), stored.getUTCMonth(), stored.getUTCDate())
}
