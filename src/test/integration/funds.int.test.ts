/**
 * What is left in the club's funds, worked out once and read everywhere.
 *
 * The dashboard, the fund picker, the attendance sheet and the register all
 * read the same balance: this financial year's register, plus membership
 * money banked through the portal, less invoices raised in the portal this
 * year — and a document typed into the spreadsheet as well as raised here is
 * counted once.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { addInstructorRate, saveInstructor, saveSession, setAttendance } from '@/modules/coach-claim/actions'
import { generateMonthlyDocuments, signMonth, voidMonth } from '@/modules/coach-claim/run-actions'
import { invoiceDateFor } from '@/modules/coach-claim/claim'
import { loadMonthDocuments } from '@/modules/coach-claim/documents'
import { closeCollection, createTerm, updateTerm, uploadPaynowQr } from '@/modules/fees/collection-actions'
import { confirmPayment, declarePayment } from '@/modules/fees/payment-actions'
import { fundBalances } from '@/modules/funds/balance'
import { financialYearOf } from '@/modules/references/format'
import { listLedger, ledgerTotals, loadLedger } from '@/core/register'
import { dbAs } from '@/core/db'
import { isoDate } from '@/modules/coach-claim/theme'
import {
  addRosterMember,
  as,
  createOrganisation,
  createUser,
  dbAdmin,
  ensureBucket,
  form,
  join,
  ok,
  pngFile,
  resetDatabase,
  type TestOrg,
  type TestUser,
} from './harness'

const now = new Date()
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const period = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`
const fy = financialYearOf(invoiceDateFor(lastMonth.getFullYear(), lastMonth.getMonth() + 1))
const yy = String(fy % 100).padStart(2, '0')

let org: TestOrg
let treasurer: TestUser
let president: TestUser
let ada: TestUser
const coach: Record<string, string> = {}

async function income() {
  const funds = await dbAs(treasurer.id, (tx) => fundBalances(tx, org.id, fy))
  return funds.find((fund) => fund.source === 'INCOME')!
}

describe('the club’s funds', () => {
  beforeAll(async () => {
    await resetDatabase()
    await ensureBucket()
    org = await createOrganisation()
    treasurer = await createUser('Tess Treasurer')
    president = await createUser('Pat President')
    ada = await createUser('Ada Lee')
    await join(treasurer, org, 'EXCO', 'TREASURER')
    await join(president, org, 'EXCO', 'PRESIDENT')
    await join(ada, org, 'MEMBER')
    const adaRow = await addRosterMember(org, { fullName: 'Ada Lee', studentId: '1000001', userId: ada.id, rosterLabel: 'Confirmed' })

    // The spreadsheet's year so far: $200 of prior income, $90 spent under a
    // number the portal will also raise later (typed with a digit too many).
    await dbAdmin.fundAccount.update({
      where: { orgId_financialYear_source: { orgId: org.id, financialYear: fy, source: 'INCOME' } },
      data: { priorIncomeCents: 20_000, priorSpendCents: 9_000 },
    })
    await dbAdmin.registerEntry.create({
      data: {
        orgId: org.id,
        financialYear: fy,
        section: 'INCOME',
        sourceType: 'RegisterImport',
        sourceId: 'row-1',
        referenceNumber: `IV${yy}-097-00002`,
        description: 'Locking Instructor Fee (typed into the sheet)',
        // Mistyped, so it is matched on the money and the day instead.
        documentDate: new Date(Date.UTC(now.getFullYear(), now.getMonth(), 15)),
        expenseWithoutGstCents: 9_000,
        expenseWithGstCents: 9_000,
        sheetRowNumber: 1,
      },
    })

    as(treasurer)
    for (const [name, style, account] of [
      ['Kai Smith', 'Popping', '000-00000-1'],
      ['Jin Neo', 'Locking', '000-00000-2'],
    ] as const) {
      await ok(() =>
        saveInstructor(org.slug, null, { error: null }, form({
          fullName: name,
          danceStyle: style,
          email: `${name.split(' ')[0].toLowerCase()}@coach.test`,
          addressLine1: '1 Dance Street',
          postalCode: '000002',
          bankName: 'DBS',
          bankAccountNo: account,
          engagement: 'CONTRACTED',
        }))
      )
      coach[name] = (await dbAdmin.instructor.findFirstOrThrow({ where: { orgId: org.id, fullName: name } })).id
      await ok(() => addInstructorRate(org.slug, coach[name], { error: null }, form({ hourlyRate: '60', effectiveFrom: `${now.getFullYear() - 2}-01-01` })))
      await ok(() => saveSession(org.slug, null, { error: null }, form({ instructorId: coach[name], heldOn: `${period}-0${name === 'Kai Smith' ? 3 : 4}`, durationMinutes: name === 'Kai Smith' ? '60' : '90' })))
      const session = await dbAdmin.classSession.findFirstOrThrow({ where: { orgId: org.id, instructorId: coach[name] } })
      await ok(() => setAttendance(org.slug, session.id, { error: null }, form({ present: [adaRow.id] })))
    }

    // An invoice from the year before, which must not come off this year.
    const lastYear = await dbAdmin.referenceNumber.create({
      data: { orgId: org.id, series: 'IV', financialYear: fy - 1, sequence: 99, formatted: `IV${String((fy - 1) % 100).padStart(2, '0')}-097-0099` },
    })
    await dbAdmin.invoice.create({
      data: {
        orgId: org.id,
        instructorId: coach['Kai Smith'],
        referenceNumberId: lastYear.id,
        documentNo: 'OLD',
        periodYear: lastMonth.getFullYear() - 1,
        periodMonth: 1,
        invoiceDate: new Date(Date.UTC(lastMonth.getFullYear() - 1, 1, 15)),
        fundSource: 'INCOME',
        subtotalCents: 70_000,
        totalCents: 70_000,
        status: 'SUBMITTED',
      },
    })
  })

  it('starts from the register: opening, plus prior income, less prior spend', async () => {
    as(treasurer)
    const fund = await income()
    // Harness opening $1,000 + $200 − $90. Last year's $700 invoice is not here.
    expect(fund.remainingCents).toBe(111_000)
    expect(fund.committedCents).toBe(0)
  })

  it('prints what is left after the claim on the attendance sheet it raises', async () => {
    as(treasurer)
    await ok(() => generateMonthlyDocuments(org.slug, { error: null }, form({ instructorId: coach['Kai Smith'], period, fundSource: 'INCOME' })))
    const kai = await dbAdmin.invoice.findFirstOrThrow({ where: { orgId: org.id, instructorId: coach['Kai Smith'], periodYear: lastMonth.getFullYear() }, include: { attendanceSheet: true, referenceNumber: true } })
    expect(kai.totalCents).toBe(6_000)
    expect(kai.attendanceSheet?.clubFundBalanceCents).toBe(111_000 - 6_000)
    expect((await income()).remainingCents).toBe(105_000)
  })

  it('counts a document typed into the spreadsheet as well as raised here once', async () => {
    as(treasurer)
    // Jin's month takes the number the sheet already has as IVyy-097-00002.
    await ok(() => generateMonthlyDocuments(org.slug, { error: null }, form({ instructorId: coach['Jin Neo'], period, fundSource: 'INCOME' })))
    const jin = await dbAdmin.invoice.findFirstOrThrow({ where: { orgId: org.id, instructorId: coach['Jin Neo'] }, include: { referenceNumber: true } })
    expect(jin.referenceNumber?.formatted).toBe(`IV${yy}-097-0002`)
    expect((await income()).remainingCents).toBe(105_000)

    const ledger = await listLedger(treasurer.id, org.id, { financialYear: fy, section: 'INCOME' })
    expect(ledger.filter((row) => /0002$/.test(row.reference ?? ''))).toHaveLength(1)
    const kaiRow = ledger.find((row) => row.fromPortal)
    expect(kaiRow?.payeeName).toBe('Kai Smith')
    expect(kaiRow?.description).toMatch(/Popping Instructor Fee/)
    expect(kaiRow?.amountCents).toBe(-6_000)
  })

  it('shows the live balance on an unsigned sheet, and fixes it when signed', async () => {
    as(treasurer)
    const kai = await dbAdmin.invoice.findFirstOrThrow({ where: { orgId: org.id, instructorId: coach['Kai Smith'], periodYear: lastMonth.getFullYear() } })
    // Money moves between raising and signing: a collection is banked in.
    as(treasurer)
    await ok(() => createTerm(org.slug, { error: null }, form({ name: 'Term', startDate: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), endDate: isoDate(new Date(now.getFullYear(), now.getMonth() + 2, 1)), fullFee: '109', halfFee: '50' })))
    const termId = (await dbAdmin.term.findFirstOrThrow({ where: { orgId: org.id } })).id
    await ok(() => updateTerm(org.slug, { error: null }, form({ termId, fullFee: '109', halfFee: '50', exchangeFee: '', collectionOpensAt: isoDate(lastMonth), finalCollectionAt: isoDate(now) })))
    await ok(() => uploadPaynowQr(org.slug, { error: null }, form({ termId, qr: pngFile(400, 400) })))
    as(ada)
    await ok(() => declarePayment(org.slug, { error: null }, form({ termId, reference: 'PN-ADA', proof: pngFile(300, 600) })))
    as(president)
    const payment = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId } })
    await ok(() => confirmPayment(org.slug, { error: null }, form({ paymentId: payment.id })))
    as(treasurer)
    await ok(() => closeCollection(org.slug, termId))

    const deposit = await dbAdmin.incomeDeposit.findFirstOrThrow({ where: { termId } })
    const fund = await income()
    expect(fund.bankedCents).toBe(deposit.netCents)
    expect(fund.remainingCents).toBe(105_000 + deposit.netCents)

    const unsigned = await dbAs(treasurer.id, (tx) => loadMonthDocuments(tx, { orgId: org.id, invoiceId: kai.id }))
    expect(unsigned?.sheet.clubFundBalanceCents).toBe(fund.remainingCents)

    await ok(() => signMonth(org.slug, kai.id))
    const signed = await dbAdmin.attendanceSheet.findFirstOrThrow({ where: { invoice: { id: kai.id } } })
    expect(signed.clubFundBalanceCents).toBe(fund.remainingCents)
  })

  it('puts the collection on the register, net of GST', async () => {
    as(treasurer)
    const deposit = await dbAdmin.incomeDeposit.findFirstOrThrow({ where: { orgId: org.id }, include: { referenceNumber: true } })
    const ledger = await listLedger(treasurer.id, org.id, { financialYear: fy, section: 'INCOME' })
    expect(ledger.find((row) => row.reference === deposit.referenceNumber?.formatted)?.amountCents).toBe(deposit.netCents)

    // The sheet's row for Jin ($90), Kai raised here ($60), the collection.
    const [totals] = ledgerTotals(await loadLedger(treasurer.id, org.id), { financialYear: fy }).filter((t) => t.section === 'INCOME')
    expect(totals.inCents - totals.outCents).toBe(deposit.netCents - 15_000)
  })

  it('keeps the balance an unsigned sheet last showed when it is voided', async () => {
    as(treasurer)
    const jin = await dbAdmin.invoice.findFirstOrThrow({ where: { orgId: org.id, instructorId: coach['Jin Neo'] } })
    const fundBefore = await income()
    const showing = await dbAs(treasurer.id, (tx) => loadMonthDocuments(tx, { orgId: org.id, invoiceId: jin.id }))
    await ok(() => voidMonth(org.slug, jin.id, { error: null }, form({ reason: 'Raised on the wrong fund' })))
    const sheet = await dbAdmin.attendanceSheet.findFirstOrThrow({ where: { invoice: { id: jin.id } } })
    expect(sheet.clubFundBalanceCents).toBe(showing?.sheet.clubFundBalanceCents)
    // Jin's claim is the sheet's row, already in prior spend: it is taken off
    // once, not again on top.
    expect(showing?.sheet.clubFundBalanceCents).toBe(fundBefore.remainingCents)
  })
})
