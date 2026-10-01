import 'server-only'

import type { RegisterSection } from '@prisma/client'
import { dbAs } from '@/core/db'
import { onSheet, type LedgerDocument } from '@/lib/reference-match'

export const SECTION_FUND: Record<RegisterSection, 'SEED' | 'INCOME' | 'DONATION' | 'UNOFFICIAL'> = {
  SEED_FUND: 'SEED',
  INCOME: 'INCOME',
  DONATION: 'DONATION',
  UNOFFICIAL: 'UNOFFICIAL',
}

const SECTION_ORDER: RegisterSection[] = ['SEED_FUND', 'INCOME', 'DONATION', 'UNOFFICIAL']

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
  /** Only exceptional rows entered by hand can be reversed from this screen. */
  reversible: boolean
  voidedAt: Date | null
  voidedByName: string | null
  voidReason: string | null
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

/** Imported register rows plus unmatched portal documents, loaded once per request. */
export async function loadLedger(userId: string, orgId: string): Promise<LedgerEntry[]> {
  const { imported, invoices, deposits } = await dbAs(userId, async (tx) => ({
    imported: await tx.registerEntry.findMany({
      where: { orgId },
      include: { voidedBy: { select: { name: true } } },
    }),
    invoices: await tx.invoice.findMany({
      where: { orgId, status: { not: 'VOID' }, referenceNumber: { isNot: null } },
      select: {
        id: true,
        fundSource: true,
        totalCents: true,
        periodMonth: true,
        invoiceDate: true,
        submittedToOslAt: true,
        referenceNumber: { select: { formatted: true, financialYear: true } },
        instructor: { select: { fullName: true, danceStyle: true } },
      },
    }),
    deposits: await tx.incomeDeposit.findMany({
      where: { orgId, referenceNumber: { isNot: null } },
      select: {
        id: true,
        eventName: true,
        netCents: true,
        finalCollectionAt: true,
        referenceNumber: { select: { formatted: true, financialYear: true } },
      },
    }),
  }))

  const rows: (LedgerEntry & { sheetRowNumber: number | null; sourceId: string })[] = imported.map((row) => ({
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
    fromPortal: row.sourceType !== 'RegisterImport',
    reversible: row.sourceType === 'Manual',
    voidedAt: row.voidedAt,
    voidedByName: row.voidedBy?.name ?? null,
    voidReason: row.voidReason,
    sheetRowNumber: row.sheetRowNumber,
    sourceId: row.sourceId,
  }))

  /** The sheet's rows for one section and year, in the matcher's shape. */
  const sheetFor = (section: RegisterSection, financialYear: number, income: boolean): LedgerDocument[] =>
    rows
      .filter((row) => !row.fromPortal && row.section === section && row.financialYear === financialYear && (row.amountCents > 0) === income)
      .map((row) => ({ reference: row.reference, amountCents: Math.abs(row.amountCents), date: row.documentDate ?? row.bankedInAt }))

  const groups = new Map<string, typeof invoices>()
  for (const invoice of invoices) {
    const key = `${invoice.fundSource}:${invoice.referenceNumber!.financialYear}`
    groups.set(key, [...(groups.get(key) ?? []), invoice])
  }
  for (const [key, group] of groups) {
    const [source, year] = key.split(':')
    const section: RegisterSection = source === 'SEED' ? 'SEED_FUND' : 'INCOME'
    const known = onSheet(
      sheetFor(section, Number(year), false),
      group.map((invoice) => ({ reference: invoice.referenceNumber!.formatted, amountCents: invoice.totalCents, date: invoice.invoiceDate }))
    )
    group.forEach((invoice, i) => {
      if (known.has(i)) return
      rows.push({
        id: `invoice-${invoice.id}`,
        section,
        financialYear: Number(year),
        reference: invoice.referenceNumber!.formatted,
        // The way the sheet words a coach's month.
        description: `${invoice.instructor.danceStyle} Instructor Fee ${MONTH_NAMES[invoice.periodMonth - 1]}`,
        payeeName: invoice.instructor.fullName,
        documentDate: invoice.invoiceDate,
        amountCents: -invoice.totalCents,
        submittedToOslAt: invoice.submittedToOslAt,
        bankedInAt: null,
        fromPortal: true,
        reversible: false,
        voidedAt: null,
        voidedByName: null,
        voidReason: null,
        sheetRowNumber: null,
        sourceId: invoice.id,
      })
    })
  }

  const years = [...new Set(deposits.map((deposit) => deposit.referenceNumber!.financialYear))]
  for (const year of years) {
    const group = deposits.filter((deposit) => deposit.referenceNumber!.financialYear === year)
    const known = onSheet(
      sheetFor('INCOME', year, true),
      group.map((deposit) => ({ reference: deposit.referenceNumber!.formatted, amountCents: deposit.netCents, date: deposit.finalCollectionAt }))
    )
    group.forEach((deposit, i) => {
      if (known.has(i)) return
      rows.push({
        id: `deposit-${deposit.id}`,
        section: 'INCOME',
        financialYear: year,
        reference: deposit.referenceNumber!.formatted,
        description: deposit.eventName,
        payeeName: null,
        documentDate: deposit.finalCollectionAt,
        // Net of GST: the register's income column is kept without it.
        amountCents: deposit.netCents,
        submittedToOslAt: null,
        bankedInAt: deposit.finalCollectionAt,
        fromPortal: true,
        reversible: false,
        voidedAt: null,
        voidedByName: null,
        voidReason: null,
        sheetRowNumber: null,
        sourceId: deposit.id,
      })
    })
  }

  // Newest first; undated rows after dated ones. Ties fall back to the year,
  // the sheet's own order and the row's identity, so the same register reads
  // in the same order on every visit.
  rows.sort(
    (a, b) =>
      (b.documentDate?.getTime() ?? -Infinity) - (a.documentDate?.getTime() ?? -Infinity) ||
      b.financialYear - a.financialYear ||
      (b.sheetRowNumber ?? Number.MAX_SAFE_INTEGER) - (a.sheetRowNumber ?? Number.MAX_SAFE_INTEGER) ||
      a.sourceId.localeCompare(b.sourceId)
  )
  return rows.map((row) => ({
    id: row.id,
    section: row.section,
    financialYear: row.financialYear,
    reference: row.reference,
    description: row.description,
    payeeName: row.payeeName,
    documentDate: row.documentDate,
    amountCents: row.amountCents,
    submittedToOslAt: row.submittedToOslAt,
    bankedInAt: row.bankedInAt,
    fromPortal: row.fromPortal,
    reversible: row.reversible,
    voidedAt: row.voidedAt,
    voidedByName: row.voidedByName,
    voidReason: row.voidReason,
  }))
}

