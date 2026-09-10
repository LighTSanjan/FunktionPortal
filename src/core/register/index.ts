import 'server-only'

import type { RegisterSection } from '@prisma/client'
import { dbAs } from '@/core/db'

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
}

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

export async function listLedger(
  userId: string,
  orgId: string,
  options: { section?: RegisterSection; financialYear?: number; take?: number } = {}
): Promise<LedgerEntry[]> {
  const rows = await dbAs(userId, (tx) =>
    tx.registerEntry.findMany({
      where: {
        orgId,
        ...(options.section ? { section: options.section } : {}),
        ...(options.financialYear ? { financialYear: options.financialYear } : {}),
      },
      // Preserve sheet order for undated rows after dated entries.
      orderBy: [
        { documentDate: { sort: 'desc', nulls: 'last' } },
        { financialYear: 'desc' },
        { sheetRowNumber: 'desc' },
      ],
      ...(options.take ? { take: options.take } : {}),
    })
  )

  return rows.map((row) => ({
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
  }))
}

export async function countLedger(userId: string, orgId: string): Promise<number> {
  return dbAs(userId, (tx) => tx.registerEntry.count({ where: { orgId } }))
}

export async function ledgerYears(userId: string, orgId: string): Promise<number[]> {
  const rows = await dbAs(userId, (tx) =>
    tx.registerEntry.findMany({
      where: { orgId },
      distinct: ['financialYear'],
      select: { financialYear: true },
      orderBy: { financialYear: 'desc' },
    })
  )
  return rows.map((row) => row.financialYear)
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
  const rows = await dbAs(userId, (tx) =>
    tx.registerEntry.findMany({
      where: { orgId, ...(options.financialYear ? { financialYear: options.financialYear } : {}) },
      select: {
        section: true,
        incomeCents: true,
        expenseWithGstCents: true,
        expenseWithoutGstCents: true,
      },
    })
  )

  const bySection = new Map<RegisterSection, LedgerTotals>(
    SECTION_ORDER.map((section) => [section, { section, inCents: 0, outCents: 0, rows: 0 }])
  )
  for (const row of rows) {
    const totals = bySection.get(row.section)!
    const amount = toAmount(row)
    if (amount >= 0) totals.inCents += amount
    else totals.outCents += -amount
    totals.rows++
  }

  return SECTION_ORDER.map((section) => bySection.get(section)!)
}
