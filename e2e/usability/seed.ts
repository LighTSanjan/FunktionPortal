/**
 * A club with a month's classes and an open term, before any browser opens.
 *
 * Nobody has an account yet: the treasurer and the member make theirs by
 * signing in with a code, as they would.
 */
import '../../src/test/integration/env'
import { dbAdmin } from '../../src/core/db/admin'
import {
  addRosterMember,
  createOrganisation,
  ensureBucket,
  resetDatabase,
} from '../../src/test/integration/harness'

export const TREASURER = { name: 'Tess Treasurer', email: 'treasurer@mymail.sutd.edu.sg' }
export const MEMBER = { name: 'Ada Lee', email: 'ada.personal@gmail.test', studentId: '1000001' }
/** Somebody new to the club, signing in with an address that carries no student ID. */
export const NEWCOMER = { name: 'Nia New', email: 'nia_new@alumni.sutd.edu.sg', studentId: '1000099' }
/** Somebody nobody invited, with no university address. */
export const STRANGER = { email: 'stranger@gmail.test' }

export default async function seed() {
  await resetDatabase()
  await ensureBucket()
  // Sign-ups create auth.users rows too; clear them so the same addresses work again.
  await dbAdmin.$executeRawUnsafe(`DELETE FROM auth.users WHERE email LIKE '%test%' OR email LIKE '%@mymail.sutd.edu.sg'`)

  const org = await createOrganisation('test-club', 'Test Club')

  const coach = await dbAdmin.instructor.create({
    data: {
      orgId: org.id,
      fullName: 'Kai Smith',
      shortCode: 'KS',
      danceStyle: 'Popping',
      email: 'kai@coach.test',
      addressLine1: '1 Dance Street',
      postalCode: '000002',
      bankName: 'DBS',
      bankAccountNo: '000-00000-0',
    },
  })

  await dbAdmin.instructorRate.create({
    data: { orgId: org.id, instructorId: coach.id, hourlyRateCents: 9000, effectiveFrom: new Date('2020-01-01T00:00:00Z') },
  })

  // A second fully configured coach makes the demo useful for checking the
  // two-coach roster and for assigning a new class without first doing setup.
  // They deliberately have no class last month, so the existing guided
  // payment journey remains focused on Kai while still showing both coaches.
  const secondCoach = await dbAdmin.instructor.create({
    data: {
      orgId: org.id,
      fullName: 'Mina Tan',
      shortCode: 'MT',
      danceStyle: 'Locking',
      email: 'mina@coach.test',
      addressLine1: '2 Rhythm Road',
      postalCode: '000003',
      bankName: 'OCBC',
      bankAccountNo: '111-11111-1',
    },
  })

  await dbAdmin.instructorRate.create({
    data: { orgId: org.id, instructorId: secondCoach.id, hourlyRateCents: 9000, effectiveFrom: new Date('2020-01-01T00:00:00Z') },
  })

  const ada = await addRosterMember(org, { fullName: 'Ada Lee', studentId: MEMBER.studentId, email: 'ada@uni.test' })
  const ben = await addRosterMember(org, { fullName: 'Ben Ong', studentId: '1000002' })

  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() - 1
  for (const [day, coached] of [[3, true], [10, true], [17, true], [24, false]] as const) {
    const session = await dbAdmin.classSession.create({
      data: {
        orgId: org.id,
        instructorId: coached ? coach.id : null,
        heldOn: new Date(Date.UTC(y, m, day)),
        durationMinutes: 90,
      },
    })
    await dbAdmin.sessionAttendance.createMany({
      data: [ada, ben].map((member) => ({ orgId: org.id, sessionId: session.id, memberId: member.id, present: true })),
    })
  }

  const day = 86_400_000
  await dbAdmin.term.create({
    data: {
      orgId: org.id,
      name: 'Trimester 1',
      startDate: new Date(Date.UTC(y, now.getMonth() - 1, 1)),
      endDate: new Date(Date.UTC(y, now.getMonth() + 2, 28)),
      fullFeeCents: 7000,
      halfFeeCents: 3500,
      collectionOpensAt: new Date(now.getTime() - 7 * day),
      finalCollectionAt: new Date(now.getTime() + 14 * day),
    },
  })

  await dbAdmin.$disconnect()
}
