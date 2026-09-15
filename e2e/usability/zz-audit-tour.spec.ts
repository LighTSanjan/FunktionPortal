/**
 * Not a test: screenshots of the screens the audit fixes touched, taken after
 * the journeys have left the club in a lived-in state (a month raised, voided
 * and raised again; a form response; a term collecting).
 *   TOUR=1 npx playwright test --config playwright.usability.config.ts journeys zz-audit-tour
 */
import { test } from '@playwright/test'
import { TREASURER } from './seed'
import { signInWithCode } from './sign-in'

const OUT = process.env.TOUR_OUT ?? 'test-results/audit-tour'
test.skip(!process.env.TOUR, 'screenshot tour only runs when TOUR=1')

const ORG = 'test-club'

test('audit tour', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await signInWithCode(page, TREASURER.email)

  const shot = async (name: string, path: string, fullPage = true) => {
    await page.goto(path, { waitUntil: 'networkidle' })
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage })
  }

  await shot('01-dashboard', `/${ORG}/dashboard`)
  await shot('02-monthly-run', `/${ORG}/monthly-run`)

  const live = page.getByRole('link', { name: 'Read and sign', exact: true })
  if (await live.count()) {
    await live.first().click()
    await page.waitForURL(/monthly-run\/[^/?]+$/)
    await page.getByRole('button', { name: 'Void this month' }).click()
    await page.screenshot({ path: `${OUT}/03-month-void-panel.png`, fullPage: true })
  }

  await shot('04-monthly-run-after', `/${ORG}/monthly-run`)
  const voided = page.locator('a.line-through').first()
  if (await voided.count()) {
    await voided.click()
    await page.waitForURL(/monthly-run\/[^/?]+$/)
    await page.screenshot({ path: `${OUT}/05-voided-month.png`, fullPage: true })
  }

  await shot('06-register', `/${ORG}/register`)
  await shot('07-collection-bank-in', `/${ORG}/fees/collection?tab=deposit`)
  await shot('08-your-membership', `/${ORG}/fees`)

  await page.setViewportSize({ width: 390, height: 844 })
  await shot('09-dashboard-phone', `/${ORG}/dashboard`)
  await shot('10-monthly-run-phone', `/${ORG}/monthly-run`)
})
