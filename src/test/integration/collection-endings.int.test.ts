/**
 * The ways a collection ends that the happy path never reaches.
 *
 * A term banked in while somebody still owes; a term where nothing came in
 * through OSL at all; a fee waived for somebody whose payment was refused;
 * dates that must come back as the day that was typed; and a member finding
 * last term's receipt after the next term has begun.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  closeCollection,
  createTerm,
  declarePayment,
  recordPayment,
  rejectPayment,
  setMemberFees,
  updateTerm,
  uploadPaynowQr,
} from '@/modules/fees/actions'
import { getOwnFee, getTerm, listCollection, listOwnTerms } from '@/modules/fees/queries'
import { depositFormInput } from '@/modules/fees/deposit-input'
import { subscriptionWorkflow } from '@/modules/workflow/subscription'
import { isoDate, longDate } from '@/modules/coach-claim/theme'
import { singaporeDay } from '@/lib/date-only'
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

const today = new Date()
const plusDays = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)

let org: TestOrg
let treasurer: TestUser
let president: TestUser
let mo: TestUser
const ids: Record<string, string> = {}

async function newTerm(name: string, from: number, to: number, withDates = true): Promise<string> {
  as(treasurer)
  await ok(() =>
    createTerm(org.slug, { error: null }, form({
      name,
      startDate: isoDate(plusDays(from)),
      endDate: isoDate(plusDays(to)),
      fullFee: '70',
      halfFee: '35',
    }))
  )
  const termId = (await dbAdmin.term.findFirstOrThrow({ where: { orgId: org.id, name } })).id
  if (withDates) {
    await ok(() =>
      updateTerm(org.slug, { error: null }, form({
        termId,
        fullFee: '70',
        halfFee: '35',
        exchangeFee: '',
        collectionOpensAt: isoDate(plusDays(from)),
        finalCollectionAt: isoDate(plusDays(from + 14)),
      }))
    )
  }
  await ok(() => uploadPaynowQr(org.slug, { error: null }, form({ termId, qr: pngFile(400, 400) })))
  return termId
}

async function flow(termId: string) {
  as(treasurer)
  const result = await subscriptionWorkflow(treasurer.id, org.id, org.slug, today, termId)
  if (!result) throw new Error('No workflow for a term that exists')
  return result
}

describe('how a collection ends', () => {
  beforeAll(async () => {
    await resetDatabase()
    await ensureBucket()
    org = await createOrganisation()
    treasurer = await createUser('Tess Treasurer')
    president = await createUser('Pat President')
    mo = await createUser('Mo Member')
    await join(treasurer, org, 'EXCO', 'TREASURER')
    await join(president, org, 'EXCO', 'PRESIDENT')
    await join(mo, org, 'MEMBER')

    for (const [name, studentId] of [
      ['Ada Lee', '1000001'],
      ['Ben Ong', '1000002'],
    ] as const) {
      ids[name] = (await addRosterMember(org, { fullName: name, studentId, rosterLabel: 'Confirmed' })).id
    }
    ids['Mo Member'] = (
      await addRosterMember(org, { fullName: 'Mo Member', studentId: '1000005', rosterLabel: 'Confirmed', userId: mo.id })
    ).id
  })

  describe('a date typed into the term', () => {
    it('comes back as the same day, in any timezone the server keeps', async () => {
      const termId = await newTerm('Dates', 400, 490)
      as(treasurer)
      await ok(() =>
        updateTerm(org.slug, { error: null }, form({
          termId,
          fullFee: '70',
          halfFee: '35',
          exchangeFee: '',
          collectionOpensAt: '2027-09-15',
          finalCollectionAt: '2027-09-30',
        }))
      )
      const term = await getTerm(treasurer.id, org.id, termId)
      // What the date field is filled with, and so what saving writes back.
      expect(isoDate(term!.finalCollectionAt!)).toBe('2027-09-30')
      expect(isoDate(term!.collectionOpensAt!)).toBe('2027-09-15')
      await dbAdmin.term.delete({ where: { id: termId } })
    })
  })

  describe('banked in while somebody still owes', () => {
    let termId: string

    beforeAll(async () => {
      termId = await newTerm('Last term', -200, -110, false)
      as(president)
      await ok(() =>
        recordPayment(org.slug, { error: null }, form({ termId, memberId: ids['Ada Lee'], reference: 'PN-ADA', route: 'OFFICIAL', reason: '' }))
      )
      // Mo pays too, so the term is one of theirs to look back at.
      await ok(() =>
        recordPayment(org.slug, { error: null }, form({ termId, memberId: ids['Mo Member'], reference: 'PN-MO', route: 'OFFICIAL', reason: '' }))
      )
    })

    it('asks for the dates first, since none were set', async () => {
      const current = await flow(termId)
      expect(current.steps.find((s) => s.state === 'current')?.key).toBe('rates')
    })

    it('moves straight on to the deposit form once banked, instead of waiting on Ben', async () => {
      as(treasurer)
      await ok(() => closeCollection(org.slug, termId))
      const after = await flow(termId)

      expect(after.steps.find((s) => s.state === 'current')?.key).toBe('deposit')
      expect(after.next?.label).toMatch(/deposit form/)
      const paid = after.steps.find((s) => s.key === 'declared')
      expect(paid?.state).toBe('done')
      expect(paid?.note).toMatch(/1 still owes/)
      expect(after.restingState ?? '').not.toMatch(/Waiting on/)
    })

    it('stays as it was when it closed, whatever happens to the roster afterwards', async () => {
      as(treasurer)
      const before = await listCollection(treasurer.id, org.id, termId)
      const newcomer = await addRosterMember(org, { fullName: 'Zed Newcomer', studentId: '1000077', rosterLabel: 'Confirmed' })
      await dbAdmin.member.update({ where: { id: ids['Ben Ong'] }, data: { rosterLabel: 'Graduated', isActive: false } })

      const after = await listCollection(treasurer.id, org.id, termId)
      expect(after.rows.map((row) => row.memberName)).not.toContain('Zed Newcomer')
      expect(after.rows.find((row) => row.memberName === 'Ben Ong')?.amountCents).toBe(7_000)
      expect(after.totals.owedCents).toBe(before.totals.owedCents)

      await dbAdmin.member.update({ where: { id: ids['Ben Ong'] }, data: { rosterLabel: 'Confirmed', isActive: true } })
      await dbAdmin.member.delete({ where: { id: newcomer.id } })
    })

    it('prints the day it was banked on the deposit form when no final collection date was set', async () => {
      as(treasurer)
      const input = await depositFormInput(treasurer.id, org.id, org.name, termId)
      expect(input?.eventDate).toBe(longDate(singaporeDay(new Date())))
    })

    it('stays reachable for a member once it is over', async () => {
      as(mo)
      const terms = await listOwnTerms(mo.id, org.id)
      expect(terms.map((t) => t.name)).toContain('Last term')
    })
  })

  describe('nothing came in through OSL', () => {
    let termId: string

    beforeAll(async () => {
      termId = await newTerm('Quiet term', -100, -20)
      as(president)
      await ok(() =>
        recordPayment(org.slug, { error: null }, form({
          termId,
          memberId: ids['Ada Lee'],
          reference: 'CASH',
          route: 'UNOFFICIAL',
          reason: 'Paid in cash at the jam',
        }))
      )
    })

    it('offers to close rather than bank in', async () => {
      const current = await flow(termId)
      expect(current.next?.label).toBe('Close the collection')
    })

    it('closes with no deposit form and no reference number spent', async () => {
      as(treasurer)
      const before = await dbAdmin.referenceNumber.count({ where: { orgId: org.id } })
      await ok(() => closeCollection(org.slug, termId))

      const term = await dbAdmin.term.findUniqueOrThrow({ where: { id: termId }, include: { incomeDeposit: true } })
      expect(term.closedAt).not.toBeNull()
      expect(term.incomeDeposit).toBeNull()
      expect(await dbAdmin.referenceNumber.count({ where: { orgId: org.id } })).toBe(before)
      expect((await dbAdmin.membershipForm.findFirstOrThrow({ where: { termId } })).state).toBe('CLOSED')
    })

    it('comes to rest instead of sitting on the home screen', async () => {
      const done = await flow(termId)
      expect(done.settled).toBe(true)
      expect(done.steps.find((s) => s.key === 'deposit')?.detail).toBe('None needed')
      expect(done.restingState).toMatch(/nothing to bank/)
    })

    it('is not picked as the term needing work', async () => {
      as(treasurer)
      const home = await subscriptionWorkflow(treasurer.id, org.id, org.slug, today)
      expect(home?.subject).not.toBe('Quiet term')
    })

    it('refuses to close twice', async () => {
      as(treasurer)
      expect((await closeCollection(org.slug, termId)).error).toMatch(/already closed/)
    })
  })

  describe('waiving a fee after a refused payment', () => {
    let termId: string

    beforeAll(async () => {
      termId = await newTerm('This term', -10, 80)
      ids['Tess Treasurer'] = (
        await addRosterMember(org, { fullName: 'Tess Treasurer', studentId: '1000009', userId: treasurer.id })
      ).id
      as(mo)
      await ok(() => declarePayment(org.slug, { error: null }, form({ termId, reference: 'PN-MO-1', proof: pngFile(300, 600) })))
      as(president)
      const payment = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, memberId: ids['Mo Member'] } })
      await ok(() => rejectPayment(org.slug, { error: null }, form({ paymentId: payment.id, reason: 'Not on the statement' })))
    })

    it('waives it, clearing the refused claim so nobody is asked to pay again', async () => {
      as(treasurer)
      const result = await ok(() =>
        setMemberFees(org.slug, { error: null }, form({ termId, memberId: ids['Mo Member'], tier: 'WAIVED', amount: '', note: 'Hardship' }))
      )
      expect(result.message).toMatch(/couldn’t match from Mo Member is cleared/)

      expect(await dbAdmin.feePayment.count({ where: { termId, memberId: ids['Mo Member'] } })).toBe(0)
      const { rows } = await listCollection(treasurer.id, org.id, termId)
      const mine = rows.find((row) => row.memberName === 'Mo Member')
      expect(mine?.amountCents).toBe(0)
      expect(mine?.status).toBeNull()

      const audit = await dbAdmin.auditLog.findFirstOrThrow({
        where: { orgId: org.id, action: 'fee.set_fee', targetId: ids['Mo Member'] },
        orderBy: { createdAt: 'desc' },
      })
      expect(JSON.stringify(audit.after)).toMatch(/PN-MO-1/)
      expect(JSON.stringify(audit.after)).not.toMatch(/proof/i)
    })

    it('still will not waive a payment waiting to be checked', async () => {
      as(treasurer)
      await ok(() => declarePayment(org.slug, { error: null }, form({ termId, reference: 'PN-TESS-1', proof: pngFile(300, 600) })))
      as(president)
      const result = await setMemberFees(org.slug, { error: null }, form({ termId, memberId: ids['Tess Treasurer'], tier: 'WAIVED', amount: '', note: '' }))
      expect(result.message).toMatch(/said they paid/)
      expect(await dbAdmin.feePayment.count({ where: { termId, status: 'DECLARED' } })).toBeGreaterThan(0)
    })

    it('lists the current term alongside the ones a member took part in', async () => {
      as(mo)
      const terms = await listOwnTerms(mo.id, org.id)
      expect(terms[0]).toMatchObject({ name: 'This term', current: true })
      expect(terms.map((t) => t.name)).toContain('Last term')
      // Mo owed for Quiet term when it closed, so it is one of theirs too.
      expect(terms.map((t) => t.name)).toContain('Quiet term')
    })

    it('shows a member what a closed term charged them, whatever the roster says now', async () => {
      const quiet = await dbAdmin.term.findFirstOrThrow({ where: { orgId: org.id, name: 'Quiet term' } })
      await dbAdmin.member.update({ where: { id: ids['Mo Member'] }, data: { rosterLabel: 'Graduated', isActive: false } })
      as(mo)
      const fee = await getOwnFee(mo.id, org.id, quiet.id)
      expect(fee.amountCents).toBe(7_000)
      expect(fee.owesNothing).toBe(false)
      await dbAdmin.member.update({ where: { id: ids['Mo Member'] }, data: { rosterLabel: 'Confirmed', isActive: true } })
    })

    it('keeps a closed term with nobody charged closed to newcomers', async () => {
      const termId = await newTerm('Free term', -300, -250)
      as(treasurer)
      await ok(() =>
        updateTerm(org.slug, { error: null }, form({
          termId,
          fullFee: '0',
          halfFee: '0',
          exchangeFee: '',
          collectionOpensAt: isoDate(plusDays(-300)),
          finalCollectionAt: isoDate(plusDays(-290)),
        }))
      )
      await ok(() => closeCollection(org.slug, termId))
      expect((await dbAdmin.term.findUniqueOrThrow({ where: { id: termId } })).chargesRecordedAt).not.toBeNull()
      const newcomer = await addRosterMember(org, { fullName: 'Yan Later', studentId: '1000088', rosterLabel: 'Confirmed' })
      const { rows } = await listCollection(treasurer.id, org.id, termId)
      expect(rows.map((row) => row.memberName)).not.toContain('Yan Later')
      await dbAdmin.member.delete({ where: { id: newcomer.id } })
    })
  })
})
