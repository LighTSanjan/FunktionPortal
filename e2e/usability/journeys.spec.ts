import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { TREASURER, MEMBER, NEWCOMER, STRANGER } from './seed'
import { latestCode, signInWithCode } from './sign-in'
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

test.describe.configure({ mode: 'serial' })

let treasurer: BrowserContext
let member: BrowserContext
let newcomer: BrowserContext

test.beforeAll(async ({ browser }) => {
  treasurer = await browser.newContext()
  member = await browser.newContext()
  newcomer = await browser.newContext()
})

test.afterAll(async () => {
  await treasurer.close()
  await member.close()
  await newcomer.close()
})

test('the treasurer signs in with a code to their SUTD address and lands on their work', async () => {
  const page = await treasurer.newPage()
  await signInWithCode(page, TREASURER.email)
  await expect(page.getByText('Your work')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Coach payments' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Raise .* documents/ })).toBeVisible()

  const searchTrigger = page.getByRole('button', { name: 'Open command palette' })
  await searchTrigger.click()
  await expect(page.getByPlaceholder('Search pages...')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(searchTrigger).toBeFocused()

  const notificationTrigger = page.getByRole('button', { name: /Notifications/ })
  await notificationTrigger.click()
  await expect(page.getByRole('menu', { name: 'Notifications' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: 'Notifications' })).toHaveCount(0)
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
    'settings/invitations',
    'settings/audit-log',
  ]) {
    await visit(page, `/${ORG}/${path}`)
  }
})

test('the exceptional external-payment form stays out of the way until requested', async () => {
  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/monthly-run`)

  await expect(page.getByText('Were these coaches paid elsewhere?')).toBeVisible()
  await expect(page.getByLabel('Actual amount').first()).toBeHidden()
  await page.getByText('Were these coaches paid elsewhere?').click()
  await expect(page.getByLabel('Actual amount').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save external payment' })).toBeVisible()
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

  const monthUrl = page.url()
  await visit(page, `${monthUrl}/print`)

  // The month's email and the one PDF that goes with it.
  await visit(page, monthUrl)
  await expect(page.getByText(/^Coach Payment for /)).toBeVisible()
  await expect(page.getByText(/attached are the necessary documents for instructor's payment/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start the email' })).toHaveCount(0)

  const download = page.waitForEvent('download', { timeout: 90_000 })
  await page.getByRole('button', { name: 'Download signed PDF' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/Kai Smith .*\.pdf$/)
  const pdf = await (await import('node:fs/promises')).readFile((await file.path())!)
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  await file.saveAs('test-results/signed-month.pdf')
  // The invoice and the attendance sheet: at least two pages.
  const { PDFDocument } = await import('pdf-lib')
  expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThanOrEqual(2)

  await page.getByRole('button', { name: 'Mark as sent' }).click()
  await expect(page.getByText(/Marked as sent on/)).toBeVisible()
})

test('the treasurer voids the month after spotting a mistake, and raises it again under the same number', async () => {
  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/monthly-run`)
  const reference = (await page.locator('dd.font-mono').first().innerText()).trim()
  await page.getByRole('link', { name: 'Open the documents' }).click()
  await page.waitForURL(/monthly-run\/[^/?]+$/)

  await page.getByRole('button', { name: 'Void this month' }).click()
  // Already sent, so OSL have to be told as well.
  await expect(page.getByText(`email OSL that ${reference} is void`)).toBeVisible()
  await page.getByLabel('Why it\'s being voided').fill('Kai taught 60 minutes on the 10th, not 90')
  await page.getByRole('button', { name: `Void ${reference}` }).click()

  await page.waitForURL(/monthly-run\?month=/)
  await expect(page.getByText(`voided: Kai taught 60 minutes on the 10th, not 90`)).toBeVisible()
  await expect(page.getByText('Ready to raise')).toBeVisible()

  await page.getByRole('button', { name: 'Raise the month' }).click()
  await expect(page.getByRole('link', { name: 'Read and sign', exact: true })).toBeVisible()
  const next = (await page.locator('dd.font-mono').first().innerText()).trim()
  // The Office of Finance reads a gap in the series as a missed number, so the
  // voided number is issued again rather than skipped.
  expect(next).toBe(reference)
})

