/**
 * The hosted demo's one-click sign-in, and the two locks on it.
 *
 * It signs people in without an email, so it must do nothing at all unless
 * DEMO_MODE is on AND the database is the demo's — one club, slug `demo`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { signInAsDemo } from '@/actions/auth'
import { provisionUser } from '@/core/auth/provision'
import { isDemoDatabase, settleDemoPersona, signInDemoPersona } from '@/core/auth/demo'
import { addRosterMember, createOrganisation, dbAdmin, form, outcome, resetDatabase } from './harness'

const saved = { ...process.env }

function browserClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

beforeEach(async () => {
  await resetDatabase()
  await dbAdmin.$executeRawUnsafe(`DELETE FROM auth.users WHERE email LIKE '%@demo.funktion.test'`)
})

afterEach(() => {
  process.env = { ...saved }
})

describe('the demo sign-in', () => {
  it('knows the demo database from any other', async () => {
    await createOrganisation('test-club', 'Test Club')
    expect(await isDemoDatabase()).toBe(false)

    await resetDatabase()
    await createOrganisation('demo', 'FUNKtion (demo)')
    expect(await isDemoDatabase()).toBe(true)

    await createOrganisation('funktion', 'FUNKtion')
    expect(await isDemoDatabase()).toBe(false)
  })

  it('does nothing without DEMO_MODE, even on the demo database', async () => {
    await createOrganisation('demo', 'FUNKtion (demo)')
    delete process.env.DEMO_MODE
    const result = await outcome(() => signInAsDemo(form({ persona: 'treasurer' })))
    expect(result).toEqual({ kind: 'redirect', to: '/sign-in' })
    expect(await dbAdmin.user.count()).toBe(0)
  })

  it('does nothing on a real club’s database, even with DEMO_MODE on', async () => {
    await createOrganisation('funktion', 'FUNKtion')
    process.env.DEMO_MODE = 'true'
    const result = await outcome(() => signInAsDemo(form({ persona: 'treasurer' })))
    expect(result).toEqual({ kind: 'redirect', to: '/sign-in' })
    expect(await dbAdmin.user.count()).toBe(0)
  })

  it('makes the treasurer exco, and links the member to her roster row', async () => {
    const org = await createOrganisation('demo', 'FUNKtion (demo)')
    const ada = await addRosterMember(org, { fullName: 'Ada Lee', studentId: '1009100', email: 'ada@demo.funktion.test' })
    process.env.ALLOWED_EMAIL_DOMAINS = 'demo.funktion.test'

    // afterSignIn is provisionUser plus logging that needs a request.
    const treasurer = await signInDemoPersona(browserClient(), 'treasurer')
    await provisionUser(treasurer, { method: 'demo' })
    await settleDemoPersona(treasurer.id, 'treasurer')
    expect(await dbAdmin.organisationMembership.findFirst({ where: { userId: treasurer.id } })).toMatchObject({
      role: 'EXCO',
      office: 'TREASURER',
    })

    const member = await signInDemoPersona(browserClient(), 'member')
    await provisionUser(member, { method: 'demo' })
    await settleDemoPersona(member.id, 'member')
    expect(await dbAdmin.organisationMembership.findFirst({ where: { userId: member.id } })).toMatchObject({ role: 'MEMBER' })
    expect((await dbAdmin.member.findUniqueOrThrow({ where: { id: ada.id } })).userId).toBe(member.id)
  })

  it('gives every newcomer an account of their own', async () => {
    await createOrganisation('demo', 'FUNKtion (demo)')
    const first = await signInDemoPersona(browserClient(), 'newcomer')
    const second = await signInDemoPersona(browserClient(), 'newcomer')
    expect(first.id).not.toBe(second.id)
    expect(first.email).toMatch(/@demo\.funktion\.test$/)
  })
})
