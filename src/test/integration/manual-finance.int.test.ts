import { beforeAll, describe, expect, it } from 'vitest'
import { addInstructorRate, saveInstructor, saveSession } from '@/modules/coach-claim/actions'
import { markMonthPaidOutside } from '@/modules/coach-claim/run-actions'
import { createTerm, updateTerm } from '@/modules/fees/collection-actions'
import { fundBalances } from '@/modules/funds/balance'
import {
  createManualRegisterEntry,
  restoreManualRegisterEntry,
  voidManualRegisterEntry,
} from '@/modules/register/actions'
import { financialYearOf } from '@/modules/references/format'
import { dbAs } from '@/core/db'
import { listLedger } from '@/core/register'
import { isoDate } from '@/modules/coach-claim/theme'
import {
  as,
  createOrganisation,
  createUser,
  dbAdmin,
  form,
  join,
  ok,
  resetDatabase,
  type TestOrg,
  type TestUser,
} from './harness'

const today = new Date()
const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
const period = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`
const paidOn = isoDate(today)
const fy = financialYearOf(today)

let org: TestOrg
let treasurer: TestUser
let coachId: string
let refreshmentsEntryId: string

async function balance(source: 'SEED' | 'INCOME') {
  const rows = await dbAs(treasurer.id, (tx) => fundBalances(tx, org.id, fy))
  return rows.find((row) => row.source === source)!
}

describe('manually recorded finance movements', () => {
  beforeAll(async () => {
    await resetDatabase()
    org = await createOrganisation()
    treasurer = await createUser('Tess Treasurer')
    await join(treasurer, org, 'EXCO', 'TREASURER')
    as(treasurer)

    await ok(() =>
      saveInstructor(org.slug, null, { error: null }, form({
        fullName: 'Kai Smith',
        danceStyle: 'Popping',
        email: 'kai@coach.test',
        addressLine1: '1 Dance Street',
        postalCode: '000002',
        bankName: 'DBS',
        bankAccountNo: '000-00000-1',
        engagement: 'CONTRACTED',
      }))
    )
    coachId = (await dbAdmin.instructor.findFirstOrThrow({ where: { orgId: org.id } })).id
    await ok(() => addInstructorRate(org.slug, coachId, { error: null }, form({ hourlyRate: '90', effectiveFrom: `${today.getFullYear() - 2}-01-01` })))
    await ok(() => saveSession(org.slug, null, { error: null }, form({ instructorId: coachId, heldOn: `${period}-03`, durationMinutes: '60' })))
  })

  it('adds manual money in and out to both the register and the live balance', async () => {
    const before = (await balance('INCOME')).remainingCents
    await ok(() => createManualRegisterEntry(org.slug, { error: null }, form({
      kind: 'INCOME', section: 'INCOME', documentDate: paidOn, description: 'Workshop ticket sales',
      counterparty: 'Members', reference: 'BANK-001', amount: '500', submittedToOslAt: '', bankedInAt: paidOn,
    })))
    await ok(() => createManualRegisterEntry(org.slug, { error: null }, form({
      kind: 'EXPENSE', section: 'INCOME', documentDate: paidOn, description: 'Workshop refreshments',
      counterparty: 'Cafe', reference: 'CARD-002', amount: '125.25', submittedToOslAt: '', bankedInAt: '',
    })))

    expect((await balance('INCOME')).remainingCents).toBe(before + 50_000 - 12_525)
    const ledger = await listLedger(treasurer.id, org.id, { section: 'INCOME', financialYear: fy })
    expect(ledger.filter((row) => row.description.startsWith('Workshop')).map((row) => row.amountCents).sort((a, b) => a - b)).toEqual([-12_525, 50_000])
    expect(ledger.filter((row) => row.description.startsWith('Workshop')).every((row) => row.fromPortal)).toBe(true)
    refreshmentsEntryId = (await dbAdmin.registerEntry.findFirstOrThrow({
      where: { orgId: org.id, description: 'Workshop refreshments' },
      select: { id: true },
    })).id
  })

  it('voids and restores a manual row without deleting the financial evidence', async () => {
    const beforeVoid = (await balance('INCOME')).remainingCents
    await ok(() => voidManualRegisterEntry(
      org.slug,
      refreshmentsEntryId,
      { error: null },
      form({ reason: 'Duplicate card statement entry' })
    ))

    const voided = await dbAdmin.registerEntry.findUniqueOrThrow({ where: { id: refreshmentsEntryId } })
    expect(voided).toMatchObject({
      voidedById: treasurer.id,
      voidReason: 'Duplicate card statement entry',
    })
    expect(voided.voidedAt).toBeInstanceOf(Date)
    expect((await balance('INCOME')).remainingCents).toBe(beforeVoid + 12_525)
    expect(await dbAdmin.auditLog.findFirst({
      where: { targetId: refreshmentsEntryId, action: 'register.manual_void' },
    })).not.toBeNull()

    await expect(dbAs(treasurer.id, (tx) => tx.registerEntry.delete({ where: { id: refreshmentsEntryId } }))).rejects.toThrow()

    await ok(() => restoreManualRegisterEntry(
      org.slug,
      refreshmentsEntryId,
      { error: null },
      form({ reason: 'Checked the bank statement; the purchase is genuine' })
    ))
    expect(await dbAdmin.registerEntry.findUniqueOrThrow({ where: { id: refreshmentsEntryId } })).toMatchObject({
      voidedAt: null,
      voidedById: null,
      voidReason: null,
    })
    expect((await balance('INCOME')).remainingCents).toBe(beforeVoid)
    expect(await dbAdmin.auditLog.findFirst({
      where: { targetId: refreshmentsEntryId, action: 'register.manual_restore' },
    })).not.toBeNull()
  })

  it('records each outside coach payment against its fund and reverses it with the month marker', async () => {
    const before = (await balance('SEED')).remainingCents
    await ok(() => markMonthPaidOutside(org.slug, period, true, form({
      paidOn,
      reference: 'LEGACY-COACH-1',
      [`amount_${coachId}`]: '123.45',
      [`fund_${coachId}`]: 'SEED',
    })))

    const recorded = await dbAdmin.registerEntry.findFirstOrThrow({
      where: { orgId: org.id, sourceType: 'CoachPaymentOutside', sourceId: `${period}:${coachId}` },
    })
    expect(recorded).toMatchObject({ section: 'SEED_FUND', expenseWithGstCents: 12_345, payeeName: 'Kai Smith' })
    expect((await balance('SEED')).remainingCents).toBe(before - 12_345)

    await ok(() => markMonthPaidOutside(org.slug, period, false, form({ reversalReason: 'Payment was entered against the wrong month' })))
    expect(await dbAdmin.registerEntry.count({ where: { orgId: org.id, sourceType: 'CoachPaymentOutside' } })).toBe(1)
    expect(await dbAdmin.registerEntry.findFirstOrThrow({
      where: { orgId: org.id, sourceType: 'CoachPaymentOutside' },
    })).toMatchObject({ voidedById: treasurer.id, voidReason: 'Payment was entered against the wrong month' })
    expect((await balance('SEED')).remainingCents).toBe(before)

    await ok(() => markMonthPaidOutside(org.slug, period, true, form({
      paidOn,
      reference: 'LEGACY-COACH-1',
      [`amount_${coachId}`]: '123.45',
      [`fund_${coachId}`]: 'SEED',
    })))
    expect(await dbAdmin.registerEntry.findFirstOrThrow({
      where: { orgId: org.id, sourceType: 'CoachPaymentOutside' },
    })).toMatchObject({ voidedAt: null, voidedById: null, voidReason: null })
  })

  it('copies the last term rates when starting the next term', async () => {
    await ok(() => createTerm(org.slug, { error: null }, form({
      name: 'Term 1', startDate: `${today.getFullYear()}-01-01`, endDate: `${today.getFullYear()}-04-01`, fullFee: '70', halfFee: '35',
    })))
    const first = await dbAdmin.term.findFirstOrThrow({ where: { orgId: org.id, name: 'Term 1' } })
    await ok(() => updateTerm(org.slug, { error: null }, form({
      termId: first.id, fullFee: '72', halfFee: '36', exchangeFee: '28', collectionOpensAt: '', finalCollectionAt: '',
    })))
    await ok(() => createTerm(org.slug, { error: null }, form({
      name: 'Term 2', startDate: `${today.getFullYear()}-05-01`, endDate: `${today.getFullYear()}-08-01`, copyFromTermId: first.id,
    })))
    expect(await dbAdmin.term.findFirstOrThrow({ where: { orgId: org.id, name: 'Term 2' } })).toMatchObject({
      fullFeeCents: 7_200,
      halfFeeCents: 3_600,
      exchangeFeeCents: 2_800,
    })
  })
})