test('the treasurer puts this term’s PayNow QR up', async () => {
  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/fees/collection?tab=form`)
  const png = Buffer.from(makePng(400, 400))
  for (const rate of [/^Full term/, /^Half term/]) {
    const slot = page.getByRole('group', { name: rate })
    await slot.locator('input[name="qr"]').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: png })
    await slot.getByRole('button', { name: 'Put the QR up' }).click()
    await expect(slot.getByText('Saved. Members see it now.')).toBeVisible()
  }
  await expect(page.getByRole('img', { name: /^Half-term PayNow QR/ })).toBeVisible()
})

test('the treasurer adds a question of the club’s own and opens the form', async () => {
  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/fees/collection?tab=form`)
  await expect(page.getByText('Draft, not open yet')).toBeVisible()

  await page.getByRole('button', { name: 'Add a question' }).click()
  await page.getByLabel('Question', { exact: true }).fill('Telegram handle')
  await page.getByText('People have to answer it').click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Telegram handle' })).toBeVisible()

  await visit(page, `/${ORG}/fees?preview=new`)
  await expect(page.getByText('Preview.')).toBeVisible()
  await expect(page.getByLabel('Full name')).toBeVisible()
  await expect(page.getByRole('button', { name: /Send/ })).toBeDisabled()

  await visit(page, `/${ORG}/fees/collection?tab=form`)
  await page.getByRole('button', { name: 'Open the form' }).click()
  await expect(page.getByText('Open for responses')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible()
})

test('the treasurer puts Ben on half a term and records his payment off the bank statement', async () => {
  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/fees/collection?tab=payments`)
  await expect(page.getByRole('link', { name: 'Membership fees' }).first()).toBeVisible()

  const ben = page.getByRole('listitem').filter({ hasText: 'Ben Ong' })
  await ben.getByRole('button', { name: /Full term/ }).click()
  await ben.locator('label', { hasText: 'Half term' }).click()
  await ben.getByRole('button', { name: 'Save fee' }).click()
  await expect(ben.getByRole('button', { name: 'Save fee' })).toHaveCount(0)
  await expect(ben.getByRole('button', { name: /\$35\.00 · Half term/ })).toBeVisible()

  await ben.getByRole('button', { name: 'Record payment' }).click()
  await ben.getByLabel(/Reference on the bank statement/).fill('DBS 1234 BEN')
  await ben.getByRole('button', { name: 'Save payment' }).click()
  await expect(ben.getByText('Paid', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /Paid/ }).first().click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Ada Lee' })).toHaveCount(0)
})

test('somebody with no SUTD address and no invitation gets no code and no account', async () => {
  const page = await member.newPage()
  await page.goto('/sign-in')
  await page.locator('#email').fill(STRANGER.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()
  // The same words as everybody else, so the page does not say who is in.
  await expect(page.getByText(/If .* can use the portal, a code is on its way/)).toBeVisible()
  await expect(latestCode(STRANGER.email, Date.now() - 5000)).rejects.toThrow()
  const { dbAdmin } = await import('../../src/core/db/admin')
  const rows = await dbAdmin.$queryRaw<unknown[]>`SELECT 1 FROM auth.users WHERE email = ${STRANGER.email}`
  expect(rows).toHaveLength(0)
})

test('the treasurer invites a member who has no SUTD address', async () => {
  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/settings/invitations`)
  await page.getByLabel('Email address to invite').fill(MEMBER.email)
  await page.getByRole('button', { name: 'Invite' }).click()
  await expect(page.getByText(`Invited ${MEMBER.email}`)).toBeVisible()
})

test('the invited member is found on the roster by her student ID, and pays', async () => {
  const page = await member.newPage()
  await signInWithCode(page, MEMBER.email)
  // Not linked yet: the welcome screen comes first, whatever they opened.
  await page.waitForURL(new RegExp(`/${ORG}/welcome$`))
  await page.getByRole('button', { name: /^Start/ }).click()
  await page.getByRole('button', { name: /I’ve danced with you before/ }).click()
  // Coming back, the student ID comes first and the roster fills in the rest.
  await page.getByLabel('Student ID').fill(MEMBER.studentId)
  await expect(page.getByText('Found you.')).toBeVisible()
  await expect(page.getByLabel('Full name')).toHaveValue('Ada Lee')
  await page.getByLabel('Day').fill('14')
  await page.getByLabel('Month').selectOption('2')
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect(page.getByRole('heading', { name: /Good to have\s*you back/ })).toBeVisible()
  await expect(page.getByText('You’re in.')).toBeVisible()
  await page.getByRole('link', { name: 'Pay for Trimester 1' }).click()
  await page.waitForURL(new RegExp(`/${ORG}/fees$`))

  // Filled in from the roster.
  await expect(page.getByLabel('Full name')).toHaveValue('Ada Lee')
  await expect(page.getByLabel('Student ID')).toHaveValue(MEMBER.studentId)
  await expect(page.getByText(/Not comfortable paying \$70 towards club funds\? PM the treasurer/)).toBeVisible()
  await page.getByLabel(/Telegram handle/).fill('@ada')
  // Nothing to send, and no payment fields, until they choose to pay.
  await expect(page.getByRole('button', { name: /^Send/ })).toBeHidden()
  await expect(page.getByLabel('PayNow reference')).toHaveCount(0)
  // The button on the card at the top opens the payment section.
  await page.getByRole('button', { name: 'Pay $70.00' }).first().click()
  await expect(page.getByRole('img', { name: /PayNow QR for the Trimester 1/ })).toBeInViewport()
  await page.getByRole('button', { name: /^Send/ }).click()
  // Nothing typed is lost when something is missing.
  await expect(page.getByText('A few things need fixing')).toBeVisible()
  await expect(page.getByLabel('Full name')).toHaveValue('Ada Lee')

  await page.getByLabel('PayNow reference').fill('PAYNOW ADA 0915')
  await page.locator('input[name="proof"]').setInputFiles({
    name: 'paid.png',
    mimeType: 'image/png',
    buffer: Buffer.from(makePng(300, 600)),
  })
  await page.getByRole('button', { name: 'Send, I’ve paid $70.00' }).click()
  await expect(page.getByText('We’ve got your response')).toBeVisible()
  await expect(page.getByText('On the roster as Ada Lee')).toBeVisible()
})

