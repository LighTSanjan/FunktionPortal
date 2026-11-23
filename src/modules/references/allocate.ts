/** Allocate and record the next reference, reusing voided numbers first. */
import type { Prisma, DocSeries } from '@prisma/client'
import { formatReference } from './format'

export interface AllocateArgs {
  orgId: string
  series: DocSeries
  financialYear: number
  /** Last three digits of the StuOrg project code, e.g. "097". */
  projectCode: string
}

export interface AllocatedReference {
  id: string
  formatted: string
  sequence: number
}

/**
 * Must share the transaction that writes the numbered document.
 *
 * The series is meant to have no gaps, so a number whose document was voided
 * is issued again before the counter moves on. The counter row is locked
 * first: two documents raised at once are handed numbers one after the other,
 * never the same one, and the partial unique index on live rows is the
 * backstop if that ever fails.
 *
 * The voided document keeps its own row, number and reason. Reusing the number
 * writes a new row beside it rather than reviving the old one.
 */
export async function allocateReference(
  tx: Prisma.TransactionClient,
  args: AllocateArgs,
): Promise<AllocatedReference> {
  const { orgId, series, financialYear, projectCode } = args

  const counter = await tx.$queryRaw<Array<{ next_sequence: number }>>`
    SELECT next_sequence
      FROM reference_counters
     WHERE org_id = ${orgId}
       AND series = ${series}::"DocSeries"
       AND financial_year = ${financialYear}
       FOR UPDATE
  `

  if (counter.length === 0) {
    throw new NoCounterError(series, financialYear)
  }

  const free = await tx.$queryRaw<Array<{ sequence: number }>>`
    SELECT v.sequence
      FROM reference_numbers v
     WHERE v.org_id = ${orgId}
       AND v.series = ${series}::"DocSeries"
       AND v.financial_year = ${financialYear}
       AND v.voided_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM reference_numbers l
          WHERE l.org_id = v.org_id
            AND l.series = v.series
            AND l.financial_year = v.financial_year
            AND l.sequence = v.sequence
            AND l.voided_at IS NULL
       )
     ORDER BY v.sequence
     LIMIT 1
  `

  let sequence: number
  if (free.length > 0) {
    sequence = free[0].sequence
  } else {
    const bumped = await tx.$queryRaw<Array<{ next_sequence: number }>>`
      UPDATE reference_counters
         SET next_sequence = next_sequence + 1,
             updated_at = now()
       WHERE org_id = ${orgId}
         AND series = ${series}::"DocSeries"
         AND financial_year = ${financialYear}
      RETURNING next_sequence - 1 AS next_sequence
    `
    sequence = bumped[0].next_sequence
  }

  const formatted = formatReference({ series, financialYear, projectCode, sequence })

  const record = await tx.referenceNumber.create({
    data: { orgId, series, financialYear, sequence, formatted },
    select: { id: true },
  })

  return { id: record.id, formatted, sequence }
}

/** Missing counters fail rather than risking reuse of an issued number. */
export class NoCounterError extends Error {
  constructor(readonly series: DocSeries, readonly financialYear: number) {
    super(
      `No ${series} counter for FY20${String(financialYear % 100).padStart(2, '0')}. ` +
        'Open one with the next unused sequence before issuing documents — ' +
        'it is not safe to assume 0001.',
    )
    this.name = 'NoCounterError'
  }
}
