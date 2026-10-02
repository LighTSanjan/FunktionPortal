/**
 * The welcome screen, for anybody signed in whom the club hasn't matched to
 * its roster yet. Somebody coming back types their student ID, has the rest
 * filled in from the roster, and is linked to their row. Anybody else says
 * who they are and goes on to join and pay until an exco member matches
 * them. Nothing typed here grants a role, or moves a row that is already
 * somebody's — least of all an exco member's.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { lookUpStudentId, saveWelcome } from '@/actions/welcome'
import { removePhoto, updateProfile, uploadPhoto } from '@/actions/profile'
import { GET as photo } from '@/app/api/photo/route'
import { unlinkMemberAccount } from '@/modules/fees/member-actions'
import { requestAccess } from '@/actions/access'
import { getStanding, requireFullMember } from '@/core/auth/standing'
import { createTerm, updateTerm, uploadPaynowQr } from '@/modules/fees/collection-actions'
import { setFormState } from '@/modules/membership-form/form-actions'
import { matchResponse } from '@/modules/membership-form/response-actions'
import { submitMembershipForm } from '@/modules/membership-form/submit-actions'
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
let returning: TestUser
let nosy: TestUser
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
    returning = await createUser('Rae Returning', 'rae.personal@gmail.com')
    nosy = await createUser('Nosy Parker', 'nosy.parker@gmail.com')
    await join(treasurer, org, 'EXCO', 'TREASURER')
    await join(president, org, 'EXCO', 'PRESIDENT')
    for (const user of [ada, stranger, fresh, returning, nosy]) await join(user, org, 'MEMBER')

    await addRosterMember(org, { fullName: 'Ada Lee', studentId: '1000001', userId: ada.id })
    await addRosterMember(org, { fullName: 'Tess Treasurer', studentId: '1000009', userId: treasurer.id })
    const rae = await addRosterMember(org, { fullName: 'Rae Tan Wei Ling', studentId: '1000021' })
    await dbAdmin.member.update({ where: { id: rae.id }, data: { birthDay: 3, birthMonth: 11, birthYear: 2003 } })
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
      expect(await lookUpStudentId(org.slug, '1000009')).toEqual({ status: 'taken' })
      const refused = await saveWelcome(org.slug, blank, welcome({ joiningAs: 'RETURNING', fullName: 'Tess Treasurer', studentId: '1000009' }))
      expect(refused.fieldErrors?.studentId).toMatch(/already linked to another login/)
      expect(await getStanding(org.slug)).toBe('WELCOME')

      // Coming back under an ID the roster doesn't have is a claim, as before.
      await ok(() => saveWelcome(org.slug, blank, welcome({ joiningAs: 'RETURNING', fullName: 'Sly Stranger', studentId: '1009999' })))
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

    it('fills in somebody coming back from the roster, and links them', async () => {
      as(returning)
      expect(await lookUpStudentId(org.slug, '100 0021')).toEqual({
        status: 'found',
        fullName: 'Rae Tan Wei Ling',
        birthDay: '3',
        birthMonth: '11',
        birthYear: '2003',
      })
      const saved = await saveWelcome(org.slug, blank, welcome({
        joiningAs: 'RETURNING', fullName: 'Rae Tan Wei Ling', studentId: '1000021', birthDay: '3', birthMonth: '11', birthYear: '2003',
      }))
      expect(saved).toMatchObject({ ok: true, linked: true })
      expect(await getStanding(org.slug)).toBe('FULL')
      const row = await dbAdmin.member.findFirstOrThrow({ where: { orgId: org.id, studentId: '1000021' } })
      expect(row.userId).toBe(returning.id)
      expect(await dbAdmin.auditLog.count({ where: { action: 'member.link_account_self', targetId: row.id } })).toBe(1)
      // The role is untouched: linking is who you are, not what you may do.
      const membership = await dbAdmin.organisationMembership.findFirstOrThrow({ where: { userId: returning.id } })
      expect(membership.role).toBe('MEMBER')
      // Once on the roster there is nothing more to look up.
      expect(await lookUpStudentId(org.slug, '1000001')).toEqual({ status: 'unknown' })
    })

    it('stops somebody walking through student IDs after a few', async () => {
      as(nosy)
      const answers = []
      for (let id = 1000100; id < 1000110; id++) answers.push((await lookUpStudentId(org.slug, String(id))).status)
      expect(answers.slice(0, 8).every((status) => status === 'unknown')).toBe(true)
      expect(answers.slice(8)).toEqual(['slow-down', 'slow-down'])
    })

    it('lets the exco take a wrong link off again', async () => {
      const row = await dbAdmin.member.findFirstOrThrow({ where: { orgId: org.id, studentId: '1000021' } })
      as(returning)
      expect((await outcome(() => unlinkMemberAccount(org.slug, row.id))).kind).toBe('denied')
      as(treasurer)
      await ok(() => unlinkMemberAccount(org.slug, row.id))
      expect((await dbAdmin.member.findUniqueOrThrow({ where: { id: row.id } })).userId).toBeNull()
      as(returning)
      expect(await getStanding(org.slug)).toBe('JOINING')

      // And back on, from Settings: somebody coming back who fixes their ID there is linked.
      await ok(() => updateProfile(org.slug, blank, form({ name: 'Rae Tan', studentId: '1000021', birthDay: '', birthMonth: '', birthYear: '' })))
      expect(await getStanding(org.slug)).toBe('FULL')
    })

    it('keeps a member’s own name and birthday on their roster row', async () => {
      as(returning)
      await ok(() => updateProfile(org.slug, blank, form({ name: 'Rae Tan', studentId: '1234567', birthDay: '4', birthMonth: '11', birthYear: '' })))
      const row = await dbAdmin.member.findFirstOrThrow({ where: { orgId: org.id, userId: returning.id } })
      // The student ID is the roster's once they're on it; what was sent is ignored.
      expect(row).toMatchObject({ fullName: 'Rae Tan', studentId: '1000021', birthDay: 4, birthMonth: 11, birthYear: null })
      expect(row.overriddenFields).toEqual(expect.arrayContaining(['fullName', 'birthDay']))
      const bad = await updateProfile(org.slug, blank, form({ name: 'R', birthDay: '31', birthMonth: '2' }))
      expect(bad.fieldErrors).toMatchObject({ name: expect.any(String), birthday: expect.any(String) })
    })

    it('keeps a photo of their own, and shows it only to them', async () => {
      as(returning)
      const refused = await uploadPhoto(org.slug, blank, form({ photo: new File([new Uint8Array([1, 2, 3])], 'x.heic') }))
      expect(refused.error).toMatch(/JPEG or PNG/)
      await ok(() => uploadPhoto(org.slug, blank, form({ photo: pngFile(320, 320) })))
      const { photoPath } = await dbAdmin.user.findUniqueOrThrow({ where: { id: returning.id } })
      expect(photoPath).toMatch(new RegExp(`^photos/${returning.id}/`))
      const mine = await photo()
      expect(mine.status).toBe(200)
      expect(mine.headers.get('content-type')).toBe('image/png')

      as(ada)
      expect((await photo()).status).toBe(404)

      as(returning)
      await ok(() => removePhoto(org.slug))
      expect((await dbAdmin.user.findUniqueOrThrow({ where: { id: returning.id } })).photoPath).toBeNull()
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