test('somebody new says who they are, reaches nothing but joining and their profile, and pays', async () => {
  const page = await newcomer.newPage()
  await signInWithCode(page, NEWCOMER.email, new RegExp(`/${ORG}/welcome$`))
  await page.getByRole('button', { name: /^Start/ }).click()
  await page.getByRole('button', { name: /First time/ }).click()
  await page.getByLabel('Full name').fill(NEWCOMER.name)
  await page.getByLabel('Student ID').fill(NEWCOMER.studentId)
  await page.getByLabel('Day').fill('3')
  await page.getByLabel('Month').selectOption('7')
  await page.getByLabel('Graduating in').selectOption({ index: 2 })
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect(page.getByRole('heading', { name: /Nearly there/ })).toBeVisible()

  for (const path of ['dashboard', 'access']) {
    await visit(page, `/${ORG}/${path}`)
    expect(page.url(), `${path} should send somebody not on the roster to join and pay`).toMatch(new RegExp(`/${ORG}/fees$`))
  }
  // Everybody keeps a profile, on the roster or not.
  const { body: profile } = await visit(page, `/${ORG}/settings/profile`)
  expect(page.url()).toMatch(new RegExp(`/${ORG}/settings/profile$`))
  expect(profile).toContain('Your profile')
  expect(profile).toContain('Once you’re on the club roster')
  for (const path of ['monthly-run', 'fees/collection', 'instructors', 'register', 'sessions', 'settings/audit-log', 'settings/organisation', 'settings/invitations']) {
    const { body } = await visit(page, `/${ORG}/${path}`)
    // Told plainly, with a way back — not a crash, and nothing of the exco's.
    expect(page.url(), `${path} should send a member to no-access`).toMatch(/\/no-access$/)
    expect(body).toContain('That screen is for the exco')
    expect(body).not.toContain('Kai Smith')
    expect(body).not.toContain('000-00000-0')
  }

  await visit(page, `/${ORG}/fees`)
  await expect(page.getByLabel('Full name')).toHaveValue(NEWCOMER.name)
  await page.getByLabel(/Telegram handle/).fill('@nia')
  // The one beside the payment section, this time.
  await page.getByRole('button', { name: 'Pay $70.00' }).last().click()
  await page.getByLabel('PayNow reference').fill('PAYNOW NIA 0916')
  await page.locator('input[name="proof"]').setInputFiles({
    name: 'paid.png',
    mimeType: 'image/png',
    buffer: Buffer.from(makePng(300, 600)),
  })
  await page.getByRole('button', { name: 'Send, I’ve paid $70.00' }).click()
  await expect(page.getByText('We’ve got your response')).toBeVisible()
  await expect(page.getByText('An exco member will add you to the roster')).toBeVisible()
})

test('the treasurer is told about the response and adds the newcomer to the roster in one click', async () => {
  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/dashboard`)
  await page.getByText(/membership form response to put on the roster/).click()
  await page.waitForURL(/tab=responses/)
  await page.getByRole('button', { name: /Nia New/ }).click()
  await expect(page.getByText('Nobody on the roster looks like them.')).toBeVisible()
  await page.getByRole('button', { name: 'Add to the roster' }).click()
  await expect(page.getByText(/Nia New is on the roster as Nia New\./)).toBeVisible()
})

test('the member’s home screen now says their payment is being checked', async () => {
  const page = await member.newPage()
  const { body: home } = await visit(page, `/${ORG}/dashboard`)
  expect(home).toMatch(/\$70\.00 — being checked/)
  await page.getByRole('link', { name: 'See it' }).click()
  await page.waitForURL(new RegExp(`/${ORG}/fees$`))
  await expect(page.getByText('On the roster as Ada Lee')).toBeVisible()
})

test('banking stays unavailable while a payment is waiting to be checked', async () => {
  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/fees/collection?tab=deposit`)
  await expect(page.getByText(/Check \d+ pending payments? first/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Bank in/ })).toBeDisabled()
})

