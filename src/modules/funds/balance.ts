/**
 * What is left in each of the club's funds for one financial year.
 *
 * One calculation, read by the dashboard, the fund picker on Coach payments,
 * the attendance sheet's "Balance of Club Fund", and the register. They used
 * to disagree: the dashboard subtracted every year's invoices from this
 * year's grant, never added what membership fees had banked, and the
 * attendance sheet printed the opening balance as though nothing had been
 * spent since April.
 *
 * A fund's year is the register's year:
 *
 *   opening balance + income the register recorded
 *   + membership collections banked in through the portal (net of GST, the
 *     way the register's income column is kept)
 *   − spending the register recorded
 *   − invoices and approved purchases raised in the portal
 *
 * The register is the club's own record from before the portal and is
 * imported into `fund_accounts` as the prior columns. A portal document that
 * is also already on the imported register — matched on its reference number
 * — is counted once, from the register.
 */
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
  // One after another: these share the caller's transaction, and a
  // transaction is one connection.
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

  // What the sheet already has, per section, in the shape the matcher reads.
  const sheet = (section: 'SEED_FUND' | 'INCOME', income: boolean): LedgerDocument[] =>
    imported
      .filter((row) => row.section === section && (income ? (row.incomeCents ?? 0) > 0 : (row.incomeCents ?? 0) === 0))
      .map((row) => ({
        reference: row.referenceNumber,
        amountCents: income ? (row.incomeCents ?? 0) : (row.expenseWithGstCents ?? row.expenseWithoutGstCents ?? 0),
        date: row.documentDate ?? row.bankedInAt,
      }))

  const committed = new Map<FundSource, number>()
  const add = (source: FundSource, cents: number) => committed.set(source, (committed.get(source) ?? 0) + cents)

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
  // Every collection is income: the deposit form banks into the income fund.
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
    const availableCents = account.openingBalanceCents + account.priorIncomeCents + banked
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
