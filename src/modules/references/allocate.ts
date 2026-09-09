/**
 * Handing out the next reference number.
 *
 * The whole point of this module is that two people generating an invoice at
 * the same moment cannot receive the same number. Reading the counter,
 * adding one and writing it back — the obvious implementation — is exactly
 * how that happens, and the damage is invisible until OSL rejects a
 * submission weeks later.
 *
 * So allocation is a single atomic `UPDATE ... RETURNING` against the
 * counter row, inside the same transaction that writes the document. Postgres
 * serialises the two updates; the loser reads the value the winner wrote.
 * If the document write then fails, the whole transaction rolls back and the
 * number is never issued.
 */
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
 * Allocates the next number in a series and records it.
 *
 * Must be called with a transaction client, not the base client — a number
 * allocated outside the document's transaction is a number that survives the
 * document failing to save.
 */
export async function allocateReference(
  tx: Prisma.TransactionClient,
  args: AllocateArgs,
): Promise<AllocatedReference> {
  const { orgId, series, financialYear, projectCode } = args

  // A counter may not exist yet for this (series, year). Create it at the
  // opening sequence for the org rather than at 1: FY2026 opens partway
  // through, because numbers were issued before the portal existed.
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

/**
 * Raised when no counter has been opened for a series and year.
 *
 * Deliberately not auto-created at 1. A missing counter at the start of a
 * financial year means nobody has said where the numbering resumes, and
 * guessing 0001 would issue numbers that may already be on documents sitting
 * with the Office of Finance.
 */
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
