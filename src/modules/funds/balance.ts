/** Fund balance = opening + income − prior spend − portal commitments. */
import 'server-only'
import type { FundSource, Prisma } from '@prisma/client'
import { financialYearOf } from '@/modules/references/format'
import { onSheet, type LedgerDocument } from '@/lib/reference-match'

export interface FundBalance {
  source: FundSource
  financialYear: number
  wbsElement: string
  rollsOver: boolean
  submissionDeadline: Date | null
  /** The opening balance and what the imported register received since. */
  openingCents: number
  priorIncomeCents: number
  /** Membership collections banked in through the portal this year, net. */
  bankedCents: number
  /** What the imported register had already spent. */
  priorSpendCents: number
  /** Invoices and approved purchases raised in the portal this year. */
  committedCents: number
  /** Everything the club could draw on this year. */
  availableCents: number
  spentCents: number
  remainingCents: number
}

export async function fundBalances(
  tx: Prisma.TransactionClient,
  orgId: string,
  financialYear: number,
  options: { excludeInvoiceId?: string } = {}
): Promise<FundBalance[]> {
  const accounts = await tx.fundAccount.findMany({ where: { orgId, financialYear }, orderBy: { source: 'asc' } })
  const invoices = await tx.invoice.findMany({
    where: {
      orgId,
      status: { not: 'VOID' },
      referenceNumber: { financialYear },
      ...(options.excludeInvoiceId ? { NOT: { id: options.excludeInvoiceId } } : {}),
    },
    select: { fundSource: true, totalCents: true, invoiceDate: true, referenceNumber: { select: { formatted: true } } },
  })
  const deposits = await tx.incomeDeposit.findMany({
    where: { orgId, referenceNumber: { financialYear } },
    select: { netCents: true, finalCollectionAt: true, referenceNumber: { select: { formatted: true } } },
  })
  const purchases = await tx.purchaseRequest.findMany({
    where: { orgId, status: { in: ['APPROVED', 'PURCHASED', 'CLOSED'] } },
    select: {
      fundSource: true,
      amountCents: true,
      presidentApprovedAt: true,
      treasurerApprovedAt: true,
      createdAt: true,
    },
  })
  const imported = await tx.registerEntry.findMany({
    where: { orgId, financialYear, sourceType: 'RegisterImport', referenceNumber: { not: null } },
    select: {
      section: true,
      referenceNumber: true,
      documentDate: true,
      bankedInAt: true,
      incomeCents: true,
      expenseWithGstCents: true,
      expenseWithoutGstCents: true,
    },
  })
  const adjustments = await tx.registerEntry.findMany({
    where: { orgId, financialYear, sourceType: { not: 'RegisterImport' } },
    select: {
      section: true,
      incomeCents: true,
      expenseWithGstCents: true,
      expenseWithoutGstCents: true,
    },
  })

  const sheet = (section: 'SEED_FUND' | 'INCOME', income: boolean): LedgerDocument[] =>
    imported
      .filter((row) => row.section === section && (income ? (row.incomeCents ?? 0) > 0 : (row.incomeCents ?? 0) === 0))
      .map((row) => ({
        reference: row.referenceNumber,
        amountCents: income ? (row.incomeCents ?? 0) : (row.expenseWithGstCents ?? row.expenseWithoutGstCents ?? 0),
        date: row.documentDate ?? row.bankedInAt,
      }))

  const committed = new Map<FundSource, number>()
  const manualIncome = new Map<FundSource, number>()
  const add = (source: FundSource, cents: number) => committed.set(source, (committed.get(source) ?? 0) + cents)
  const addIncome = (source: FundSource, cents: number) => manualIncome.set(source, (manualIncome.get(source) ?? 0) + cents)

  const sourceForSection: Record<string, FundSource> = {
    SEED_FUND: 'SEED',
    INCOME: 'INCOME',
    DONATION: 'DONATION',
    UNOFFICIAL: 'UNOFFICIAL',
  }
  for (const row of adjustments) {
    const source = sourceForSection[row.section]
    const income = row.incomeCents ?? 0
    const expense = row.expenseWithGstCents ?? row.expenseWithoutGstCents ?? 0
    if (income > 0) addIncome(source, income)
    if (expense > 0) add(source, expense)
  }

  for (const source of ['SEED', 'INCOME'] as const) {
    const mine = invoices.filter((invoice) => invoice.fundSource === source)
    const known = onSheet(
      sheet(source === 'SEED' ? 'SEED_FUND' : 'INCOME', false),
      mine.map((invoice) => ({
        reference: invoice.referenceNumber?.formatted ?? null,
        amountCents: invoice.totalCents,
        date: invoice.invoiceDate,
      }))
    )
    mine.forEach((invoice, i) => {
      if (!known.has(i)) add(source, invoice.totalCents)
    })
  }
  for (const purchase of purchases) {
    const approvedOn = purchase.presidentApprovedAt ?? purchase.treasurerApprovedAt ?? purchase.createdAt
    if (financialYearOf(approvedOn) !== financialYear) continue
    add(purchase.fundSource, purchase.amountCents)
  }
  const bankedOnSheet = onSheet(
    sheet('INCOME', true),
    deposits.map((deposit) => ({
      reference: deposit.referenceNumber?.formatted ?? null,
      amountCents: deposit.netCents,
      date: deposit.finalCollectionAt,
    }))
  )
  const bankedCents = deposits
    .filter((_, i) => !bankedOnSheet.has(i))
    .reduce((sum, deposit) => sum + deposit.netCents, 0)

  return accounts.map((account) => {
    const banked = account.source === 'INCOME' ? bankedCents : 0
    const committedCents = committed.get(account.source) ?? 0
    const availableCents = account.openingBalanceCents + account.priorIncomeCents + banked + (manualIncome.get(account.source) ?? 0)
    const spentCents = account.priorSpendCents + committedCents
    return {
      source: account.source,
      financialYear,
      wbsElement: account.wbsElement,
      rollsOver: account.rollsOver,
      submissionDeadline: account.submissionDeadline,
      openingCents: account.openingBalanceCents,
      priorIncomeCents: account.priorIncomeCents,
      bankedCents: banked,
      priorSpendCents: account.priorSpendCents,
      committedCents,
      availableCents,
      spentCents,
      remainingCents: availableCents - spentCents,
    }
  })
}

/** One fund's balance, or null when the year has no account for it. */
export async function fundBalance(
  tx: Prisma.TransactionClient,
  orgId: string,
  financialYear: number,
  source: FundSource,
  options: { excludeInvoiceId?: string } = {}
): Promise<FundBalance | null> {
  const all = await fundBalances(tx, orgId, financialYear, options)
  return all.find((fund) => fund.source === source) ?? null
}
