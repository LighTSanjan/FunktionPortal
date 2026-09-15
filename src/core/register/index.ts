import 'server-only'

import type { RegisterSection } from '@prisma/client'
import { dbAs } from '@/core/db'
import { sameReference } from '@/lib/reference-match'

export const SECTION_FUND: Record<RegisterSection, 'SEED' | 'INCOME' | 'DONATION' | 'UNOFFICIAL'> = {
  SEED_FUND: 'SEED',
  INCOME: 'INCOME',
  DONATION: 'DONATION',
  UNOFFICIAL: 'UNOFFICIAL',
}

export const SECTION_ORDER: RegisterSection[] = ['SEED_FUND', 'INCOME', 'DONATION', 'UNOFFICIAL']

export const SECTION_LABEL: Record<RegisterSection, string> = {
  SEED_FUND: 'OSL Seed Fund',
  INCOME: 'Income',
  DONATION: 'Donations',
  UNOFFICIAL: 'Unofficial',
}

export interface LedgerEntry {
  id: string
  section: RegisterSection
  financialYear: number
  reference: string | null
  description: string
  payeeName: string | null
  documentDate: Date | null
  /** Positive money in, negative money out. */
  amountCents: number
  submittedToOslAt: Date | null
  bankedInAt: Date | null
  /**
   * Raised in the portal rather than imported from the club's spreadsheet:
   * a coach invoice or a membership collection banked in.
   */
  fromPortal: boolean
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Convert separate register columns into one signed ledger amount. */
function toAmount(row: {
  incomeCents: number | null
  expenseWithGstCents: number | null
  expenseWithoutGstCents: number | null
}): number {
  if (row.incomeCents !== null && row.incomeCents !== 0) return row.incomeCents
  const spent = row.expenseWithGstCents ?? row.expenseWithoutGstCents ?? 0
  return -spent
}

interface LedgerFilter {
  section?: RegisterSection
  financialYear?: number
}

/**
 * The register as the club keeps it: every row imported from the spreadsheet,
 * and every document the portal itself raised that is not on it yet.
 *
 * Invoices and deposits raised here used to be missing from the register
 * altogether, so the portal's register stopped in whatever month the sheet
 * was last imported while the fund balances carried on. A portal document
 * that was also typed into the sheet is matched on its reference number —
 * loosely, because the sheet is typed by hand — and shown once, as the
 * sheet has it.
 */
async function ledgerRows(userId: string, orgId: string, filter: LedgerFilter): Promise<LedgerEntry[]> {
  const { imported, invoices, deposits } = await dbAs(userId, async (tx) => ({
    imported: await tx.registerEntry.findMany({
      where: {
        orgId,
        ...(filter.section ? { section: filter.section } : {}),
        ...(filter.financialYear ? { financialYear: filter.financialYear } : {}),
      },
    }),
    invoices:
      filter.section && filter.section !== 'SEED_FUND' && filter.section !== 'INCOME'
        ? []
        : await tx.invoice.findMany({
            where: {
              orgId,
              status: { not: 'VOID' },
              referenceNumber: filter.financialYear ? { financialYear: filter.financialYear } : { isNot: null },
              ...(filter.section ? { fundSource: filter.section === 'SEED_FUND' ? 'SEED' : 'INCOME' } : {}),
            },
            select: {
              id: true,
              fundSource: true,
              totalCents: true,
              subtotalCents: true,
              periodMonth: true,
              invoiceDate: true,
              submittedToOslAt: true,
              referenceNumber: { select: { formatted: true, financialYear: true } },
              instructor: { select: { fullName: true, danceStyle: true } },
            },
          }),
    deposits:
      filter.section && filter.section !== 'INCOME'
        ? []
        : await tx.incomeDeposit.findMany({
            where: {
              orgId,
              referenceNumber: filter.financialYear ? { financialYear: filter.financialYear } : { isNot: null },
            },
            select: {
              id: true,
              eventName: true,
              netCents: true,
              finalCollectionAt: true,
              referenceNumber: { select: { formatted: true, financialYear: true } },
            },
          }),
  }))

  const onSheet = (reference: string | undefined) =>
    reference !== undefined && imported.some((row) => sameReference(row.referenceNumber, reference))

  const rows: (LedgerEntry & { sheetRowNumber: number | null })[] = imported.map((row) => ({
    id: row.id,
    section: row.section,
    financialYear: row.financialYear,
    reference: row.referenceNumber,
    description: row.description,
    payeeName: row.payeeName,
    documentDate: row.documentDate,
    amountCents: toAmount(row),
    submittedToOslAt: row.submittedToOslAt,
    bankedInAt: row.bankedInAt,
    fromPortal: false,
    sheetRowNumber: row.sheetRowNumber,
  }))

  for (const invoice of invoices) {
    const reference = invoice.referenceNumber?.formatted
    if (!reference || onSheet(reference)) continue
    rows.push({
      id: `invoice-${invoice.id}`,
      section: invoice.fundSource === 'SEED' ? 'SEED_FUND' : 'INCOME',
      financialYear: invoice.referenceNumber!.financialYear,
      reference,
      // The way the sheet words a coach's month.
      description: `${invoice.instructor.danceStyle} Instructor Fee ${MONTH_NAMES[invoice.periodMonth - 1]}`,
      payeeName: invoice.instructor.fullName,
      documentDate: invoice.invoiceDate,
      amountCents: -invoice.totalCents,
      submittedToOslAt: invoice.submittedToOslAt,
      bankedInAt: null,
      fromPortal: true,
      sheetRowNumber: null,
    })
  }

  for (const deposit of deposits) {
    const reference = deposit.referenceNumber?.formatted
    if (!reference || onSheet(reference)) continue
    rows.push({
      id: `deposit-${deposit.id}`,
      section: 'INCOME',
      financialYear: deposit.referenceNumber!.financialYear,
      reference,
      description: deposit.eventName,
      payeeName: null,
      documentDate: deposit.finalCollectionAt,
      // Net of GST: the register's income column is kept without it.
      amountCents: deposit.netCents,
      submittedToOslAt: null,
      bankedInAt: deposit.finalCollectionAt,
      fromPortal: true,
      sheetRowNumber: null,
    })
  }

  // Newest first; undated rows after dated ones, in the sheet's own order.
  rows.sort((a, b) => {
    if (a.documentDate && b.documentDate) return b.documentDate.getTime() - a.documentDate.getTime()
    if (a.documentDate) return -1
    if (b.documentDate) return 1
    return b.financialYear - a.financialYear || (b.sheetRowNumber ?? 0) - (a.sheetRowNumber ?? 0)
  })
  return rows.map(({ sheetRowNumber: _sheetRowNumber, ...entry }) => entry)
}

export async function listLedger(
  userId: string,
  orgId: string,
  options: { section?: RegisterSection; financialYear?: number; take?: number } = {}
): Promise<LedgerEntry[]> {
  const rows = await ledgerRows(userId, orgId, options)
  return options.take ? rows.slice(0, options.take) : rows
}

export async function countLedger(userId: string, orgId: string): Promise<number> {
  return (await ledgerRows(userId, orgId, {})).length
}

export async function ledgerYears(userId: string, orgId: string): Promise<number[]> {
  const rows = await ledgerRows(userId, orgId, {})
  return [...new Set(rows.map((row) => row.financialYear))].sort((a, b) => b - a)
}

export interface LedgerTotals {
  section: RegisterSection
  inCents: number
  outCents: number
  rows: number
}

/** Return totals for every section, including empty ones. */
export async function ledgerTotals(
  userId: string,
  orgId: string,
  options: { financialYear?: number } = {}
): Promise<LedgerTotals[]> {
  const rows = await ledgerRows(userId, orgId, options)

  const bySection = new Map<RegisterSection, LedgerTotals>(
    SECTION_ORDER.map((section) => [section, { section, inCents: 0, outCents: 0, rows: 0 }])
  )
  for (const row of rows) {
    const totals = bySection.get(row.section)!
    if (row.amountCents >= 0) totals.inCents += row.amountCents
    else totals.outCents += -row.amountCents
    totals.rows++
  }

  return SECTION_ORDER.map((section) => bySection.get(section)!)
}
