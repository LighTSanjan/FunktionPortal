/**
 * The OSL document labelling protocol (Finance Guidelines §4.4).
 *
 * Four independent series, each resetting to 0001 at the start of the
 * financial year, each numbered separately from the others. The hyphens are
 * mandatory: the register already contains one number written INC-26-097-0001
 * with a hyphen after the prefix, which is not the protocol's form.
 *
 * Pure functions only — no database, no clock. The allocator lives next door
 * in allocate.ts.
 */
import type { DocSeries } from '@prisma/client'

/** IV26-097-0010 */
const REFERENCE = /^(SCF|IV|PO|INC)(\d{2})-(\d{3})-(\d{4})$/

export interface ReferenceParts {
  series: DocSeries
  /** Two-digit financial year as it appears in the number: 26 for FY2026. */
  financialYear: number
  /** Last three digits of the StuOrg project code. */
  projectCode: string
  sequence: number
}

/**
 * The financial year a date falls in. April to March, so 1 March 2027 is
 * still FY2026 and 1 April 2027 is FY2027.
 *
 * This is the boundary that makes the March 2027 handover awkward: the
 * outgoing treasurer's last month and the incoming one's first fall either
 * side of a counter reset, and a number issued in the wrong year is a
 * different document entirely.
 */
export function financialYearOf(date: Date): number {
  const year = date.getFullYear()
  return date.getMonth() >= 3 ? year : year - 1
}

/** FY2026 -> 26, the form the reference number carries. */
export function shortFinancialYear(financialYear: number): number {
  return financialYear % 100
}

export function formatReference(parts: ReferenceParts): string {
  const { series, financialYear, projectCode, sequence } = parts

  if (!/^\d{3}$/.test(projectCode)) {
    throw new Error(`Project code must be three digits, got "${projectCode}"`)
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
    // 9999 is not a limit anyone will reach; it is the point at which the
    // format stops being able to represent the number, which is worth
    // failing on rather than silently widening the field.
    throw new Error(`Sequence must be between 1 and 9999, got ${sequence}`)
  }

  const yy = String(shortFinancialYear(financialYear)).padStart(2, '0')
  return `${series}${yy}-${projectCode}-${String(sequence).padStart(4, '0')}`
}

/**
 * Reads a reference back. Returns null rather than throwing, because the
 * caller is usually checking something a human typed into the register and a
 * malformed value is an expected finding, not an exceptional one.
 */
export function parseReference(value: string): ReferenceParts | null {
  const match = REFERENCE.exec(value.trim())
  if (!match) return null

  const [, series, yy, projectCode, sequence] = match
  return {
    series: series as DocSeries,
    financialYear: Number(yy),
    projectCode,
    sequence: Number(sequence),
  }
}