export function filterLedger(
  rows: LedgerEntry[],
  options: { section?: RegisterSection; financialYear?: number; take?: number } = {}
): LedgerEntry[] {
  const filtered = rows.filter(
    (row) =>
      (!options.section || row.section === options.section) &&
      (!options.financialYear || row.financialYear === options.financialYear)
  )
  return options.take ? filtered.slice(0, options.take) : filtered
}

export async function listLedger(
  userId: string,
  orgId: string,
  options: { section?: RegisterSection; financialYear?: number; take?: number } = {}
): Promise<LedgerEntry[]> {
  return filterLedger(await loadLedger(userId, orgId), options)
}

export function ledgerYears(rows: LedgerEntry[]): number[] {
  return [...new Set(rows.map((row) => row.financialYear))].sort((a, b) => b - a)
}

export interface LedgerTotals {
  section: RegisterSection
  inCents: number
  outCents: number
  rows: number
}

/** Totals for every section, including empty ones. */
export function ledgerTotals(rows: LedgerEntry[], options: { financialYear?: number } = {}): LedgerTotals[] {
  const bySection = new Map<RegisterSection, LedgerTotals>(
    SECTION_ORDER.map((section) => [section, { section, inCents: 0, outCents: 0, rows: 0 }])
  )
  for (const row of filterLedger(rows, options)) {
    if (row.voidedAt) continue
    const totals = bySection.get(row.section)!
    if (row.amountCents >= 0) totals.inCents += row.amountCents
    else totals.outCents += -row.amountCents
    totals.rows++
  }

  return SECTION_ORDER.map((section) => bySection.get(section)!)
}
