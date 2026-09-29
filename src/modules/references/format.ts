/** Format and parse OSL document references (Finance Guidelines §4.4). */
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

/** Financial years run April through March. */
export function financialYearOf(date: Date): number {
  const year = date.getFullYear()
  return date.getMonth() >= 3 ? year : year - 1
}

/** FY2026 -> 26, the form the reference number carries. */
function shortFinancialYear(financialYear: number): number {
  return financialYear % 100
}

export function formatReference(parts: ReferenceParts): string {
  const { series, financialYear, projectCode, sequence } = parts

  if (!/^\d{3}$/.test(projectCode)) {
    throw new Error(`Project code must be three digits, got "${projectCode}"`)
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
    throw new Error(`Sequence must be between 1 and 9999, got ${sequence}`)
  }

  const yy = String(shortFinancialYear(financialYear)).padStart(2, '0')
  return `${series}${yy}-${projectCode}-${String(sequence).padStart(4, '0')}`
}

/** Return null for malformed human-entered references. */
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
