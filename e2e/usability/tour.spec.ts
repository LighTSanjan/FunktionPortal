/**
 * Not a test: a screenshot tour for reviewing the screens by eye.
 *   TOUR=1 npx playwright test --config playwright.usability.config.ts tour
 */
import { test } from '@playwright/test'
import { TREASURER, MEMBER } from './seed'
import { signInWithCode } from './sign-in'

const OUT = process.env.TOUR_OUT ?? 'test-results/tour'
test.skip(!process.env.TOUR, 'screenshot tour only runs when TOUR=1')

test('tour', async ({ browser }) => {
  const exco = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await signInWithCode(exco, TREASURER.email)
  for (const [name, path] of [
    ['exco-home', 'dashboard'],
    ['exco-coach-payments', 'monthly-run'],
    ['exco-subscriptions', 'fees/collection'],
    ['exco-classes', 'sessions'],
    ['exco-coaches', 'instructors'],
    ['exco-transactions', 'register'],
    ['exco-settings-org', 'settings/organisation'],
    ['exco-settings-attendance', 'settings/attendance'],
    ['exco-profile', 'settings/profile'],
    ['exco-invitations', 'settings/invitations'],
    ['exco-all-screens', 'settings/screens'],
    ['error-crash', 'settings/screens/crash'],
    ['error-record-not-found', 'instructors/not-a-real-coach'],
  ]) {
    await exco.goto(`/test-club/${path}`, { waitUntil: 'networkidle' })
    // Figures count up on arrival; let them land before the picture.
    await exco.waitForTimeout(2500)
    await exco.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  }
  const invoice = exco.getByRole('link', { name: /Open the documents|Send to OSL|Read and sign/ }).first()
  await exco.goto('/test-club/monthly-run', { waitUntil: 'networkidle' })
  if (await invoice.count()) {
    await invoice.click()
    await exco.waitForLoadState('networkidle')
    await exco.screenshot({ path: `${OUT}/exco-month.png`, fullPage: true })
  }

  await exco.goto('/this-page-does-not-exist', { waitUntil: 'networkidle' })
  await exco.waitForTimeout(800)
  await exco.screenshot({ path: `${OUT}/error-404.png`, fullPage: true })

  const signedOut = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await signedOut.goto('/sign-in', { waitUntil: 'networkidle' })
  await signedOut.screenshot({ path: `${OUT}/sign-in.png`, fullPage: true })
  await signedOut.locator('#email').fill('someone@mymail.sutd.edu.sg')
  await signedOut.getByRole('button', { name: 'Email me a code' }).click()
  await signedOut.locator('#code').waitFor()
  await signedOut.screenshot({ path: `${OUT}/sign-in-code.png`, fullPage: true })

  const { dbAdmin } = await import('../../src/core/db/admin')
  const org = await dbAdmin.organisation.findUniqueOrThrow({ where: { slug: 'test-club' } })
  await dbAdmin.invitation.create({
    data: { orgId: org.id, email: MEMBER.email, token: `tour-${Date.now()}`, expiresAt: new Date(Date.now() + 86_400_000) },
  })

  const member = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await signInWithCode(member, MEMBER.email)
  for (const [name, path] of [
    ['member-home-mobile', 'dashboard'],
    ['member-fees-mobile', 'fees'],
    ['member-no-access-mobile', 'monthly-run'],
    ['member-404-mobile', 'instructors/not-a-real-coach'],
  ]) {
    await member.goto(`/test-club/${path}`, { waitUntil: 'networkidle' })
    await member.waitForTimeout(1500)
    await member.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  }
})
