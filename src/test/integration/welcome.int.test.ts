/**
 * The welcome screen, for anybody signed in whom the club hasn't matched to
 * its roster yet. They say who they are and go on to join and pay; until an
 * exco member links them, that is all they can reach. What they type never
 * links them to a roster row or grants them a role — least of all an exco
 * member's student ID.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { saveWelcome } from '@/actions/welcome'
import { requestAccess } from '@/actions/access'
import { getStanding, requireFullMember } from '@/core/auth/standing'
import { createTerm, updateTerm, uploadPaynowQr } from '@/modules/fees/collection-actions'
import { matchResponse, setFormState, submitMembershipForm } from '@/modules/membership-form/actions'
import { listResponses } from '@/modules/membership-form/queries'
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

const GRADUATING = new Date().getFullYear() + 3

const blank = { error: null }
const today = new Date()
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plusDays = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)

let org: TestOrg
let treasurer: TestUser
let president: TestUser
let ada: TestUser
let stranger: TestUser
let fresh: TestUser
let termId: string

const welcome = (fields: Record<string, string>) =>
  form({ joiningAs: 'NEW', fullName: 'Someone', studentId: '1004444', birthDay: '14', birthMonth: '2', birthYear: '', graduationYear: String(GRADUATING), ...fields })

describe('the welcome screen', () => {
  beforeAll(async () => {
    await resetDatabase()
    await ensureBucket()
    org = await createOrganisation()
    treasurer = await createUser('Tess Treasurer')
    president = await createUser('Pat President')
    ada = await createUser('Ada Lee')
    stranger = await createUser('Sly Stranger', 'sly.stranger@gmail.com')
    fresh = await createUser('Fern Fresh', 'fern.fresh@gmail.com')
    await join(treasurer, org, 'EXCO', 'TREASURER')
    await join(president, org, 'EXCO', 'PRESIDENT')
    for (const user of [ada, stranger, fresh]) await join(user, org, 'MEMBER')

    await addRosterMember(org, { fullName: 'Ada Lee', studentId: '1000001', userId: ada.id })
    await addRosterMember(org, { fullName: 'Tess Treasurer', studentId: '1000009', userId: treasurer.id })
  })

  describe('where people stand', () => {
    it('lets exco and linked members straight through', async () => {
      as(treasurer)
      expect(await getStanding(org.slug)).toBe('FULL')
      // Exco without a roster row of their own are still exco.
      as(president)
      expect(await getStanding(org.slug)).toBe('FULL')
      as(ada)
      expect(await getStanding(org.slug)).toBe('FULL')
      expect((await outcome(() => requireFullMember(org.slug))).kind).toBe('returned')
    })

    it('sends somebody not on the roster to the welcome screen first', async () => {
      as(fresh)
      expect(await getStanding(org.slug)).toBe('WELCOME')
      const sent = await outcome(() => requireFullMember(org.slug))
      expect(sent).toEqual({ kind: 'redirect', to: `/${org.slug}/welcome` })
    })
  })

  describe('saying who you are', () => {
    it('refuses a student ID that is not one, and a date that does not exist', async () => {
      as(fresh)
      const bad = await saveWelcome(org.slug, blank, welcome({ studentId: '12', birthDay: '31', birthMonth: '2' }))
      expect(bad.fieldErrors?.studentId).toBeTruthy()
      expect(bad.fieldErrors?.birthday).toMatch(/not in that month/)
      const unsure = await saveWelcome(org.slug, blank, welcome({ joiningAs: 'MAYBE' }))
      expect(unsure.fieldErrors?.joiningAs).toBeTruthy()
      // Somebody new says when they graduate, and it has to be a year ahead of them.
      const undecided = await saveWelcome(org.slug, blank, welcome({ graduationYear: '' }))
      expect(undecided.fieldErrors?.graduationYear).toBeTruthy()
      const longGone = await saveWelcome(org.slug, blank, welcome({ graduationYear: '1999' }))
      expect(longGone.fieldErrors?.graduationYear).toBeTruthy()
      expect(await getStanding(org.slug)).toBe('WELCOME')
    })

    it('records it as a claim, and sends them on to join and pay', async () => {
      as(fresh)
      await ok(() => saveWelcome(org.slug, blank, welcome({ fullName: 'Fern  Fresh', studentId: '1004444', birthYear: '2004' })))
      const user = await dbAdmin.user.findUniqueOrThrow({ where: { id: fresh.id } })
      expect(user).toMatchObject({
        name: 'Fern Fresh',
        joiningAs: 'NEW',
        claimedStudentId: '1004444',
        birthDay: 14,
        birthMonth: 2,
        birthYear: 2004,
        graduationYear: GRADUATING,
      })
      expect(user.onboardedAt).not.toBeNull()
      expect(await getStanding(org.slug)).toBe('JOINING')
      expect(await outcome(() => requireFullMember(org.slug))).toEqual({ kind: 'redirect', to: `/${org.slug}/fees` })
      expect(await dbAdmin.member.findFirst({ where: { userId: fresh.id } })).toBeNull()
    })

    it('never makes anybody exco for typing an exco member’s student ID', async () => {
      as(stranger)
      await ok(() => saveWelcome(org.slug, blank, welcome({ joiningAs: 'RETURNING', fullName: 'Tess Treasurer', studentId: '1000009' })))
      expect(await getStanding(org.slug)).toBe('JOINING')
      // Not asked of somebody returning, so nothing is kept even if it's sent.
      expect((await dbAdmin.user.findUniqueOrThrow({ where: { id: stranger.id } })).graduationYear).toBeNull()
      const membership = await dbAdmin.organisationMembership.findFirstOrThrow({ where: { userId: stranger.id } })
      expect(membership.role).toBe('MEMBER')
      // The treasurer's roster row is still theirs.
      const row = await dbAdmin.member.findFirstOrThrow({ where: { orgId: org.id, studentId: '1000009' } })
      expect(row.userId).toBe(treasurer.id)
    })

    it('does not let somebody the club has not matched ask for exco access', async () => {
      as(stranger)
      const refused = await requestAccess(org.slug, blank, form({ requestedOffice: 'TREASURER', reason: 'I am the treasurer, honestly.' }))
      expect(refused.error).toMatch(/isn’t linked to the club roster/)
      expect(await dbAdmin.accessRequest.count({ where: { userId: stranger.id } })).toBe(0)
    })

    it('has nothing to ask somebody already on the roster', async () => {
      as(ada)
      const refused = await saveWelcome(org.slug, blank, welcome({ studentId: '1000001' }))
      expect(refused.error).toMatch(/already on the club roster/)
    })
  })

  describe('the birthday, on to the roster', () => {
    beforeAll(async () => {
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
      await ok(() => uploadPaynowQr(org.slug, blank, form({ termId, qr: pngFile(400, 400) })))
      await ok(() => setFormState(org.slug, termId, 'OPEN'))
    })

    it('carries it from the welcome screen to a new member’s roster row', async () => {
      as(fresh)
      await ok(() =>
        submitMembershipForm(org.slug, blank, form({
          termId, fullName: 'Fern Fresh', studentId: '1004444', reference: 'PN-FERN', proof: pngFile(300, 600),
        }))
      )
      const response = await dbAdmin.membershipResponse.findFirstOrThrow({ where: { termId, userId: fresh.id } })
      expect(response).toMatchObject({ birthDay: 14, birthMonth: 2, birthYear: 2004, graduationYear: GRADUATING })

      as(treasurer)
      const listed = (await listResponses(treasurer.id, org.id, termId)).find((row) => row.userId === fresh.id)
      expect(listed?.joiningAs).toBe('NEW')
      expect(listed?.graduationYear).toBe(GRADUATING)

      await ok(() => matchResponse(org.slug, blank, form({ responseId: response.id, target: 'NEW' })))
      const row = await dbAdmin.member.findFirstOrThrow({ where: { userId: fresh.id } })
      expect(row).toMatchObject({ fullName: 'Fern Fresh', studentId: '1004444', birthDay: 14, birthMonth: 2, birthYear: 2004, graduationYear: GRADUATING })

      as(fresh)
      expect(await getStanding(org.slug)).toBe('FULL')
    })
  })
})
