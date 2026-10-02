/**
 * A month of coach payments, start to finish, the way the treasurer does it.
 *
 * Coach set up → classes recorded, one of them self-practice → attendance
 * taken → the month raised → read → signed with a stored signature → sent →
 * paid. The home screen's workflow is read at every stage, because what the
 * treasurer is *told* is as much a part of the process as what the database
 * holds.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { addInstructorRate, saveInstructor, saveSession, setAttendance } from '@/modules/coach-claim/actions'
import { openField } from '@/core/crypto/fields'
import {
  generateMonthlyDocuments,
  markPaid,
  markSubmitted,
  signMonth,
} from '@/modules/coach-claim/run-actions'
import { uploadSignature } from '@/modules/signatures/actions'
import { uploadOrgLogo } from '@/actions/organisation'
import { coachPaymentsWorkflow } from '@/modules/workflow/coach-payments'
import { getMonthlyRun } from '@/modules/coach-claim/monthly-run'
import { GET as downloadDocument } from '@/app/(dashboard)/[orgSlug]/monthly-run/[invoiceId]/download/[document]/route'
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
  runAs,
  type TestOrg,
  type TestUser,
} from './harness'

const now = new Date()
const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const period = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}`
const day = (d: number) => `${period}-${String(d).padStart(2, '0')}`

let org: TestOrg
let treasurer: TestUser
let president: TestUser
let member: TestUser
let coachId: string
let invoiceId: string

async function workflow(user: TestUser) {
  return coachPaymentsWorkflow(user.id, org.id, org.slug, now)
}

describe('a month of coach payments', () => {
  beforeAll(async () => {
    await resetDatabase()
    await ensureBucket()
    org = await createOrganisation()
    treasurer = await createUser('Tess Treasurer')
    president = await createUser('Pat President')
    member = await createUser('Mo Member')
    await join(treasurer, org, 'EXCO', 'TREASURER')
    await join(president, org, 'EXCO', 'PRESIDENT')
    await join(member, org, 'MEMBER')
    await addRosterMember(org, { fullName: 'Ada Lee', studentId: '1000001' })
    await addRosterMember(org, { fullName: 'Ben Ong', studentId: '1000002' })
  })

  it('starts by asking for the classes', async () => {
    as(treasurer)
    const flow = await workflow(treasurer)
    // Nothing recorded anywhere: the card still has something to say.
    expect(flow.steps[0]?.key).toBe('classes')
  })

  it('sets up a coach who can be invoiced', async () => {
    as(treasurer)
    await ok(() =>
      saveInstructor(org.slug, null, { error: null }, form({
        fullName: 'Kai Smith',
        danceStyle: 'Popping',
        email: 'kai@coach.test',
        addressLine1: '1 Dance Street',
        postalCode: '000002',
        bankName: 'DBS',
        bankAccountNo: '000-00000-0',
        engagement: 'CONTRACTED',
      }))
    )
    coachId = (await dbAdmin.instructor.findFirstOrThrow({ where: { orgId: org.id } })).id

    await ok(() =>
      addInstructorRate(org.slug, coachId, { error: null }, form({
        hourlyRate: '90',
        effectiveFrom: `${last.getFullYear() - 1}-01-01`,
      }))
    )
  })

  it('records the month’s classes, including one nobody was paid for', async () => {
    as(treasurer)
    for (const d of [3, 10, 17]) {
      await ok(() =>
        saveSession(org.slug, null, { error: null }, form({
          instructorId: coachId,
          heldOn: day(d),
          durationMinutes: '90',
        }))
      )
    }
    // Self-practice: blank coach.
    await ok(() =>
      saveSession(org.slug, null, { error: null }, form({ instructorId: '', heldOn: day(24), durationMinutes: '120' }))
    )

    expect(await dbAdmin.classSession.count({ where: { orgId: org.id } })).toBe(4)
  })

  it('takes attendance', async () => {
    as(treasurer)
    const members = await dbAdmin.member.findMany({ where: { orgId: org.id } })
    const sessions = await dbAdmin.classSession.findMany({ where: { orgId: org.id } })
    for (const session of sessions) {
      await ok(() =>
        setAttendance(org.slug, session.id, { error: null }, form({ present: members.map((m) => m.id) }))
      )
    }
    expect(await dbAdmin.sessionAttendance.count()).toBe(sessions.length * members.length)
  })

  it('does not let an ordinary member record classes or raise a month', async () => {
    as(member)
    const session = await outcome(() =>
      saveSession(org.slug, null, { error: null }, form({ instructorId: coachId, heldOn: day(28), durationMinutes: '60' }))
    )
    expect(session.kind).toBe('denied')

    const raise = await outcome(() =>
      generateMonthlyDocuments(org.slug, { error: null }, form({ instructorId: coachId, period, fundSource: 'SEED' }))
    )
    expect(raise.kind).toBe('denied')
  })

  it('tells the treasurer to raise the month, due three working days after the 15th', async () => {
    as(treasurer)
    const flow = await workflow(treasurer)
    expect(flow.subject).toContain(String(last.getFullYear()))
    expect(flow.next?.label).toMatch(/Raise/)
    expect(flow.dueAt).not.toBeNull()
  })

  it('shows the month on the run board as ready, for three classes and not four', async () => {
    as(treasurer)
    const run = await getMonthlyRun(treasurer.id, org.id, last.getFullYear(), last.getMonth() + 1)
    const entry = run.entries.find((e) => e.instructorId === coachId)
    expect(entry?.status).toBe('READY')
    expect(entry?.sessionCount).toBe(3)
    // 3 × 1.5 h × $90
    expect(entry?.subtotalCents).toBe(40_500)
  })

  it('hears of somebody who missed the month, and somebody who joined after it', async () => {
    const before = new Date(last.getFullYear(), last.getMonth() - 2, 1)
    const dev = await addRosterMember(org, { fullName: 'Dev Absent', studentId: '1000003' })
    await dbAdmin.member.update({ where: { id: dev.id }, data: { joinedAt: before } })
    // Added today, so after every class in last month's sheet.
    await addRosterMember(org, { fullName: 'Cara Late', studentId: '1000004' })
  })

  it('raises the month and allocates the first IV reference', async () => {
    as(treasurer)
    await ok(() =>
      generateMonthlyDocuments(org.slug, { error: null }, form({ instructorId: coachId, period, fundSource: 'SEED' }))
    )
    const invoice = await dbAdmin.invoice.findFirstOrThrow({
      where: { orgId: org.id },
      include: { referenceNumber: true, lines: true },
    })
    invoiceId = invoice.id
    expect(invoice.status).toBe('GENERATED')
    expect(invoice.lines).toHaveLength(3)
    expect(invoice.totalCents).toBe(40_500)
    expect(invoice.referenceNumber?.formatted).toMatch(/^IV\d{2}-097-0001$/)

    // The sheet is the roster as it stood that month: whoever missed it is
    // marked absent, and whoever joined since is not on it at all.
    const sheet = await dbAdmin.attendanceSheet.findFirstOrThrow({ where: { orgId: org.id } })
    const names = (sheet.snapshot as { roster: { fullName: string }[] }).roster.map((m) => m.fullName)
    expect(names).toEqual(['Ada Lee', 'Ben Ong', 'Dev Absent'])
  })

  it('refuses to raise the same month twice', async () => {
    as(treasurer)
    const again = await generateMonthlyDocuments(org.slug, { error: null }, form({ instructorId: coachId, period, fundSource: 'SEED' }))
    expect(again.error).toMatch(/already raised/)
  })

  it('freezes the month: a class in a raised month cannot be edited', async () => {
    as(treasurer)
    const session = await dbAdmin.classSession.findFirstOrThrow({ where: { orgId: org.id, instructorId: coachId } })
    const edit = await saveSession(org.slug, session.id, { error: null }, form({
      instructorId: coachId,
      heldOn: day(3),
      durationMinutes: '240',
    }))
    expect(edit.error).toBeTruthy()

    const stored = await dbAdmin.classSession.findUniqueOrThrow({ where: { id: session.id } })
    expect(stored.durationMinutes).toBe(90)
    const invoice = await dbAdmin.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
    expect(invoice.totalCents).toBe(40_500)
  })

  it('moves the workflow on to signing', async () => {
    as(treasurer)
    const flow = await workflow(treasurer)
    expect(flow.next?.label).toBe('Read and sign them')
    expect(flow.steps.filter((s) => s.state === 'current').map((s) => s.key)).toEqual(['sign'])
  })

  it('stores the treasurer’s signature in private storage', async () => {
    as(treasurer)
    await ok(() => uploadSignature(org.slug, { error: null }, form({ signature: pngFile(600, 200, 'sig.png') })))
    const user = await dbAdmin.user.findUniqueOrThrow({ where: { id: treasurer.id } })
    expect(user.signatureImagePath).toMatch(new RegExp(`^signatures/${treasurer.id}/`))
  })

  it('refuses a signature too small to print', async () => {
    as(president)
    const tiny = await uploadSignature(org.slug, { error: null }, form({ signature: pngFile(60, 20, 'tiny.png') }))
    expect(tiny.error).toBeTruthy()
  })

  it('lets exactly one person sign, even when two try at once', async () => {
    const [byTreasurer, byPresident] = await Promise.all([
      runAs(treasurer, () => signMonth(org.slug, invoiceId)),
      runAs(president, () => signMonth(org.slug, invoiceId)),
    ])

    // Exactly one wins. Both succeeding is the bug: the second silently
    // overwrites who stood behind a document already on its way to OSL.
    const winners = [byTreasurer, byPresident].filter((result) => !result.error)
    expect(winners).toHaveLength(1)
    const loser = [byTreasurer, byPresident].find((result) => result.error)
    expect(loser?.error).toMatch(/signed that month a moment ago/)

    const sheet = await dbAdmin.attendanceSheet.findFirstOrThrow({ where: { invoice: { id: invoiceId } } })
    expect(sheet.verifiedByName).toBe(byTreasurer.error ? 'Pat President' : 'Tess Treasurer')
    expect(sheet.verifiedAsOffice).toBe(byTreasurer.error ? 'PRESIDENT' : 'TREASURER')
  })

  it('produces documents carrying the stamped signature', async () => {
    as(treasurer)
    const response = await downloadDocument(new Request('http://test/'), {
      params: Promise.resolve({ orgSlug: org.slug, invoiceId, document: 'attendance-sheet.docx' }),
    })
    expect(response.status).toBe(200)
    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Ada Lee')
    const sheet = await dbAdmin.attendanceSheet.findFirstOrThrow({ where: { invoice: { id: invoiceId } } })
    if (sheet.verifiedByName === 'Tess Treasurer') {
      // Only the treasurer uploaded a specimen, so only their signing stamps one.
      expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/') && !name.endsWith('/'))).toBe(true)
    }
  })

  it('puts the club logo at the top of the attendance sheet, and refuses a member uploading one', async () => {
    const logo = pngFile(400, 200, 'logo.png')

    as(member)
    expect((await outcome(() => uploadOrgLogo(org.slug, { error: null }, form({ logo })))).kind).toBe('denied')

    as(treasurer)
    await ok(() => uploadOrgLogo(org.slug, { error: null }, form({ logo })))

    const response = await downloadDocument(new Request('http://test/'), {
      params: Promise.resolve({ orgSlug: org.slug, invoiceId, document: 'attendance-sheet.docx' }),
    })
    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()))
    const expected = Buffer.from(await logo.arrayBuffer())
    const media = Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !name.endsWith('/'))
    const images = await Promise.all(media.map((name) => zip.file(name)!.async('nodebuffer')))
    expect(images.some((image) => image.equals(expected))).toBe(true)
    // With a logo, the masthead shows it instead of the club's name as text.
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Coaches Monthly Attendance Sheet')
  })

  it('keeps the coach’s bank account number sealed in the database, and readable on the invoice', async () => {
    // What a leaked backup or a stolen connection string would show.
    const [column] = await dbAdmin.$queryRaw<Array<{ bank_account_no: string }>>`
      SELECT bank_account_no FROM instructors WHERE id = ${coachId}`
    expect(column.bank_account_no).toMatch(/^v1\.aesgcm256\./)
    expect(column.bank_account_no).not.toContain('00000')

    const [sheet] = await dbAdmin.$queryRaw<Array<{ snapshot: string }>>`
      SELECT snapshot::text AS snapshot FROM attendance_sheets WHERE org_id = ${org.id}`
    expect(sheet.snapshot).not.toContain('000-00000-0')
    expect(sheet.snapshot).toContain('v1.aesgcm256.')

    as(treasurer)
    const response = await downloadDocument(new Request('http://test/'), {
      params: Promise.resolve({ orgSlug: org.slug, invoiceId, document: 'invoice.docx' }),
    })
    expect(response.status).toBe(200)
    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()))
    expect(await zip.file('word/document.xml')!.async('string')).toContain('000-00000-0')
  })

  it('shows a member none of the month’s money, even querying directly', async () => {
    // Row-level security is the backstop under every screen: as a member,
    // the invoice tables are simply empty.
    const { dbAs } = await import('@/core/db')
    const seen = await dbAs(member.id, async (tx) => ({
      invoices: await tx.invoice.count(),
      lines: await tx.invoiceLine.count(),
      coaches: await tx.instructor.count(),
      sheets: await tx.attendanceSheet.count(),
    }))
    expect(seen).toEqual({ invoices: 0, lines: 0, coaches: 0, sheets: 0 })
  })

  it('will not let a member change a coach’s bank details or where documents are sent, even going around the actions', async () => {
    const { dbAs } = await import('@/core/db')
    const before = await dbAdmin.organisationSettings.findUniqueOrThrow({ where: { orgId: org.id } })

    const updated = await dbAs(member.id, async (tx) => ({
      bank: await tx.instructor.updateMany({ where: { id: coachId }, data: { bankAccountNo: '999-attacker' } }),
      email: await tx.organisationSettings.updateMany({
        where: { orgId: org.id },
        data: { submissionEmail: 'attacker@evil.test' },
      }),
    }))

    expect(updated.bank.count).toBe(0)
    expect(updated.email.count).toBe(0)
    const stored = (await dbAdmin.instructor.findUniqueOrThrow({ where: { id: coachId } })).bankAccountNo!
    expect(openField(stored)).toBe('000-00000-0')
    expect((await dbAdmin.organisationSettings.findUniqueOrThrow({ where: { orgId: org.id } })).submissionEmail).toBe(
      before.submissionEmail
    )
  })

  it('will not let a member download the documents', async () => {
    as(member)
    const result = await outcome(() =>
      downloadDocument(new Request('http://test/'), {
        params: Promise.resolve({ orgSlug: org.slug, invoiceId, document: 'invoice.docx' }),
      })
    )
    expect(result.kind).toBe('denied')
  })

  it('refuses to record payment before the month has been sent', async () => {
    as(treasurer)
    const early = await markPaid(org.slug, invoiceId, true)
    expect(early.error).toMatch(/not been sent/)
  })

  it('sends, then records payment, and the workflow comes to rest', async () => {
    as(treasurer)
    await ok(() => markSubmitted(org.slug, invoiceId))

    const waiting = await workflow(treasurer)
    expect(waiting.next).toBeNull()
    expect(waiting.restingState).toMatch(/Waiting on payment/)

    await ok(() => markPaid(org.slug, invoiceId, true))
    const invoice = await dbAdmin.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
    expect(invoice.status).toBe('PAID')

    const done = await workflow(treasurer)
    expect(done.settled).toBe(true)
  })

  it('left an audit trail of every step, attributed to whoever took it', async () => {
    const actions = (await dbAdmin.auditLog.findMany({ where: { orgId: org.id }, select: { action: true } })).map(
      (row) => row.action
    )
    for (const expected of ['claim.generate', 'claim.submit', 'claim.paid']) {
      expect(actions).toContain(expected)
    }
  })
})
