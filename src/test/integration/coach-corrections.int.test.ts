/**
 * Getting a coach's month right after it has gone wrong.
 *
 * A month raised with a mistake is voided and raised again under a new
 * number. A re-imported sheet that corrects who taught a class moves the
 * class rather than adding a second one. A member who left, and a coach who
 * stopped, are still part of the months they were in. And the workflow tells
 * the truth about a month half sent, and about a claim from long ago that OSL
 * never paid.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { addInstructorRate, saveInstructor, saveSession, setAttendance } from '@/modules/coach-claim/actions'
import { getSession, listInstructorOptions } from '@/modules/coach-claim/queries'
import { GET as downloadDocument } from '@/app/(dashboard)/[orgSlug]/monthly-run/[invoiceId]/download/[document]/route'
import {
  generateMonthlyDocuments,
  markPaid,
  markSubmitted,
  signMonth,
  voidMonth,
} from '@/modules/coach-claim/run-actions'
import { getMonthlyRun } from '@/modules/coach-claim/monthly-run'
import { coachPaymentsWorkflow } from '@/modules/workflow/coach-payments'
import { applyParsedSheet } from '@/modules/attendance/apply'
import type { ParsedSheet } from '@/modules/attendance/parse'
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
  resetDatabase,
  type TestOrg,
  type TestUser,
} from './harness'

const now = new Date()
const monthKey = (offset: number) => {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1, period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
}
const last = monthKey(-1)
const longAgo = monthKey(-20)
const on = (period: string, d: number) => `${period}-${String(d).padStart(2, '0')}`

let org: TestOrg
let treasurer: TestUser
let president: TestUser
const coach: Record<string, string> = {}
const member: Record<string, string> = {}

async function addCoach(fullName: string, style: string, account: string) {
  await ok(() =>
    saveInstructor(org.slug, null, { error: null }, form({
      fullName,
      danceStyle: style,
      email: `${fullName.split(' ')[0].toLowerCase()}@coach.test`,
      addressLine1: '1 Dance Street',
      postalCode: '000002',
      bankName: 'DBS',
      bankAccountNo: account,
      engagement: 'CONTRACTED',
    }))
  )
  const id = (await dbAdmin.instructor.findFirstOrThrow({ where: { orgId: org.id, fullName } })).id
  await ok(() => addInstructorRate(org.slug, id, { error: null }, form({ hourlyRate: '90', effectiveFrom: `${now.getFullYear() - 3}-01-01` })))
  return id
}

async function classOn(instructorId: string, heldOn: string, present: string[]) {
  await ok(() => saveSession(org.slug, null, { error: null }, form({ instructorId, heldOn, durationMinutes: '90' })))
  const session = await dbAdmin.classSession.findFirstOrThrow({ where: { orgId: org.id, instructorId, heldOn: new Date(`${heldOn}T00:00:00Z`) } })
  await ok(() => setAttendance(org.slug, session.id, { error: null }, form({ present })))
  return session.id
}

async function raise(instructorId: string, period: string) {
  await ok(() => generateMonthlyDocuments(org.slug, { error: null }, form({ instructorId, period, fundSource: 'SEED' })))
  return dbAdmin.invoice.findFirstOrThrow({
    where: { orgId: org.id, instructorId, periodYear: Number(period.slice(0, 4)), periodMonth: Number(period.slice(5)), status: { not: 'VOID' } },
    include: { referenceNumber: true },
  })
}

describe('correcting a coach’s month', () => {
  beforeAll(async () => {
    await resetDatabase()
    await ensureBucket()
    org = await createOrganisation()
    treasurer = await createUser('Tess Treasurer')
    president = await createUser('Pat President')
    await join(treasurer, org, 'EXCO', 'TREASURER')
    await join(president, org, 'EXCO', 'PRESIDENT')
    member.ada = (await addRosterMember(org, { fullName: 'Ada Lee', studentId: '1000001' })).id
    member.ben = (await addRosterMember(org, { fullName: 'Ben Ong', studentId: '1000002' })).id

    as(treasurer)
    coach.kai = await addCoach('Kai Smith', 'Popping', '000-00000-1')
    coach.jin = await addCoach('Jin Neo', 'Locking', '000-00000-2')
    await classOn(coach.kai, on(last.period, 3), [member.ada, member.ben])
    await classOn(coach.kai, on(last.period, 10), [member.ada])
    await classOn(coach.jin, on(last.period, 5), [member.ada])
  })

  describe('people who have left since', () => {
    it('still raises a month somebody attended before leaving, with them on the sheet', async () => {
      await dbAdmin.member.update({ where: { id: member.ben }, data: { isActive: false, rosterLabel: 'Graduated' } })
      as(treasurer)
      const invoice = await raise(coach.kai, last.period)
      const sheet = await dbAdmin.attendanceSheet.findUniqueOrThrow({ where: { id: invoice.attendanceSheetId! } })
      expect(JSON.stringify(sheet.snapshot)).toContain('Ben Ong')
    })

    it('keeps a coach who has stopped on the board for the month they taught', async () => {
      await dbAdmin.instructor.update({ where: { id: coach.jin }, data: { isActive: false } })
      as(treasurer)
      const run = await getMonthlyRun(treasurer.id, org.id, last.year, last.month)
      const jin = run.entries.find((entry) => entry.instructorId === coach.jin)
      expect(jin?.status).toBe('READY')
      expect(jin?.isActive).toBe(false)
    })
  })

  describe('a month half sent', () => {
    it('is not "with OSL" while another coach is unraised, and keeps its deadline', async () => {
      as(treasurer)
      const kai = await dbAdmin.invoice.findFirstOrThrow({ where: { orgId: org.id, instructorId: coach.kai, status: { not: 'VOID' } } })
      await ok(() => signMonth(org.slug, kai.id))
      await ok(() => markSubmitted(org.slug, kai.id))

      const flow = await coachPaymentsWorkflow(treasurer.id, org.id, org.slug, now, { year: last.year, month: last.month })
      expect(flow.restingState ?? '').not.toMatch(/With OSL/)
      expect(flow.dueAt).not.toBeNull()
      expect(flow.next?.label).toBe('Raise the rest')
    })
  })

  describe('voiding a raised month', () => {
    let first: Awaited<ReturnType<typeof raise>>

    beforeAll(async () => {
      as(treasurer)
      first = await raise(coach.jin, last.period)
    })

    it('asks why', async () => {
      as(treasurer)
      const result = await voidMonth(org.slug, first.id, { error: null }, form({ reason: 'no' }))
      expect(result.error).toMatch(/why/)
      expect((await dbAdmin.invoice.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('GENERATED')
    })

    it('voids it, keeping the number and the reason', async () => {
      as(treasurer)
      await ok(() => voidMonth(org.slug, first.id, { error: null }, form({ reason: 'Jin taught the 5th for 60 minutes, not 90' })))
      const invoice = await dbAdmin.invoice.findUniqueOrThrow({ where: { id: first.id }, include: { referenceNumber: true, attendanceSheet: true } })
      expect(invoice.status).toBe('VOID')
      expect(invoice.voidedAt).not.toBeNull()
      expect(invoice.attendanceSheet?.voidedAt).not.toBeNull()
      expect(invoice.referenceNumber?.voidedAt).not.toBeNull()
      expect(invoice.referenceNumber?.voidReason).toMatch(/60 minutes/)
    })

    it('puts the coach back to ready, with the voided number listed', async () => {
      as(treasurer)
      const run = await getMonthlyRun(treasurer.id, org.id, last.year, last.month)
      const jin = run.entries.find((entry) => entry.instructorId === coach.jin)
      expect(jin?.status).toBe('READY')
      expect(jin?.voided.map((v) => v.referenceNumber)).toEqual([first.referenceNumber?.formatted])
    })

    it('lets the class under it be corrected', async () => {
      as(treasurer)
      const session = await dbAdmin.classSession.findFirstOrThrow({ where: { orgId: org.id, instructorId: coach.jin } })
      await ok(() =>
        saveSession(org.slug, session.id, { error: null }, form({ instructorId: coach.jin, heldOn: on(last.period, 5), durationMinutes: '60' }))
      )
    })

    it('raises it again under the next number, for the corrected amount', async () => {
      as(treasurer)
      const second = await raise(coach.jin, last.period)
      expect(second.id).not.toBe(first.id)
      expect(second.referenceNumber?.sequence).toBeGreaterThan(first.referenceNumber!.sequence)
      expect(second.totalCents).toBe(9_000)
    })

    it('holds one live document per coach-month in the database', async () => {
      const live = await dbAdmin.invoice.findFirstOrThrow({ where: { orgId: org.id, instructorId: coach.jin, status: { not: 'VOID' } } })
      await expect(
        dbAdmin.invoice.create({
          data: {
            orgId: org.id,
            instructorId: coach.jin,
            documentNo: 'DUPLICATE',
            periodYear: live.periodYear,
            periodMonth: live.periodMonth,
            invoiceDate: live.invoiceDate,
            fundSource: 'SEED',
            subtotalCents: 1,
            totalCents: 1,
          },
        })
      ).rejects.toThrow()
    })

    it('never brings a voided invoice back', async () => {
      const { dbAs } = await import('@/core/db')
      await expect(
        dbAs(treasurer.id, (tx) => tx.invoice.update({ where: { id: first.id }, data: { status: 'GENERATED', voidedAt: null } }))
      ).rejects.toThrow(/cannot be brought back/)
    })

    it('will not void a month recorded as paid', async () => {
      as(treasurer)
      const kai = await dbAdmin.invoice.findFirstOrThrow({ where: { orgId: org.id, instructorId: coach.kai, status: { not: 'VOID' } } })
      await ok(() => markPaid(org.slug, kai.id, true))
      const result = await voidMonth(org.slug, kai.id, { error: null }, form({ reason: 'Trying to void a paid one' }))
      expect(result.error).toMatch(/paid/)
    })

    it('voids a month already sent to OSL, and stops serving its documents', async () => {
      as(treasurer)
      const jin = await dbAdmin.invoice.findFirstOrThrow({ where: { orgId: org.id, instructorId: coach.jin, status: { not: 'VOID' } } })
      await ok(() => signMonth(org.slug, jin.id))
      await ok(() => markSubmitted(org.slug, jin.id))
      await ok(() => voidMonth(org.slug, jin.id, { error: null }, form({ reason: 'OSL sent it back: wrong fund' })))

      const response = await downloadDocument(new Request('http://test/'), {
        params: Promise.resolve({ orgSlug: org.slug, invoiceId: jin.id, document: 'month.docx' }),
      })
      expect(response.status).toBe(410)

      // And it cannot be marked paid afterwards.
      const paid = await markPaid(org.slug, jin.id, true)
      expect(paid.error).toBeTruthy()
    })

    it('is for the exco only', async () => {
      const mo = await createUser('Mo Member')
      await join(mo, org, 'MEMBER')
      as(mo)
      const kai = await dbAdmin.invoice.findFirstOrThrow({ where: { orgId: org.id, instructorId: coach.kai, status: { not: 'VOID' } } })
      const result = await outcome(() => voidMonth(org.slug, kai.id, { error: null }, form({ reason: 'A member trying it on' })))
      expect(result.kind).toBe('denied')
    })
  })

  describe('people and coaches who have gone', () => {
    it('lets a departed member’s wrong mark be cleared', async () => {
      as(treasurer)
      const period = monthKey(-3).period
      await ok(() => saveSession(org.slug, null, { error: null }, form({ instructorId: coach.kai, heldOn: on(period, 8), durationMinutes: '90' })))
      const session = await dbAdmin.classSession.findFirstOrThrow({ where: { orgId: org.id, heldOn: new Date(`${on(period, 8)}T00:00:00Z`) } })
      await dbAdmin.sessionAttendance.create({ data: { orgId: org.id, sessionId: session.id, memberId: member.ben, present: true } })

      const detail = await getSession(treasurer.id, org.id, session.id)
      expect(detail?.roster.find((row) => row.memberId === member.ben)?.present).toBe(true)

      await ok(() => setAttendance(org.slug, session.id, { error: null }, form({ present: [member.ada] })))
      const mark = await dbAdmin.sessionAttendance.findUniqueOrThrow({ where: { sessionId_memberId: { sessionId: session.id, memberId: member.ben } } })
      expect(mark.present).toBe(false)
    })

    it('keeps a stopped coach as the option on their own class', async () => {
      await dbAdmin.instructor.update({ where: { id: coach.jin }, data: { isActive: false } })
      as(treasurer)
      const fresh = await listInstructorOptions(treasurer.id, org.id)
      expect(fresh.map((o) => o.id)).not.toContain(coach.jin)
      const editing = await listInstructorOptions(treasurer.id, org.id, coach.jin)
      expect(editing.map((o) => o.id)).toContain(coach.jin)
      await dbAdmin.instructor.update({ where: { id: coach.jin }, data: { isActive: true } })
    })

    it('blocks the month in the workflow when a rate only starts after the classes', async () => {
      as(treasurer)
      await ok(() =>
        saveInstructor(org.slug, null, { error: null }, form({
          fullName: 'Lee New',
          danceStyle: 'Waacking',
          email: 'lee@coach.test',
          addressLine1: '1 Dance Street',
          postalCode: '000002',
          bankName: 'DBS',
          bankAccountNo: '000-00000-3',
          engagement: 'CONTRACTED',
        }))
      )
      const lee = (await dbAdmin.instructor.findFirstOrThrow({ where: { orgId: org.id, fullName: 'Lee New' } })).id
      const period = monthKey(-4)
      await ok(() => addInstructorRate(org.slug, lee, { error: null }, form({ hourlyRate: '80', effectiveFrom: on(monthKey(-2).period, 1) })))
      await ok(() => saveSession(org.slug, null, { error: null }, form({ instructorId: lee, heldOn: on(period.period, 9), durationMinutes: '60' })))

      const flow = await coachPaymentsWorkflow(treasurer.id, org.id, org.slug, now, { year: period.year, month: period.month })
      const raiseStep = flow.steps.find((step) => step.key === 'raise')
      expect(raiseStep?.state).toBe('blocked')
      expect(raiseStep?.note).toMatch(/rate covering the month/)
    })
  })

  describe('an old claim OSL never paid', () => {
    it('is the month the home screen asks about, not a finished one', async () => {
      as(treasurer)
      await dbAdmin.instructor.update({ where: { id: coach.jin }, data: { isActive: true } })
      // Documents for that month are dated in a financial year the fixture
      // did not open a counter for.
      const dated = new Date(longAgo.year, longAgo.month, 15)
      const fy = dated.getMonth() >= 3 ? dated.getFullYear() : dated.getFullYear() - 1
      await dbAdmin.referenceCounter.upsert({
        where: { orgId_series_financialYear: { orgId: org.id, series: 'IV', financialYear: fy } },
        update: {},
        create: { orgId: org.id, series: 'IV', financialYear: fy, nextSequence: 1 },
      })
      await classOn(coach.kai, on(longAgo.period, 7), [member.ada])
      const old = await raise(coach.kai, longAgo.period)
      await ok(() => signMonth(org.slug, old.id))
      await ok(() => markSubmitted(org.slug, old.id))

      const flow = await coachPaymentsWorkflow(treasurer.id, org.id, org.slug, now)
      expect(flow.subject).toContain(String(longAgo.year))
      expect(flow.settled).toBe(false)
      expect(flow.restingState).toMatch(/With OSL/)
    })
  })

  describe('re-importing a sheet that corrects the coach', () => {
    it('moves the class to the right coach instead of adding a second one', async () => {
      const heldOn = on(monthKey(-2).period, 12)
      const sheet = (label: string): ParsedSheet => ({
        dates: [{ header: '12', iso: heldOn, columnIndex: 12 }],
        members: [
          {
            rowNumber: 5,
            rosterLabel: 'Confirmed',
            fullName: 'Ada Lee',
            academicTerm: null,
            studentId: '1000001',
            email: null,
            phone: null,
            birthDay: null,
            birthMonth: null,
            birthYear: null,
            presentOn: [heldOn],
          },
        ],
        sessions: [{ iso: heldOn, instructorLabel: label, minutes: 90 }],
        unattributedDates: [],
        subtotalConflicts: [],
        instructorHours: [],
        warnings: [],
      })
      const kai = await dbAdmin.instructor.findUniqueOrThrow({ where: { id: coach.kai } })
      const jin = await dbAdmin.instructor.findUniqueOrThrow({ where: { id: coach.jin } })

      for (const label of [kai.shortCode, jin.shortCode]) {
        const record = await dbAdmin.attendanceImport.create({
          data: { orgId: org.id, spreadsheetId: 'sheet', parsed: {}, importedByUserId: treasurer.id },
        })
        const result = await dbAdmin.$transaction((tx) =>
          applyParsedSheet(tx, { orgId: org.id, actorId: treasurer.id, importId: record.id, parsed: sheet(label), overrides: {} })
        )
        if (label === jin.shortCode) expect(result.coachChangedDates).toEqual([heldOn])
      }

      const classes = await dbAdmin.classSession.findMany({ where: { orgId: org.id, heldOn: new Date(`${heldOn}T00:00:00Z`) } })
      expect(classes).toHaveLength(1)
      expect(classes[0].instructorId).toBe(coach.jin)
    })

    it('leaves a class another sheet recorded on the same date alone', async () => {
      const heldOn = on(monthKey(-2).period, 26)
      const kai = await dbAdmin.instructor.findUniqueOrThrow({ where: { id: coach.kai } })
      const jin = await dbAdmin.instructor.findUniqueOrThrow({ where: { id: coach.jin } })
      for (const [spreadsheetId, label] of [['first-sheet', kai.shortCode], ['second-sheet', jin.shortCode]] as const) {
        const record = await dbAdmin.attendanceImport.create({
          data: { orgId: org.id, spreadsheetId, parsed: {}, importedByUserId: treasurer.id },
        })
        await dbAdmin.$transaction((tx) =>
          applyParsedSheet(tx, {
            orgId: org.id,
            actorId: treasurer.id,
            importId: record.id,
            parsed: {
              dates: [{ header: '26', iso: heldOn, columnIndex: 12 }],
              members: [],
              sessions: [{ iso: heldOn, instructorLabel: label, minutes: 90 }],
              unattributedDates: [],
              subtotalConflicts: [],
              instructorHours: [],
              warnings: [],
            },
            overrides: {},
          })
        )
      }
      const classes = await dbAdmin.classSession.findMany({ where: { orgId: org.id, heldOn: new Date(`${heldOn}T00:00:00Z`) } })
      expect(classes).toHaveLength(2)
    })

    it('leaves a class somebody recorded by hand alone', async () => {
      const heldOn = on(monthKey(-2).period, 19)
      as(treasurer)
      await classOn(coach.kai, heldOn, [member.ada])
      const jin = await dbAdmin.instructor.findUniqueOrThrow({ where: { id: coach.jin } })
      const record = await dbAdmin.attendanceImport.create({ data: { orgId: org.id, spreadsheetId: 'sheet', parsed: {}, importedByUserId: treasurer.id } })
      await dbAdmin.$transaction((tx) =>
        applyParsedSheet(tx, {
          orgId: org.id,
          actorId: treasurer.id,
          importId: record.id,
          parsed: {
            dates: [{ header: '19', iso: heldOn, columnIndex: 12 }],
            members: [],
            sessions: [{ iso: heldOn, instructorLabel: jin.shortCode, minutes: 90 }],
            unattributedDates: [],
            subtotalConflicts: [],
            instructorHours: [],
            warnings: [],
          },
          overrides: {},
        })
      )
      const classes = await dbAdmin.classSession.findMany({ where: { orgId: org.id, heldOn: new Date(`${heldOn}T00:00:00Z`) } })
      expect(classes.map((c) => c.instructorId).sort()).toEqual([coach.jin, coach.kai].sort())
    })
  })
})

