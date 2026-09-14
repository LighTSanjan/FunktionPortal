/**
 * A term's subscription collection, start to finish.
 *
 * Members sign up with whatever address they like, say which student they are,
 * and an exco member confirms it. The treasurer opens a term, sets its dates,
 * puts the QR up. Members pay and declare with a screenshot. A second exco
 * member checks each one — nobody decides their own — refuses one, confirms
 * the rest. The collection closes, the deposit form is built from what was
 * banked, and filed.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  claimStudentId,
  closeCollection,
  confirmPayment,
  createTerm,
  declarePayment,
  linkMemberAccount,
  markDepositSubmitted,
  rejectPayment,
  updateTerm,
  uploadPaynowQr,
} from '@/modules/fees/actions'
import { getOwnFee, listCollection, listUnlinked } from '@/modules/fees/queries'
import { subscriptionWorkflow } from '@/modules/workflow/subscription'
import { GET as qrRoute } from '@/app/(dashboard)/[orgSlug]/fees/qr/[termId]/route'
import { GET as proofRoute } from '@/app/(dashboard)/[orgSlug]/fees/collection/[paymentId]/proof/route'
import { GET as depositRoute } from '@/app/(dashboard)/[orgSlug]/fees/collection/deposit-form/route'
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
  outcome,
  pngFile,
  resetDatabase,
  type TestOrg,
  type TestUser,
} from './harness'

const today = new Date()
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plusDays = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)

let org: TestOrg
let treasurer: TestUser
let president: TestUser
let ada: TestUser
let ben: TestUser
let cleo: TestUser
let termId: string

async function flow(user: TestUser) {
  const result = await subscriptionWorkflow(user.id, org.id, org.slug, today, termId)
  if (!result) throw new Error('No subscription workflow for a term that exists')
  return result
}

describe('a term’s subscription collection', () => {
  beforeAll(async () => {
    await resetDatabase()
    await ensureBucket()
    org = await createOrganisation()
    treasurer = await createUser('Tess Treasurer')
    president = await createUser('Pat President')
    ada = await createUser('Ada Lee', 'ada.personal@gmail.test')
    ben = await createUser('Ben Ong', 'ben@test.local')
    cleo = await createUser('Cleo Tan', 'cleo@test.local')
    await join(treasurer, org, 'EXCO', 'TREASURER')
    await join(president, org, 'EXCO', 'PRESIDENT')
    for (const user of [ada, ben, cleo]) await join(user, org, 'MEMBER')

    await addRosterMember(org, { fullName: 'Ada Lee', studentId: '1000001', email: 'ada@uni.test' })
    // Ben and Cleo were linked when they first signed in; Ada used a personal address.
    await addRosterMember(org, { fullName: 'Ben Ong', studentId: '1000002', userId: ben.id })
    await addRosterMember(org, { fullName: 'Cleo Tan', studentId: '1000003', rosterLabel: '1/2 term', userId: cleo.id })
    await addRosterMember(org, { fullName: 'Dan Graduated', studentId: '1000004', rosterLabel: 'Graduated' })
  })

  describe('matching an account to the roster by student ID', () => {
    it('tells Ada her account is not matched, rather than showing a fee', async () => {
      as(ada)
      const fee = await getOwnFee(ada.id, org.id, null)
      expect(fee.member).toBeNull()
    })

    it('records her claim without linking anything', async () => {
      as(ada)
      await ok(() => claimStudentId(org.slug, { error: null }, form({ studentId: ' 1000001 ' })))
      expect((await dbAdmin.member.findFirstOrThrow({ where: { studentId: '1000001' } })).userId).toBeNull()
      expect((await dbAdmin.user.findUniqueOrThrow({ where: { id: ada.id } })).claimedStudentId).toBe('1000001')
    })

    it('rejects something that is not a student ID', async () => {
      as(ada)
      const bad = await claimStudentId(org.slug, { error: null }, form({ studentId: 'abc' }))
      expect(bad.error).toBeTruthy()
    })

    it('shows the exco the claim, already matched to the right row', async () => {
      as(treasurer)
      const { accounts } = await listUnlinked(treasurer.id, org.id)
      const claim = accounts.find((account) => account.userId === ada.id)
      const expected = await dbAdmin.member.findFirstOrThrow({ where: { studentId: '1000001' } })
      expect(claim?.suggestedMemberId).toBe(expected.id)
      expect(claim?.contested).toBe(false)
    })

    it('flags two accounts claiming the same student ID', async () => {
      const impostor = await createUser('Not Ada', 'notada@test.local')
      await join(impostor, org, 'MEMBER')
      as(impostor)
      await ok(() => claimStudentId(org.slug, { error: null }, form({ studentId: '1000001' })))

      as(treasurer)
      const { accounts } = await listUnlinked(treasurer.id, org.id)
      expect(accounts.filter((a) => a.claimedStudentId === '1000001').every((a) => a.contested)).toBe(true)
    })

    it('does not let a member link themselves', async () => {
      as(ada)
      const member = await dbAdmin.member.findFirstOrThrow({ where: { studentId: '1000001' } })
      const result = await outcome(() =>
        linkMemberAccount(org.slug, { error: null }, form({ userId: ada.id, memberId: member.id }))
      )
      expect(result.kind).toBe('denied')
    })

    it('links when an exco member confirms', async () => {
      as(treasurer)
      const member = await dbAdmin.member.findFirstOrThrow({ where: { studentId: '1000001' } })
      await ok(() => linkMemberAccount(org.slug, { error: null }, form({ userId: ada.id, memberId: member.id })))
      as(ada)
      const fee = await getOwnFee(ada.id, org.id, null)
      expect(fee.member?.fullName).toBe('Ada Lee')
    })
  })

  describe('running the collection', () => {
    it('opens a term', async () => {
      as(treasurer)
      await ok(() =>
        createTerm(org.slug, { error: null }, form({
          name: 'Trimester 1',
          startDate: iso(plusDays(-30)),
          endDate: iso(plusDays(60)),
          fullFee: '70',
          halfFee: '35',
        }))
      )
      termId = (await dbAdmin.term.findFirstOrThrow({ where: { orgId: org.id } })).id
    })

    it('does not call the rates done without both collection dates', async () => {
      as(treasurer)
      const current = await flow(treasurer)
      expect(current.steps.find((s) => s.key === 'rates')?.state).toBe('current')
      expect(current.next?.label).toMatch(/rates/)
    })

    it('sets the dates, then asks for the QR — and a member sees no QR yet', async () => {
      as(treasurer)
      await ok(() =>
        updateTerm(org.slug, { error: null }, form({
          termId,
          fullFee: '70',
          halfFee: '35',
          exchangeFee: '',
          collectionOpensAt: iso(plusDays(-7)),
          finalCollectionAt: iso(plusDays(14)),
        }))
      )
      const current = await flow(treasurer)
      expect(current.next?.label).toMatch(/QR/)
      expect(current.steps.filter((s) => s.state === 'current')).toHaveLength(1)

      as(ben)
      const fee = await getOwnFee(ben.id, org.id, termId)
      expect(fee.term?.hasPaynowQr).toBe(false)
    })

    it('refuses a QR too small to scan', async () => {
      as(treasurer)
      const result = await uploadPaynowQr(org.slug, { error: null }, form({ termId, qr: pngFile(80, 80) }))
      expect(result.error).toMatch(/scan/)
    })

    it('puts the QR up, and members can fetch it', async () => {
      as(treasurer)
      await ok(() => uploadPaynowQr(org.slug, { error: null }, form({ termId, qr: pngFile(400, 400) })))

      as(ben)
      const response = await qrRoute(new Request('http://test/'), {
        params: Promise.resolve({ orgSlug: org.slug, termId }),
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toMatch(/no-store/)
    })

    it('does not let a member put a QR up', async () => {
      as(ben)
      const result = await outcome(() => uploadPaynowQr(org.slug, { error: null }, form({ termId, qr: pngFile(400, 400) })))
      expect(result.kind).toBe('denied')
    })

    it('charges each member by their roster tier, and a graduate nothing', async () => {
      as(treasurer)
      const { rows } = await listCollection(treasurer.id, org.id, termId)
      const byName = Object.fromEntries(rows.map((row) => [row.memberName, row.amountCents]))
      expect(byName['Ada Lee']).toBe(7000)
      expect(byName['Ben Ong']).toBe(7000)
      expect(byName['Cleo Tan']).toBe(3500)
      expect(byName['Dan Graduated'] ?? 0).toBe(0)
    })

    it('takes declarations with a screenshot, and refuses one without', async () => {
      as(ada)
      const bare = await declarePayment(org.slug, { error: null }, form({ termId, reference: 'PN-ADA-1' }))
      expect(bare.error).toMatch(/screenshot/)

      await ok(() => declarePayment(org.slug, { error: null }, form({ termId, reference: 'PN-ADA-1', proof: pngFile(300, 600) })))
      as(ben)
      await ok(() => declarePayment(org.slug, { error: null }, form({ termId, reference: 'PN-BEN-1', proof: pngFile(300, 600) })))
      as(cleo)
      await ok(() => declarePayment(org.slug, { error: null }, form({ termId, reference: 'PN-CLEO-1', proof: pngFile(300, 600) })))
      // The treasurer is on the roster too, and pays like anyone else.
      await addRosterMember(org, { fullName: 'Tess Treasurer', studentId: '1000009', userId: treasurer.id })
      as(treasurer)
      await ok(() => declarePayment(org.slug, { error: null }, form({ termId, reference: 'PN-TESS-1', proof: pngFile(300, 600) })))

      expect(await dbAdmin.feePayment.count({ where: { termId, status: 'DECLARED' } })).toBe(4)
    })

    it('never lets a declaration set its own amount', async () => {
      const ada$ = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, paymentReference: 'PN-ADA-1' } })
      expect(ada$.amountCents).toBe(7000)
    })

    it('shows payment screenshots to the exco and to nobody else', async () => {
      const payment = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, paymentReference: 'PN-BEN-1' } })

      as(president)
      const allowed = await proofRoute(new Request('http://test/'), {
        params: Promise.resolve({ orgSlug: org.slug, paymentId: payment.id }),
      })
      expect(allowed.status).toBe(200)

      // Ben's own screenshot, fetched by Ben: still no. The rule is that
      // screenshots are an exco record, not a member one.
      as(ben)
      const refused = await outcome(() =>
        proofRoute(new Request('http://test/'), { params: Promise.resolve({ orgSlug: org.slug, paymentId: payment.id }) })
      )
      expect(refused.kind).toBe('denied')
    })

    it('asks the exco to check the declarations', async () => {
      as(treasurer)
      const current = await flow(treasurer)
      expect(current.next?.label).toMatch(/Check 4 declarations/)
    })

    it('does not let a member confirm their own payment', async () => {
      as(ben)
      const payment = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, paymentReference: 'PN-BEN-1' } })
      const result = await outcome(() => confirmPayment(org.slug, { error: null }, form({ paymentId: payment.id })))
      expect(result.kind).toBe('denied')
      expect((await dbAdmin.feePayment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('DECLARED')
    })

    it('does not let the treasurer confirm their own payment', async () => {
      as(treasurer)
      const own = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, paymentReference: 'PN-TESS-1' } })
      const result = await confirmPayment(org.slug, { error: null }, form({ paymentId: own.id }))
      expect(result.error).toBeTruthy()
      expect((await dbAdmin.feePayment.findUniqueOrThrow({ where: { id: own.id } })).status).toBe('DECLARED')
    })

    it('holds that rule in the database, not just the app', async () => {
      // The trigger is the control; the action's check is a courtesy. Going
      // around the action and writing the row as the treasurer must fail.
      const own = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, paymentReference: 'PN-TESS-1' } })
      const { dbAs } = await import('@/core/db')
      await expect(
        dbAs(treasurer.id, (tx) =>
          tx.feePayment.update({
            where: { id: own.id },
            data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedByUserId: treasurer.id },
          })
        )
      ).rejects.toThrow()
    })

    it('refuses a refusal without a reason', async () => {
      as(president)
      const payment = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, paymentReference: 'PN-CLEO-1' } })
      const result = await rejectPayment(org.slug, { error: null }, form({ paymentId: payment.id }))
      expect(result.error).toMatch(/why/i)
    })

    it('lets the president decide everyone else’s', async () => {
      as(president)
      const payments = await dbAdmin.feePayment.findMany({ where: { termId } })
      for (const payment of payments) {
        if (payment.paymentReference === 'PN-CLEO-1') {
          await ok(() => rejectPayment(org.slug, { error: null }, form({ paymentId: payment.id, reason: 'No matching line on the statement' })))
        } else {
          await ok(() => confirmPayment(org.slug, { error: null }, form({ paymentId: payment.id })))
        }
      }
      as(cleo)
      const fee = await getOwnFee(cleo.id, org.id, termId)
      expect(fee.payment?.status).toBe('REJECTED')
      expect(fee.payment?.rejectedReason).toMatch(/statement/)
    })

    it('says who still owes before offering to close', async () => {
      as(treasurer)
      const current = await flow(treasurer)
      expect(current.next?.label).toBe('Close the collection')
      expect(current.steps.find((s) => s.key === 'close')?.note).toMatch(/1 member has still not paid/)
    })

    it('closes, and the deposit form states only what was confirmed', async () => {
      as(treasurer)
      await ok(() => closeCollection(org.slug, termId))

      const response = await depositRoute(new Request(`http://test/?term=${termId}`), {
        params: Promise.resolve({ orgSlug: org.slug }),
      })
      expect(response.status).toBe(200)

      const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()))
      const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
      // Ada, Ben and Tess at $70. Cleo was refused, Dan owes nothing.
      expect(xml).toContain('<v>70</v>')
      expect(xml).toContain('<v>3</v>')
      expect(xml).not.toContain('Cleo')
      expect(xml).toMatch(/INC\d{2}-097-0001/)
    })

    it('stops serving the QR once the collection is closed', async () => {
      as(ben)
      const response = await qrRoute(new Request('http://test/'), {
        params: Promise.resolve({ orgSlug: org.slug, termId }),
      })
      expect(response.status).toBe(404)
    })

    it('refuses a late payment in the database, even going around the action', async () => {
      const cleoRow = await dbAdmin.member.findFirstOrThrow({ where: { studentId: '1000003' } })
      const { dbAs } = await import('@/core/db')
      await expect(
        dbAs(cleo.id, (tx) =>
          tx.feePayment.updateMany({
            where: { termId, memberId: cleoRow.id },
            data: { status: 'DECLARED', paymentReference: 'PN-CLEO-SNEAKY', rejectedReason: null },
          })
        )
      ).rejects.toThrow(/closed/)
    })

    it('refuses declarations against a closed collection', async () => {
      as(cleo)
      const late = await declarePayment(org.slug, { error: null }, form({ termId, reference: 'PN-CLEO-2', proof: pngFile(300, 600) }))
      expect(late.error).toBeTruthy()
    })

    it('files the form, and the workflow comes to rest saying who did not pay', async () => {
      as(treasurer)
      expect((await flow(treasurer)).next?.label).toMatch(/deposit form/)
      await ok(() => markDepositSubmitted(org.slug, termId, true))
      const done = await flow(treasurer)
      expect(done.settled).toBe(true)
      expect(done.restingState).toMatch(/still owe/)
    })
  })

  describe('one club cannot see another', () => {
    it('hides every row of this club from the exco of a second', async () => {
      const other = await createOrganisation('other-club', 'Other Club')
      const outsider = await createUser('Olly Outsider')
      await join(outsider, other, 'EXCO', 'TREASURER')

      as(outsider)
      const { dbAs } = await import('@/core/db')
      const seen = await dbAs(outsider.id, async (tx) => ({
        payments: await tx.feePayment.count(),
        members: await tx.member.count(),
        terms: await tx.term.count({ where: { orgId: org.id } }),
        users: await tx.user.count({ where: { id: { in: [ada.id, ben.id, treasurer.id] } } }),
        invoices: await tx.invoice.count(),
      }))
      expect(seen).toEqual({ payments: 0, members: 0, terms: 0, users: 0, invoices: 0 })

      const viaAction = await outcome(() =>
        confirmPayment(org.slug, { error: null }, form({ paymentId: 'anything' }))
      )
      expect(viaAction.kind).toBe('not-found')
    })

    it('will not let an outsider’s id reach this club’s screenshot', async () => {
      const outsider = await dbAdmin.user.findFirstOrThrow({ where: { name: 'Olly Outsider' } })
      const payment = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId } })
      as({ id: outsider.id, email: outsider.email, name: outsider.name })
      const result = await outcome(() =>
        proofRoute(new Request('http://test/'), {
          params: Promise.resolve({ orgSlug: 'other-club', paymentId: payment.id }),
        })
      )
      // Their own org slug, this club's payment id: nothing comes back — and
      // nothing crashes either, which would pass a looser assertion.
      expect(result.kind).toBe('returned')
      if (result.kind === 'returned') expect((result.value as Response).status).toBe(404)
    })
  })
})
