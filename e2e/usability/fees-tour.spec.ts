/**
 * Not a test: a screenshot tour of the membership fee screens, with a roster
 * big enough to look like a real term.
 *   TOUR=1 npx playwright test --config playwright.usability.config.ts fees-tour
 */
import { test } from '@playwright/test'
import { TREASURER, MEMBER } from './seed'
import { signInWithCode } from './sign-in'

const OUT = process.env.TOUR_OUT ?? 'test-results/tour'
test.skip(!process.env.TOUR, 'screenshot tour only runs when TOUR=1')

const ROSTER: [string, string, string][] = [
  ['Chloe Lim', '1004001', 'Confirmed'],
  ['Darren Goh', '1004002', '1/2 term'],
  ['Elena Petrova', '1004003', 'Confirmed; Exchange'],
  ['Farhan Aziz', '1004004', 'May come back?'],
  ['Grace Ho', '1004005', 'Confirmed'],
  ['Hui Min Tan', '1004006', 'Confirmed'],
  ['Isaac Wong', '1004007', 'Confirmed'],
  ['Jia Hui Ng', '1004008', 'Confirmed; praying for swift recovery'],
  ['Kavya Rao', '1004009', 'Confirmed'],
  ['Lucas Teo', '1004010', 'Graduated'],
]

test('fees tour', async ({ browser }) => {
  const { dbAdmin } = await import('../../src/core/db/admin')
  const org = await dbAdmin.organisation.findUniqueOrThrow({ where: { slug: 'test-club' } })
  const term = await dbAdmin.term.findFirstOrThrow({ where: { orgId: org.id } })

  const exco = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await signInWithCode(exco, TREASURER.email)
  const treasurer = await dbAdmin.user.findFirstOrThrow({ where: { email: TREASURER.email } })

  const ids: Record<string, string> = {}
  for (const [fullName, studentId, rosterLabel] of ROSTER) {
    const row = await dbAdmin.member.upsert({
      where: { orgId_studentId: { orgId: org.id, studentId } },
      create: { orgId: org.id, fullName, studentId, rosterLabel },
      update: {},
    })
    ids[fullName] = row.id
  }
  for (const name of ['Chloe Lim', 'Grace Ho', 'Isaac Wong']) {
    await dbAdmin.feePayment.upsert({
      where: { termId_memberId: { termId: term.id, memberId: ids[name] } },
      create: {
        orgId: org.id, termId: term.id, memberId: ids[name], tier: 'FULL', amountCents: 7000,
        status: 'CONFIRMED', source: 'RECORDED', confirmedAt: new Date(), confirmedByUserId: treasurer.id,
      },
      update: {},
    })
  }
  await dbAdmin.feePayment.upsert({
    where: { termId_memberId: { termId: term.id, memberId: ids['Hui Min Tan'] } },
    create: {
      orgId: org.id, termId: term.id, memberId: ids['Hui Min Tan'], tier: 'FULL', amountCents: 7000,
      status: 'DECLARED', paymentReference: 'PAYNOW 88213', declaredAt: new Date(),
    },
    update: {},
  })
  await dbAdmin.feeArrangement.upsert({
    where: { termId_memberId: { termId: term.id, memberId: ids['Kavya Rao'] } },
    create: { orgId: org.id, termId: term.id, memberId: ids['Kavya Rao'], tier: 'CUSTOM', amountCents: 2500, note: 'Joined in week 9' },
    update: {},
  })

  const shots: [string, string][] = [
    ['fees-members', ''],
    ['fees-check', '?tab=check'],
    ['fees-setup', '?tab=setup'],
    ['fees-close', '?tab=close'],
  ]
  for (const [name, query] of shots) {
    await exco.goto(`/test-club/fees/collection${query}`, { waitUntil: 'networkidle' })
    await exco.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  }

  await exco.goto('/test-club/fees/collection', { waitUntil: 'networkidle' })
  await exco.getByRole('listitem').filter({ hasText: 'Darren Goh' }).getByRole('button', { name: /Half term/ }).click()
  await exco.screenshot({ path: `${OUT}/fees-edit-fee.png`, fullPage: true })
  await exco.getByRole('button', { name: 'Cancel' }).click()

  for (const name of ['Farhan Aziz', 'Jia Hui Ng']) {
    await exco.getByRole('checkbox', { name: `Select ${name}` }).check()
  }
  await exco.getByRole('button', { name: 'Set their fee' }).click()
  await exco.screenshot({ path: `${OUT}/fees-bulk.png`, fullPage: true })
  await exco.getByRole('button', { name: 'Clear', exact: true }).first().click()

  await exco.getByRole('listitem').filter({ hasText: 'Elena Petrova' }).getByRole('button', { name: 'Record payment' }).click()
  await exco.screenshot({ path: `${OUT}/fees-record.png`, fullPage: true })

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await signInWithCode(mobile, TREASURER.email)
  await mobile.goto('/test-club/fees/collection', { waitUntil: 'networkidle' })
  await mobile.screenshot({ path: `${OUT}/fees-members-mobile.png`, fullPage: true })

  // The member's own page, matched and owing.
  const ada = await dbAdmin.member.findFirstOrThrow({ where: { orgId: org.id, studentId: MEMBER.studentId } })
  const invitation = await dbAdmin.invitation.findFirst({ where: { email: MEMBER.email } })
  if (!invitation) {
    await dbAdmin.invitation.create({
      data: { orgId: org.id, email: MEMBER.email, token: `fees-tour-${Date.now()}`, expiresAt: new Date(Date.now() + 86_400_000) },
    })
  }
  const member = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await signInWithCode(member, MEMBER.email)
  const user = await dbAdmin.user.findFirstOrThrow({ where: { email: MEMBER.email } })
  if (!ada.userId) await dbAdmin.member.update({ where: { id: ada.id }, data: { userId: user.id } })
  await member.goto('/test-club/fees', { waitUntil: 'networkidle' })
  await member.screenshot({ path: `${OUT}/member-fee-mobile.png`, fullPage: true })
  await member.getByRole('button', { name: /I’ve paid/ }).click()
  await member.screenshot({ path: `${OUT}/member-fee-declare-mobile.png`, fullPage: true })
})
