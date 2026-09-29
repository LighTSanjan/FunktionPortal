/**
 * The exco running membership fees for people who never open the portal.
 *
 * Most of the roster never signs in, so the treasurer sets what each person
 * pays — half a term, waived, a figure of their own — and records payments
 * straight off the bank statement. Nobody records their own, and the database
 * holds that line as well as the action.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createTerm, updateTerm } from '@/modules/fees/collection-actions'
import { declarePayment, recordPayment, undoPayment } from '@/modules/fees/payment-actions'
import { setMemberFees } from '@/modules/fees/member-actions'
import { getOwnFee, listCollection } from '@/modules/fees/queries'
import { closeCollection } from '@/modules/fees/collection-actions'
import { rejectPayment } from '@/modules/fees/payment-actions'
import { linkRosterToAccounts } from '@/core/auth/roster-link'
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
let member: TestUser
let termId: string
const ids: Record<string, string> = {}

async function row(name: string) {
  const { rows } = await listCollection(treasurer.id, org.id, termId)
  return rows.find((r) => r.memberName === name)
}

describe('membership fees, run by the exco', () => {
  beforeAll(async () => {
    await resetDatabase()
    await ensureBucket()
    org = await createOrganisation()
    treasurer = await createUser('Tess Treasurer')
    president = await createUser('Pat President')
    member = await createUser('Mo Member')
    member = { ...member }
    await join(treasurer, org, 'EXCO', 'TREASURER')
    await join(president, org, 'EXCO', 'PRESIDENT')
    await join(member, org, 'MEMBER')

    for (const [name, studentId, label] of [
      ['Ada Lee', '1000001', 'Confirmed'],
      ['Ben Ong', '1000002', 'May come back?'],
      ['Cleo Tan', '1000003', 'Confirmed'],
      ['Dan Gone', '1000004', 'Graduated'],
    ] as const) {
      ids[name] = (await addRosterMember(org, { fullName: name, studentId, rosterLabel: label })).id
    }
    ids['Mo Member'] = (await addRosterMember(org, { fullName: 'Mo Member', studentId: '1000005', userId: member.id })).id
    ids['Tess Treasurer'] = (
      await addRosterMember(org, { fullName: 'Tess Treasurer', studentId: '1000009', userId: treasurer.id })
    ).id

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
  })

  it('puts several people on half a term at once', async () => {
    as(treasurer)
    const result = await setMemberFees(org.slug, { error: null }, form({
      termId,
      memberId: [ids['Ada Lee'], ids['Ben Ong']],
      tier: 'HALF',
      amount: '',
      note: 'Joined in week 7',
    }))
    expect(result.error).toBeNull()
    expect(result.message).toMatch(/Ada Lee and Ben Ong are on half term/)
    expect((await row('Ada Lee'))?.amountCents).toBe(3500)
    // "May come back?" was a guess; a decision is not.
    expect((await row('Ben Ong'))?.tierUncertain).toBe(false)
    expect(await dbAdmin.auditLog.count({ where: { action: 'fee.set_fee' } })).toBe(2)
  })

  it('charges a custom amount, and refuses one with no figure', async () => {
    as(treasurer)
    const bare = await setMemberFees(org.slug, { error: null }, form({ termId, memberId: ids['Cleo Tan'], tier: 'CUSTOM', amount: '', note: '' }))
    expect(bare.error).toMatch(/amount/)
    await ok(() => setMemberFees(org.slug, { error: null }, form({ termId, memberId: ids['Cleo Tan'], tier: 'CUSTOM', amount: '20.50', note: '' })))
    expect((await row('Cleo Tan'))?.amountCents).toBe(2050)
  })

  it('puts somebody who left back on the list when the exco charge them', async () => {
    as(treasurer)
    expect(await row('Dan Gone')).toBeUndefined()
    await ok(() => setMemberFees(org.slug, { error: null }, form({ termId, memberId: ids['Dan Gone'], tier: 'FULL', amount: '', note: '' })))
    expect((await row('Dan Gone'))?.amountCents).toBe(7000)
    await ok(() => setMemberFees(org.slug, { error: null }, form({ termId, memberId: ids['Dan Gone'], tier: 'ROSTER', amount: '', note: '' })))
    expect(await row('Dan Gone')).toBeUndefined()
  })

  it('shows a member the fee the exco set for them', async () => {
    as(treasurer)
    await ok(() => setMemberFees(org.slug, { error: null }, form({ termId, memberId: ids['Mo Member'], tier: 'WAIVED', amount: '', note: '' })))
    as(member)
    const fee = await getOwnFee(member.id, org.id, termId)
    expect(fee.tier).toBe('WAIVED')
    expect(fee.owesNothing).toBe(true)
    const declared = await declarePayment(org.slug, { error: null }, form({ termId, reference: 'PN-MO', proof: pngFile(300, 600) }))
    expect(declared.error).toMatch(/waived/)
  })

  it('does not let a member set anybody’s fee', async () => {
    as(member)
    const result = await outcome(() =>
      setMemberFees(org.slug, { error: null }, form({ termId, memberId: ids['Mo Member'], tier: 'FULL', amount: '', note: '' }))
    )
    expect(result.kind).toBe('denied')
  })

  it('records a payment off the bank statement for somebody with no account', async () => {
    as(treasurer)
    await ok(() => recordPayment(org.slug, { error: null }, form({ termId, memberId: ids['Ada Lee'], reference: 'DBS 0915 ADA', route: 'OFFICIAL', reason: '' })))
    const ada = await row('Ada Lee')
    expect(ada?.status).toBe('CONFIRMED')
    expect(ada?.source).toBe('RECORDED')
    expect(ada?.amountCents).toBe(3500)
    expect(ada?.confirmedByName).toBe('Tess Treasurer')
  })

  it('will not change the fee under a payment that is already in', async () => {
    as(treasurer)
    const result = await setMemberFees(org.slug, { error: null }, form({ termId, memberId: ids['Ada Lee'], tier: 'FULL', amount: '', note: '' }))
    expect(result.message).toMatch(/already paid/)
    expect((await row('Ada Lee'))?.amountCents).toBe(3500)
  })

  it('does not let the treasurer record their own fee, in the action or the database', async () => {
    as(treasurer)
    const result = await recordPayment(org.slug, { error: null }, form({ termId, memberId: ids['Tess Treasurer'], reference: '', route: 'OFFICIAL', reason: '' }))
    expect(result.error).toMatch(/your own/)

    const { dbAs } = await import('@/core/db')
    await expect(
      dbAs(treasurer.id, (tx) =>
        tx.feePayment.create({
          data: {
            orgId: org.id,
            termId,
            memberId: ids['Tess Treasurer'],
            tier: 'FULL',
            amountCents: 7000,
            status: 'CONFIRMED',
            source: 'RECORDED',
            confirmedAt: new Date(),
            confirmedByUserId: treasurer.id,
          },
        })
      )
    ).rejects.toThrow()

    // Somebody else can.
    as(president)
    await ok(() => recordPayment(org.slug, { error: null }, form({ termId, memberId: ids['Tess Treasurer'], reference: '', route: 'OFFICIAL', reason: '' })))
  })

  it('needs a reason for money held outside OSL', async () => {
    as(treasurer)
    const bare = await recordPayment(org.slug, { error: null }, form({ termId, memberId: ids['Cleo Tan'], reference: '', route: 'UNOFFICIAL', reason: '' }))
    expect(bare.error).toMatch(/why/i)
  })

  it('undoes a recorded payment, and sends a member’s own declaration back to be checked', async () => {
    as(treasurer)
    const recorded = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, memberId: ids['Ada Lee'] } })
    await ok(() => undoPayment(org.slug, recorded.id))
    expect(await dbAdmin.feePayment.findUnique({ where: { id: recorded.id } })).toBeNull()
    expect((await row('Ada Lee'))?.status).toBeNull()

    // Cleo declares herself, the treasurer confirms from the statement, then undoes it.
    const cleo = await createUser('Cleo Tan', 'cleo@test.local')
    await join(cleo, org, 'MEMBER')
    await dbAdmin.member.update({ where: { id: ids['Cleo Tan'] }, data: { userId: cleo.id } })
    as(cleo)
    await ok(() => declarePayment(org.slug, { error: null }, form({ termId, reference: 'PN-CLEO', proof: pngFile(300, 600) })))
    const declared = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, memberId: ids['Cleo Tan'] } })
    expect(declared.amountCents).toBe(2050)

    as(treasurer)
    await ok(() => recordPayment(org.slug, { error: null }, form({ termId, memberId: ids['Cleo Tan'], reference: '', route: 'OFFICIAL', reason: '' })))
    expect((await dbAdmin.feePayment.findUniqueOrThrow({ where: { id: declared.id } })).status).toBe('CONFIRMED')
    await ok(() => undoPayment(org.slug, declared.id))
    const back = await dbAdmin.feePayment.findUniqueOrThrow({ where: { id: declared.id } })
    expect(back.status).toBe('DECLARED')
    expect(back.paymentProofPath).toBeTruthy()
    expect(await dbAdmin.auditLog.count({ where: { action: 'fee.undo' } })).toBe(2)
  })

  it('reprices a declaration still waiting when its fee changes', async () => {
    as(treasurer)
    await ok(() => setMemberFees(org.slug, { error: null }, form({ termId, memberId: ids['Cleo Tan'], tier: 'HALF', amount: '', note: '' })))
    const declared = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, memberId: ids['Cleo Tan'] } })
    expect(declared.amountCents).toBe(3500)
    expect(declared.tier).toBe('HALF')
  })

  it('will not move a confirmed payment onto the confirmer’s own row afterwards', async () => {
    as(treasurer)
    await ok(() => recordPayment(org.slug, { error: null }, form({ termId, memberId: ids['Ben Ong'], reference: '', route: 'OFFICIAL', reason: '' })))
    const ben = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, memberId: ids['Ben Ong'] } })
    await dbAdmin.feePayment.deleteMany({ where: { termId, memberId: ids['Tess Treasurer'] } })
    const { dbAs } = await import('@/core/db')
    await expect(
      dbAs(treasurer.id, (tx) => tx.feePayment.update({ where: { id: ben.id }, data: { memberId: ids['Tess Treasurer'] } }))
    ).rejects.toThrow()
  })

  it('will not write a fee naming one club with another club’s member', async () => {
    const other = await createOrganisation('elsewhere', 'Elsewhere')
    const stranger = await addRosterMember(other, { fullName: 'Sam Stranger', studentId: '1000777' })
    const { dbAs } = await import('@/core/db')
    await expect(
      dbAs(treasurer.id, (tx) =>
        tx.feeArrangement.create({ data: { orgId: org.id, termId, memberId: stranger.id, tier: 'WAIVED' } })
      )
    ).rejects.toThrow()
  })

  it('refuses to record a payment on a row that is plainly the recorder’s, even unlinked', async () => {
    const eve = await createUser('Eve Exco', '1000888@mymail.sutd.edu.sg')
    await join(eve, org, 'EXCO')
    const row = await addRosterMember(org, { fullName: 'Eve Exco', studentId: '1000888' })
    as(eve)
    const result = await recordPayment(org.slug, { error: null }, form({ termId, memberId: row.id, reference: '', route: 'OFFICIAL', reason: '' }))
    expect(result.error).toMatch(/looks like yours/)
  })

  it('does not auto-link an account to a row whose fee it recorded', async () => {
    const finn = await createUser('Finn Exco', 'finn.personal@gmail.test')
    await join(finn, org, 'EXCO')
    const row = await addRosterMember(org, { fullName: 'Finn Exco', studentId: '1000999' })
    as(finn)
    await ok(() => recordPayment(org.slug, { error: null }, form({ termId, memberId: row.id, reference: '', route: 'OFFICIAL', reason: '' })))
    // Finn later proves the student-ID address that row belongs to.
    await dbAdmin.user.update({ where: { id: finn.id }, data: { email: '1000999@mymail.sutd.edu.sg' } })
    await linkRosterToAccounts(org.id, treasurer.id)
    expect((await dbAdmin.member.findUniqueOrThrow({ where: { id: row.id } })).userId).toBeNull()
  })

  it('keeps a refused declaration recorded from the statement a declaration, so undo does not delete it', async () => {
    as(president)
    const cleo = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, memberId: ids['Cleo Tan'] } })
    await ok(() => rejectPayment(org.slug, { error: null }, form({ paymentId: cleo.id, reason: 'Not on the statement yet' })))
    await ok(() => recordPayment(org.slug, { error: null }, form({ termId, memberId: ids['Cleo Tan'], reference: 'LATER', route: 'OFFICIAL', reason: '' })))
    await ok(() => undoPayment(org.slug, cleo.id))
    const back = await dbAdmin.feePayment.findUniqueOrThrow({ where: { id: cleo.id } })
    expect(back.status).toBe('DECLARED')
    expect(back.source).toBe('DECLARATION')
  })

  it('freezes fees and payments once the collection closes', async () => {
    as(president)
    for (const p of await dbAdmin.feePayment.findMany({ where: { termId, status: 'DECLARED' } })) {
      await ok(() => rejectPayment(org.slug, { error: null }, form({ paymentId: p.id, reason: 'Closing' })))
    }
    as(treasurer)
    await ok(() => closeCollection(org.slug, termId))
    const paid = await dbAdmin.feePayment.findFirstOrThrow({ where: { termId, status: 'CONFIRMED', source: 'RECORDED' } })
    expect((await undoPayment(org.slug, paid.id)).error).toMatch(/closed/)
    const { dbAs } = await import('@/core/db')
    await expect(dbAs(treasurer.id, (tx) => tx.feePayment.delete({ where: { id: paid.id } }))).rejects.toThrow()
    const setAfter = await setMemberFees(org.slug, { error: null }, form({ termId, memberId: ids['Ada Lee'], tier: 'FULL', amount: '', note: '' }))
    expect(setAfter.error).toMatch(/closed/)
  })
})
