import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { TREASURER, MEMBER } from './seed'
import { png as makePng } from '../../src/test/integration/harness'

const ORG = 'test-club'

/**
 * Render a screen and fail on anything a person would recognise as broken:
 * a server error, the app's own error boundary, or Next's crash overlay.
 */
async function visit(page: Page, path: string) {
  const errors: string[] = []
  const onError = (error: Error) => errors.push(error.message)
  // Console errors too. React reports duplicate keys, hydration mismatches
  // and failed effects there without throwing — the fund picker listing every
  // financial year's accounts was only ever visible as one of these.
  const onConsole = (message: import('@playwright/test').ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text())
  }
  page.on('pageerror', onError)
  page.on('console', onConsole)

  const response = await page.goto(path, { waitUntil: 'networkidle' })
  const status = response?.status() ?? 0
  const body = await page.locator('body').innerText()

  page.off('pageerror', onError)
  page.off('console', onConsole)

  expect(status, `${path} returned ${status}`).toBeLessThan(500)
  expect(body, `${path} showed the error boundary`).not.toContain('Something went wrong')
  expect(body, `${path} crashed`).not.toMatch(/Unhandled Runtime Error|Application error|Internal Server Error/)
  expect(errors, `${path} threw in the browser`).toEqual([])
  return { status, body }
}

async function signUp(page: Page, who: { name: string; email: string; password: string }) {
  await page.goto('/sign-up')
  await page.locator('#name').fill(who.name)
  await page.locator('#email').fill(who.email)
  await page.locator('#password').fill(who.password)
  await page.locator('#confirmPassword').fill(who.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(new RegExp(`/${ORG}/dashboard`))
}

test.describe.configure({ mode: 'serial' })

let treasurer: BrowserContext
let member: BrowserContext

test.beforeAll(async ({ browser }) => {
  treasurer = await browser.newContext()
  member = await browser.newContext()
})

test.afterAll(async () => {
  await treasurer.close()
  await member.close()
})

test('the treasurer signs up and lands on their work', async () => {
  const page = await treasurer.newPage()
  await signUp(page, TREASURER)
  await expect(page.getByText('Your work')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Coach payments' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Raise .* documents/ })).toBeVisible()
})

test('every screen renders for the treasurer', async () => {
  const page = await treasurer.newPage()
  for (const path of [
    'dashboard',
    'monthly-run',
    'fees/collection',
    'fees',
    'sessions',
    'sessions/new',
    'register',
    'instructors',
    'instructors/new',
    'access',
    'settings/profile',
    'settings/organisation',
    'settings/attendance',
    'settings/access',
    'settings/audit-log',
  ]) {
    await visit(page, `/${ORG}/${path}`)
  }
})

test('the treasurer raises last month from the home screen, reads it and signs it', async () => {
  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/dashboard`)
  await page.getByRole('link', { name: /Raise .* documents/ }).click()
  await page.waitForURL(/monthly-run/)

  await page.getByRole('button', { name: 'Raise the month' }).click()
  await page.getByRole('link', { name: 'Read and sign', exact: true }).click()
  await page.waitForURL(/monthly-run\/[^/?]+$/)

  const { body } = await visit(page, page.url())
  expect(body).toContain('Kai Smith')
  expect(body).toContain('Ada Lee')

  await page.getByRole('button', { name: /Verify without a stamp|Sign both documents/ }).click()
  await expect(page.getByRole('heading', { name: 'Signed' })).toBeVisible()

  await visit(page, `${page.url()}/print`)
})

test('the treasurer puts this term’s PayNow QR up', async () => {
  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/fees/collection`)
  const png = Buffer.from(makePng(400, 400))
  await page.locator('input[name="qr"]').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Put the QR up' }).click()
  await expect(page.getByText('Saved. Members see it now.')).toBeVisible()
})

test('a member signs up with a personal address and says which student they are', async () => {
  const page = await member.newPage()
  await signUp(page, MEMBER)
  // From the home screen, not by knowing where the subscription page lives.
  await expect(page.getByText('Tell the club your student ID')).toBeVisible()
  await page.getByRole('link', { name: 'Give your student ID' }).click()
  await page.waitForURL(new RegExp(`/${ORG}/fees$`))
  await expect(page.getByText('not matched to the roster yet')).toBeVisible()

  await page.getByPlaceholder(/Student ID/).fill(MEMBER.studentId)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText(`You said you are`)).toBeVisible()
})

test('every screen a member can open renders, and exco screens refuse them politely', async () => {
  const page = await member.newPage()
  for (const path of ['dashboard', 'fees', 'access', 'settings/profile']) {
    await visit(page, `/${ORG}/${path}`)
  }
  for (const path of ['monthly-run', 'fees/collection', 'instructors', 'register', 'settings/audit-log', 'settings/organisation', 'sessions']) {
    const { body } = await visit(page, `/${ORG}/${path}`)
    // Told plainly, with a way back — not a crash, and nothing of the exco's.
    expect(page.url(), `${path} should send a member to no-access`).toMatch(/\/no-access$/)
    expect(body).toContain('That screen is for the exco')
    expect(body).not.toContain('Kai Smith')
    expect(body).not.toContain('000-00000-0')
  }
})

test('the treasurer is told about the claim and confirms it in one click', async () => {
  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/dashboard`)
  await page.getByText(/waiting to be matched to the roster/).click()
  await page.waitForURL(/fees\/collection/)
  await expect(page.getByText('Says they are')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Says they are')).toHaveCount(0)
})

test('the member’s home screen now says what they owe, and takes them to pay it', async () => {
  const page = await member.newPage()
  const { body: home } = await visit(page, `/${ORG}/dashboard`)
  expect(home).toMatch(/\$70\.00 due/)
  await page.getByRole('link', { name: 'Pay now' }).click()
  await page.waitForURL(new RegExp(`/${ORG}/fees$`))
  await expect(page.getByAltText(/PayNow QR/)).toBeVisible()
})

test('the treasurer, who is on the roster too, can reach their own subscription from home', async () => {
  // The sidebar hides "Your subscription" from the exco, so without the home
  // card the treasurer's only route to paying their own fee was the URL.
  const { dbAdmin } = await import('../../src/core/db/admin')
  const org = await dbAdmin.organisation.findUniqueOrThrow({ where: { slug: ORG } })
  const user = await dbAdmin.user.findFirstOrThrow({ where: { email: TREASURER.email } })
  await dbAdmin.member.create({
    data: { orgId: org.id, fullName: TREASURER.name, studentId: '1000009', userId: user.id, rosterLabel: 'Confirmed' },
  })

  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/dashboard`)
  await page.getByRole('link', { name: 'Pay now' }).click()
  await page.waitForURL(new RegExp(`/${ORG}/fees$`))
})