test('the treasurer, who is on the roster too, fills in the form like everybody else', async () => {
  const { dbAdmin } = await import('../../src/core/db/admin')
  const org = await dbAdmin.organisation.findUniqueOrThrow({ where: { slug: ORG } })
  const user = await dbAdmin.user.findFirstOrThrow({ where: { email: TREASURER.email } })
  await dbAdmin.member.create({
    data: { orgId: org.id, fullName: TREASURER.name, studentId: '1000009', userId: user.id, rosterLabel: 'Confirmed' },
  })

  const page = await treasurer.newPage()
  await visit(page, `/${ORG}/dashboard`)
  await page.getByRole('link', { name: 'Fill it in' }).click()
  await page.waitForURL(new RegExp(`/${ORG}/fees$`))
  const name = page.getByLabel('Full name')
  const studentId = page.getByLabel('Student ID')
  await expect(name).toHaveValue(TREASURER.name)
  await expect(studentId).toHaveValue('1000009')
  await expect(name).toHaveAttribute('required', '')
  await expect(studentId).toHaveAttribute('required', '')
  await name.fill(`${TREASURER.name} Jr`)
  await expect(name).toHaveValue(`${TREASURER.name} Jr`)
  // And from the sidebar, under "You", away from the collection they run.
  await expect(page.getByRole('link', { name: 'Your membership fee' }).first()).toBeVisible()
})

test('a shared link to the form, opened signed out, lands on the form after signing in', async ({ browser }) => {
  const fresh = await browser.newContext()
  const page = await fresh.newPage()
  await page.goto(`/${ORG}/fees?edit=1`)
  await page.waitForURL(/\/sign-in/)
  await expect(page.getByText('Sign in and you’ll go straight back to the page you opened.')).toBeVisible()

  await page.locator('#email').fill(MEMBER.email)
  const since = Date.now()
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.locator('#code')).toBeVisible()
  await page.locator('#code').fill(await latestCode(MEMBER.email, since))
  await page.getByRole('button', { name: 'Sign in' }).click()

  // The page they opened, query and all — not the home screen.
  await page.waitForURL(new RegExp(`/${ORG}/fees\\?edit=1$`))
  await expect(page.getByText('Changing the response you sent')).toBeVisible()

  // And only once: the next visit to the home screen goes home.
  await page.goto('/')
  await page.waitForURL(new RegExp(`/${ORG}/dashboard$`))
  await fresh.close()
})

test('a tab older than the server says so, and offers a reload', async ({ browser }) => {
  const fresh = await browser.newContext()
  const page = await fresh.newPage()
  await page.goto('/sign-in')

  // What a tab left open across a deploy gets back: the action id it holds
  // is not in the new build. Faked here because the alternative is deploying
  // mid-test, and the response is the whole of what the browser sees.
  await page.route('**/sign-in', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 404,
      headers: { 'content-type': 'text/plain', 'x-nextjs-action-not-found': '1' },
      body: 'Server action not found.',
    })
  })

  await page.locator('#email').fill(MEMBER.email)
  await page.getByRole('button', { name: 'Email me a code' }).click()

  // Not "Somebody tripped over a cable": nothing tripped, the page is old.
  await expect(page.getByRole('heading', { name: 'This page is out of step' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)

  await page.unroute('**/sign-in')
  await page.getByRole('button', { name: 'Reload the page' }).click()
  await expect(page.locator('#email')).toBeVisible()
  await fresh.close()
})

test('a button pressed after the session ran out goes to sign-in, not an error', async ({ browser }) => {
  const fresh = await browser.newContext()
  const page = await fresh.newPage()
  await signInWithCode(page, MEMBER.email)
  await page.goto(`/${ORG}/fees?edit=1`)
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()

  // What a session running out looks like from a page already open.
  await fresh.clearCookies()
  await page.getByRole('button', { name: 'Save changes' }).click()

  // The proxy turns the button press away. Before, the browser followed a
  // redirect to HTML and the router threw "An unexpected response was
  // received from the server." at whoever pressed it.
  await page.waitForURL(/\/sign-in/)
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible()
  await expect(page.getByText('Sign in and you’ll go straight back to the page you opened.')).toBeVisible()
  await fresh.close()
})
