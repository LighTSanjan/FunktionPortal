/**
 * The membership form: the exco open it and add questions, members fill it
 * in and pay, and somebody not on the roster yet can too — waiting for the
 * exco to match them or add them. What they type about who they are never
 * reaches a roster row on its own, and the database holds that line as well.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createTerm, updateTerm, uploadPaynowQr, closeCollection } from '@/modules/fees/collection-actions'
import { confirmPayment, recordPayment } from '@/modules/fees/payment-actions'
import { listCollection } from '@/modules/fees/queries'
import { deleteQuestion, saveAudience, saveFormSettings, saveQuestion, setFormState } from '@/modules/membership-form/form-actions'
import { clearHeldPayment, matchResponse, removeResponse } from '@/modules/membership-form/response-actions'
import { submitMembershipForm } from '@/modules/membership-form/submit-actions'
import { getForm, listResponses } from '@/modules/membership-form/queries'
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
let newbie: TestUser
let returning: TestUser
let termId: string
let questionId: string
const rows: Record<string, string> = {}

const blank = { error: null }

async function collectionRow(name: string) {
  const { rows: list } = await listCollection(treasurer.id, org.id, termId)
  return list.find((r) => r.memberName === name)
}

async function responseOf(user: TestUser) {
  return dbAdmin.membershipResponse.findFirst({ where: { termId, userId: user.id } })
}

describe('the membership form', () => {
  beforeAll(async () => {
    await resetDatabase()
    await ensureBucket()
    org = await createOrganisation()
    treasurer = await createUser('Tess Treasurer')
    president = await createUser('Pat President')
    ada = await createUser('Ada Lee')
    newbie = await createUser('Nina New', 'nina_new@mymail.sutd.edu.sg')
    returning = await createUser('Remy Back', 'remy.back@gmail.test')
    await join(treasurer, org, 'EXCO', 'TREASURER')
    await join(president, org, 'EXCO', 'PRESIDENT')
    for (const user of [ada, newbie, returning]) await join(user, org, 'MEMBER')

    rows.ada = (await addRosterMember(org, { fullName: 'Ada Lee', studentId: '1000001', userId: ada.id })).id
    rows.remy = (await addRosterMember(org, { fullName: 'Remy Back', studentId: '1000002' })).id
    rows.tess = (await addRosterMember(org, { fullName: 'Tess Treasurer', studentId: '1000009', userId: treasurer.id })).id

    as(treasurer)
    await ok(() =>
      createTerm(org.slug, blank, form({ name: 'Trimester 1', startDate: iso(plusDays(-30)), endDate: iso(plusDays(60)), fullFee: '70', halfFee: '35' }))
    )
    termId = (await dbAdmin.term.findFirstOrThrow({ where: { orgId: org.id } })).id
    await ok(() =>
      updateTerm(org.slug, blank, form({
        termId, fullFee: '70', halfFee: '35', exchangeFee: '', collectionOpensAt: iso(plusDays(-7)), finalCollectionAt: iso(plusDays(14)),
      }))
    )
  })

  describe('the exco setting it up', () => {
    it('starts every new term with a draft form', async () => {
      const draft = await getForm(treasurer.id, org.id, termId)
      expect(draft.id).not.toBeNull()
      expect(draft.state).toBe('DRAFT')
    })

    it('will not open a form with no way to pay', async () => {
      as(treasurer)
      const refused = await setFormState(org.slug, termId, 'OPEN')
      expect(refused.error).toMatch(/PayNow QR/)
    })

    it('adds a question of the club’s own', async () => {
      as(treasurer)
      const bad = await saveQuestion(org.slug, blank, form({ termId, type: 'ONE_CHOICE', label: 'Style', help: '', options: 'Popping' }))
      expect(bad.error).toMatch(/two choices/)
      await ok(() =>
        saveQuestion(org.slug, blank, form({ termId, type: 'SHORT_TEXT', label: 'Telegram handle', help: '', required: 'on', options: '' }))
      )
      questionId = (await dbAdmin.membershipQuestion.findFirstOrThrow({ where: { label: 'Telegram handle' } })).id
      await ok(() => saveFormSettings(org.slug, blank, form({ termId, intro: 'Welcome back!' })))
      const saved = await getForm(treasurer.id, org.id, termId)
      expect(saved.questions.map((q) => q.label)).toEqual(['Telegram handle'])
      expect(saved.intro).toBe('Welcome back!')
    })

    it('does not take responses while it is a draft', async () => {
      as(ada)
      const refused = await submitMembershipForm(org.slug, blank, form({ termId, tier: 'FULL', [`q_${questionId}`]: '@ada' }))
      expect(refused.error).toMatch(/not taking responses/)
    })

    it('does not let a member open it or change its questions', async () => {
      as(ada)
      expect((await outcome(() => setFormState(org.slug, termId, 'OPEN'))).kind).toBe('denied')
      expect(
        (await outcome(() => saveQuestion(org.slug, blank, form({ termId, type: 'SHORT_TEXT', label: 'x', help: '', options: '' })))).kind
      ).toBe('denied')
    })

    it('can go to only the people the exco choose', async () => {
      as(treasurer)
      const none = await saveAudience(org.slug, blank, form({ termId, audience: 'CHOSEN' }))
      expect(none.error).toMatch(/at least one/)
      await ok(() => saveAudience(org.slug, blank, form({ termId, audience: 'CHOSEN', memberId: [rows.ada] })))
      expect(await getForm(treasurer.id, org.id, termId)).toMatchObject({ audience: 'CHOSEN', recipientIds: [rows.ada] })
    })

    it('opens once the QR is up', async () => {
      as(treasurer)
      await ok(() => uploadPaynowQr(org.slug, blank, form({ termId, qr: pngFile(400, 400) })))
      await ok(() => setFormState(org.slug, termId, 'OPEN'))
      expect((await getForm(treasurer.id, org.id, termId)).state).toBe('OPEN')
    })
  })

  describe('a form for chosen people', () => {
    it('turns away anybody not chosen, in the action and the database', async () => {
      as(newbie)
      const refused = await submitMembershipForm(org.slug, blank, form({
        termId, fullName: 'Nina New', studentId: '1005555', birthDay: '12', birthMonth: '3', [`q_${questionId}`]: '@nina',
      }))
      expect(refused.error).toMatch(/aren’t one of them/)
      const { dbAs } = await import('@/core/db')
      await expect(
        dbAs(newbie.id, (tx) =>
          tx.membershipResponse.create({ data: { orgId: org.id, termId, userId: newbie.id, email: newbie.email, fullName: 'Nina New' } })
        )
      ).rejects.toThrow(/not for you/)
    })

    it('goes back to everyone', async () => {
      as(treasurer)
      await ok(() => saveAudience(org.slug, blank, form({ termId, audience: 'EVERYONE', memberId: [rows.ada] })))
      expect(await getForm(treasurer.id, org.id, termId)).toMatchObject({ audience: 'EVERYONE', recipientIds: [] })
    })
  })

  describe('somebody on the roster filling it in', () => {
    it('says what needs fixing, all at once', async () => {
      as(ada)
      const result = await submitMembershipForm(org.slug, blank, form({ termId }))
      expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual([questionId, 'fullName', 'proof', 'reference', 'studentId'].sort())
      expect(await responseOf(ada)).toBeNull()
    })

    it('sends answers and a payment for the fee the club set, whatever they post', async () => {
      as(ada)
      await ok(() =>
        submitMembershipForm(org.slug, blank, form({
          termId, fullName: 'Ada Lee', studentId: '1000001', tier: 'HALF', [`q_${questionId}`]: '@ada', reference: 'PN-ADA-1', proof: pngFile(300, 600),
        }))
      )
      const response = await responseOf(ada)
      expect(response?.memberId).toBe(rows.ada)
      expect(response?.answers).toEqual([{ questionId, label: 'Telegram handle', type: 'SHORT_TEXT', value: '@ada' }])

      const row = await collectionRow('Ada Lee')
      // They posted "HALF". Nobody picks their own fee.
      expect(row).toMatchObject({ status: 'DECLARED', amountCents: 7000, tier: 'FULL' })
    })

    it('lets them change their answers without paying again', async () => {
      as(ada)
      await ok(() => submitMembershipForm(org.slug, blank, form({ termId, fullName: 'Ada Lee', studentId: '1000001', tier: 'FULL', [`q_${questionId}`]: '@ada_lee' })))
      expect((await collectionRow('Ada Lee'))).toMatchObject({ status: 'DECLARED', amountCents: 7000 })
      expect(await dbAdmin.feePayment.count({ where: { termId } })).toBe(1)
    })
  })

  it('keeps an answer to a question the exco later removed', async () => {
    as(treasurer)
    await ok(() => saveQuestion(org.slug, blank, form({ termId, type: 'SHORT_TEXT', label: 'Shirt size', help: '', options: '' })))
    const shirt = await dbAdmin.membershipQuestion.findFirstOrThrow({ where: { label: 'Shirt size' } })
    as(ada)
    await ok(() => submitMembershipForm(org.slug, blank, form({ termId, fullName: 'Ada Lee', studentId: '1000001', tier: 'FULL', [`q_${questionId}`]: '@ada_lee', [`q_${shirt.id}`]: 'M' })))
    as(treasurer)
    await ok(() => deleteQuestion(org.slug, shirt.id))
    as(ada)
    await ok(() => submitMembershipForm(org.slug, blank, form({ termId, fullName: 'Ada Lee', studentId: '1000001', tier: 'FULL', [`q_${questionId}`]: '@ada' })))
    const answers = (await responseOf(ada))?.answers as { label: string; value: string }[]
    expect(answers.map((a) => [a.label, a.value])).toEqual([['Telegram handle', '@ada'], ['Shirt size', 'M']])
  })

  it('lists a response whose sender the exco cannot see', async () => {
    // Row-level security shows the exco only accounts that share the club.
    const outsider = await createUser('Oz Outside')
    const response = await dbAdmin.membershipResponse.create({
      data: { orgId: org.id, termId, userId: outsider.id, email: outsider.email, fullName: 'Oz Outside' },
    })
    const listed = (await listResponses(treasurer.id, org.id, termId)).find((r) => r.id === response.id)
    expect(listed?.joiningAs).toBeNull()
    await dbAdmin.membershipResponse.delete({ where: { id: response.id } })
  })

  describe('somebody not on the roster yet', () => {
    it('gives their required name and student ID, and pays', async () => {
      as(newbie)
      const bad = await submitMembershipForm(org.slug, blank, form({
        termId, fullName: 'N', studentId: '12', tier: 'FULL', [`q_${questionId}`]: '@nina',
      }))
      expect(Object.keys(bad.fieldErrors ?? {}).sort()).toEqual(['fullName', 'proof', 'reference', 'studentId'])

      await ok(() =>
        submitMembershipForm(org.slug, blank, form({
          termId, fullName: 'Nina  New', studentId: '100 5555',
          tier: 'FULL', [`q_${questionId}`]: '@nina', reference: 'PN-NINA', proof: pngFile(300, 600),
        }))
      )
      const response = await responseOf(newbie)
      expect(response).toMatchObject({
        memberId: null, fullName: 'Nina New', studentId: '1005555', birthDay: null, birthMonth: null, birthYear: null,
        heldReference: 'PN-NINA', heldAmountCents: 7000,
      })
      expect(response?.heldProofPath).toBeTruthy()
      expect(await dbAdmin.feePayment.count({ where: { termId } })).toBe(1)
    })

    it('cannot put their own response against a roster row, or mark it matched', async () => {
      const { dbAs } = await import('@/core/db')
      const response = await responseOf(newbie)
      await expect(
        dbAs(newbie.id, (tx) => tx.membershipResponse.update({ where: { id: response!.id }, data: { memberId: rows.remy } }))
      ).rejects.toThrow(/only from the account linked/)
      await expect(
        dbAs(newbie.id, (tx) => tx.membershipResponse.update({ where: { id: response!.id }, data: { matchedById: newbie.id, matchedAt: new Date() } }))
      ).rejects.toThrow(/Only the exco match/)
      // Nor read anybody else's.
      expect(await dbAs(newbie.id, (tx) => tx.membershipResponse.count())).toBe(1)
    })

    it('holds up banking in until their payment is matched', async () => {
      as(president)
      const adaPayment = (await collectionRow('Ada Lee'))!.id!
      await ok(() => confirmPayment(org.slug, blank, form({ paymentId: adaPayment })))
      as(treasurer)
      const refused = await closeCollection(org.slug, termId)
      expect(refused.error).toMatch(/still holds a payment that isn't on the roster/)
    })

    it('is added to the roster by the exco, and their payment goes to be checked', async () => {
      as(treasurer)
      const [pending] = (await listResponses(treasurer.id, org.id, termId)).filter((r) => r.email === newbie.email)
      expect(pending.candidates).toEqual([])

      const result = await ok(() => matchResponse(org.slug, blank, form({ responseId: pending.id, target: 'NEW' })))
      expect(result.message).toMatch(/waiting to be checked/)

      const member = await dbAdmin.member.findFirstOrThrow({ where: { orgId: org.id, studentId: '1005555' } })
      expect(member).toMatchObject({ fullName: 'Nina New', userId: newbie.id, email: newbie.email, birthDay: null, birthMonth: null })
      expect(await collectionRow('Nina New')).toMatchObject({ status: 'DECLARED', amountCents: 7000, declaredByUserId: newbie.id })
      expect(await responseOf(newbie)).toMatchObject({ memberId: member.id, matchedById: treasurer.id, heldProofPath: null })
    })

    it('a returning member who signed in another way is matched to their existing row', async () => {
      as(returning)
      await ok(() =>
        submitMembershipForm(org.slug, blank, form({
          termId, fullName: 'Remy Back', studentId: '1000002',
          tier: 'FULL', [`q_${questionId}`]: '@remy', reference: 'PN-REMY', proof: pngFile(300, 600),
        }))
      )
      as(treasurer)
      const [pending] = (await listResponses(treasurer.id, org.id, termId)).filter((r) => r.email === returning.email)
      expect(pending.candidates[0]).toMatchObject({ id: rows.remy, reasons: ['same student ID', 'same name'] })

      const refused = await matchResponse(org.slug, blank, form({ responseId: pending.id, target: 'NEW' }))
      expect(refused.error).toMatch(/already on the roster with student ID 1000002/)

      await ok(() => matchResponse(org.slug, blank, form({ responseId: pending.id, target: rows.remy })))
      expect((await dbAdmin.member.findUniqueOrThrow({ where: { id: rows.remy } })).userId).toBe(returning.id)
      expect(await collectionRow('Remy Back')).toMatchObject({ status: 'DECLARED', declaredByUserId: returning.id })
    })

    it('someone linked after sending it keeps the payment they held, without paying twice', async () => {
      const later = await createUser('Lin Later', '1006666@mymail.sutd.edu.sg')
      await join(later, org, 'MEMBER')
      const row = await addRosterMember(org, { fullName: 'Lin Later', studentId: '1006666' })
      as(later)
      await ok(() =>
        submitMembershipForm(org.slug, blank, form({
          termId, fullName: 'Lin Later', studentId: '1006666',
          tier: 'FULL', [`q_${questionId}`]: '@lin', reference: 'PN-LIN', proof: pngFile(300, 600),
        }))
      )
      expect((await responseOf(later))?.studentId).toBe('1006666')
      // Linked by signing in with the student-ID address, not by the exco.
      await dbAdmin.member.update({ where: { id: row.id }, data: { userId: later.id } })

      await ok(() => submitMembershipForm(org.slug, blank, form({ termId, fullName: 'Lin Later', studentId: '1006666', tier: 'FULL', [`q_${questionId}`]: '@lin_l' })))
      expect(await collectionRow('Lin Later')).toMatchObject({ status: 'DECLARED', amountCents: 7000, paymentReference: 'PN-LIN' })
      expect(await responseOf(later)).toMatchObject({ memberId: row.id, heldProofPath: null })

      as(president)
      const lin = (await collectionRow('Lin Later'))!.id!
      await ok(() => confirmPayment(org.slug, blank, form({ paymentId: lin })))
    })

    it('does not let a member match a response', async () => {
      as(ada)
      const response = await responseOf(returning)
      expect((await outcome(() => matchResponse(org.slug, blank, form({ responseId: response!.id, target: rows.ada })))).kind).toBe('denied')
    })
  })

  describe('the exco filling it in themselves', () => {
    it('pay like anybody else, and somebody else checks it', async () => {
      as(treasurer)
      await ok(() =>
        submitMembershipForm(org.slug, blank, form({
          termId, fullName: 'Tess Treasurer', studentId: '1000009', tier: 'FULL', [`q_${questionId}`]: '@tess', reference: 'PN-TESS', proof: pngFile(300, 600),
        }))
      )
      const tess = await collectionRow('Tess Treasurer')
      expect(tess?.status).toBe('DECLARED')
      const own = await confirmPayment(org.slug, blank, form({ paymentId: tess!.id! }))
      expect(own.error).toBeTruthy()

      as(president)
      await ok(() => confirmPayment(org.slug, blank, form({ paymentId: tess!.id! })))
      expect((await collectionRow('Tess Treasurer'))?.status).toBe('CONFIRMED')
    })
  })

  describe('closing it', () => {
    it('stops new responses, and the database refuses them too', async () => {
      as(treasurer)
      await ok(() => setFormState(org.slug, termId, 'CLOSED'))
      const late = await createUser('Lou Late')
      await join(late, org, 'MEMBER')
      as(late)
      const refused = await submitMembershipForm(org.slug, blank, form({
          termId, fullName: 'Lou Late', studentId: '1007777', tier: 'FULL', [`q_${questionId}`]: 'x',
      }))
      expect(refused.error).toMatch(/not taking responses/)

      const { dbAs } = await import('@/core/db')
      await expect(
        dbAs(late.id, (tx) =>
          tx.membershipResponse.create({ data: { orgId: org.id, termId, userId: late.id, email: late.email, fullName: 'Lou Late' } })
        )
      ).rejects.toThrow(/not taking responses/)
    })

    it('reopens, and a removed response takes its held payment with it', async () => {
      as(treasurer)
      await ok(() => setFormState(org.slug, termId, 'OPEN'))
      const extra = await createUser('Xan Extra')
      await join(extra, org, 'MEMBER')
      as(extra)
      await ok(() =>
        submitMembershipForm(org.slug, blank, form({
          termId, fullName: 'Xan Extra', studentId: '1008888', tier: 'HALF',
          [`q_${questionId}`]: '@xan', reference: 'PN-XAN', proof: pngFile(300, 600),
        }))
      )
      as(treasurer)
      const response = await responseOf(extra)
      expect((await removeResponse(org.slug, response!.id)).error).toMatch(/holds a payment/)
      expect(await responseOf(extra)).not.toBeNull()
      await ok(() => removeResponse(org.slug, response!.id, 'Refunded on 20 Sep'))
      expect(await responseOf(extra)).toBeNull()
    })

    it('does not bank in over a payment that could not move to the roster', async () => {
      as(president)
      const nina = (await collectionRow('Nina New'))!.id!
      await ok(() => confirmPayment(org.slug, blank, form({ paymentId: nina })))
      const remy = (await collectionRow('Remy Back'))!.id!
      await ok(() => confirmPayment(org.slug, blank, form({ paymentId: remy })))
      const twice = await createUser('Tom Twice')
      await join(twice, org, 'MEMBER')
      const row = await addRosterMember(org, { fullName: 'Tom Twice', studentId: '1003333' })
      as(treasurer)
      await ok(() => recordPayment(org.slug, blank, form({ termId, memberId: row.id, reference: 'DBS TOM', route: 'OFFICIAL', reason: '' })))
      as(twice)
      await ok(() =>
        submitMembershipForm(org.slug, blank, form({
          termId, fullName: 'Tom Twice', studentId: '1003333',
          tier: 'FULL', [`q_${questionId}`]: '@tom', reference: 'PN-TOM', proof: pngFile(300, 600),
        }))
      )
      as(president)
      const response = await responseOf(twice)
      const matched = await ok(() => matchResponse(org.slug, blank, form({ responseId: response!.id, target: row.id })))
      expect(matched.message).toMatch(/already paid/)

      as(treasurer)
      expect((await closeCollection(org.slug, termId)).error).toMatch(/still holds a payment/)
      expect((await clearHeldPayment(org.slug, blank, form({ responseId: response!.id, reason: '' }))).error).toMatch(/what happened/)
      await ok(() => clearHeldPayment(org.slug, blank, form({ responseId: response!.id, reason: 'Refunded, paid twice' })))
      expect((await responseOf(twice))?.heldProofPath).toBeNull()
    })

    it('closes for good when the collection is banked in', async () => {
      as(treasurer)
      await ok(() => closeCollection(org.slug, termId))
      expect((await getForm(treasurer.id, org.id, termId)).state).toBe('CLOSED')
      const reopen = await setFormState(org.slug, termId, 'OPEN')
      expect(reopen.error).toMatch(/collection has closed/)
      const record = await recordPayment(org.slug, blank, form({ termId, memberId: rows.ada, reference: '', route: 'OFFICIAL', reason: '' }))
      expect(record.error).toBeTruthy()
    })
  })
})
