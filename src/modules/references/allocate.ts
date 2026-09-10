/** Allocate and record the next reference with one atomic counter update. */
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

/** Must share the transaction that writes the numbered document. */
export async function allocateReference(
  tx: Prisma.TransactionClient,
  args: AllocateArgs,
): Promise<AllocatedReference> {
  const { orgId, series, financialYear, projectCode } = args

  const rows = await tx.$queryRaw<Array<{ next_sequence: number }>>`
    UPDATE reference_counters
       SET next_sequence = next_sequence + 1,
           updated_at = now()
     WHERE org_id = ${orgId}
       AND series = ${series}::"DocSeries"
       AND financial_year = ${financialYear}
    RETURNING next_sequence - 1 AS next_sequence
  `

  if (rows.length === 0) {
    throw new NoCounterError(series, financialYear)
  }

  const sequence = rows[0].next_sequence
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
