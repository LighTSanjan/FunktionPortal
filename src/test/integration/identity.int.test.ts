/**
 * Who a new account gets to be.
 *
 * With Supabase's "Confirm email" switched off, the email on an account is
 * whatever somebody typed. Nothing keyed on an address — joining, roster
 * linking, invitations, the exco bootstrap — may happen until the portal has
 * seen the address proven, and the impostor who typed it first has to be
 * shut out when it is.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createClient, type User as SupabaseUser } from '@supabase/supabase-js'
import { provisionUser } from '@/core/auth/provision'
import { proofFromEmailCode, proofFromProviderSignIn } from '@/core/auth/proof'
import { secureProvenAccount } from '@/core/auth/secure'
import { takeAttempt } from '@/core/auth/throttle'
import { addRosterMember, createOrganisation, dbAdmin, resetDatabase, type TestOrg } from './harness'

function supabaseUser(email: string, id: string = randomUUID()): SupabaseUser {
  return {
    id,
    email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: email.split('@')[0] },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    // Autoconfirm stamps this on every sign-up, which is exactly why it cannot
    // be read as "somebody proved they own this inbox".
    email_confirmed_at: new Date().toISOString(),
  } as SupabaseUser
}

const CODE = proofFromEmailCode()
let org: TestOrg
const saved = { ...process.env }

const membershipOf = (userId: string) => dbAdmin.organisationMembership.findFirst({ where: { userId } })
const adaRow = () => dbAdmin.member.findFirstOrThrow({ where: { studentId: '1000001' } })

describe('provisioning an account', () => {
  beforeEach(async () => {
    await resetDatabase()
    org = await createOrganisation()
    await addRosterMember(org, { fullName: 'Ada Lee', studentId: '1000001', email: 'ada@mymail.sutd.edu.sg' })
    process.env.BOOTSTRAP_EXCO_EMAILS = 'treasurer@mymail.sutd.edu.sg'
    delete process.env.ALLOWED_EMAIL_DOMAINS
  })

  afterEach(() => {
    process.env = { ...saved }
  })

  it('gives an unproven account a user row and nothing else', async () => {
    // Anybody can type ada@mymail.sutd.edu.sg into Supabase's sign-up API.
    const impostor = supabaseUser('ada@mymail.sutd.edu.sg')
    const result = await provisionUser(impostor, null)
    expect(result).toEqual({ proven: false, newlyProven: false })
    expect(await membershipOf(impostor.id)).toBeNull()
    expect((await adaRow()).userId).toBeNull()
  })

  it('lets a proven SUTD address join and links its roster row', async () => {
    const ada = supabaseUser('Ada@MyMail.sutd.edu.sg')
    const result = await provisionUser(ada, CODE)
    expect(result).toEqual({ proven: true, newlyProven: true })
    expect((await membershipOf(ada.id))?.role).toBe('MEMBER')
    expect((await adaRow()).userId).toBe(ada.id)

    // Signing in again proves nothing new, so nothing is reset twice.
    expect(await provisionUser(ada, CODE)).toEqual({ proven: true, newlyProven: false })
    expect(await provisionUser(ada, null)).toEqual({ proven: true, newlyProven: false })
  })

  it('does not let a proven address from anywhere else join by itself', async () => {
    const stranger = supabaseUser('someone@gmail.test')
    expect((await provisionUser(stranger, CODE)).proven).toBe(true)
    expect(await membershipOf(stranger.id)).toBeNull()
  })

  it('lets an invited address join, as a member whatever the invitation says, once', async () => {
    const invitation = await dbAdmin.invitation.create({
      data: {
        orgId: org.id,
        email: 'Coach@Gmail.test',
        role: 'EXCO',
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    })
    const coach = supabaseUser('coach@gmail.test')
    await provisionUser(coach, CODE)
    expect((await membershipOf(coach.id))?.role).toBe('MEMBER')
    expect((await dbAdmin.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe('ACCEPTED')

    // Spent: a second account on the same address gets nothing from it.
    const second = supabaseUser('coach@gmail.test')
    await dbAdmin.user.delete({ where: { id: coach.id } })
    await provisionUser(second, CODE)
    expect(await membershipOf(second.id)).toBeNull()
  })

  it('ignores an expired invitation', async () => {
    await dbAdmin.invitation.create({
      data: { orgId: org.id, email: 'late@gmail.test', token: randomUUID(), expiresAt: new Date(Date.now() - 1000) },
    })
    const late = supabaseUser('late@gmail.test')
    await provisionUser(late, CODE)
    expect(await membershipOf(late.id)).toBeNull()
  })

  it('does not make an unproven account the exco because it typed the bootstrap address', async () => {
    const impostor = supabaseUser('treasurer@mymail.sutd.edu.sg')
    await provisionUser(impostor, null)
    expect(await dbAdmin.organisationMembership.count({ where: { role: 'EXCO' } })).toBe(0)
  })

  it('bootstraps the first exco from a proven address, once', async () => {
    process.env.BOOTSTRAP_EXCO_EMAILS = 'treasurer@mymail.sutd.edu.sg,president@mymail.sutd.edu.sg'
    const first = supabaseUser('treasurer@mymail.sutd.edu.sg')
    await provisionUser(first, CODE)
    expect((await membershipOf(first.id))?.role).toBe('EXCO')

    // A second listed address, once an exco exists, gets nothing from the list.
    const second = supabaseUser('president@mymail.sutd.edu.sg')
    await provisionUser(second, CODE)
    expect((await membershipOf(second.id))?.role).toBe('MEMBER')
  })

  it('forgets the proof when the address on the account changes', async () => {
    const id = randomUUID()
    await provisionUser(supabaseUser('ada@mymail.sutd.edu.sg', id), CODE)
    const moved = await provisionUser(supabaseUser('someone.else@mymail.sutd.edu.sg', id), null)
    expect(moved.proven).toBe(false)
    expect((await dbAdmin.user.findUniqueOrThrow({ where: { id } })).emailProvenAt).toBeNull()
  })

  it('never re-enables an account the exco disabled', async () => {
    const user = supabaseUser('someone@mymail.sutd.edu.sg')
    await provisionUser(user, CODE)
    await dbAdmin.user.update({ where: { id: user.id }, data: { isActive: false } })
    await provisionUser(user, CODE)
    expect((await dbAdmin.user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(false)
  })

  it('never overwrites a name with whatever the sign-up metadata says', async () => {
    const user = supabaseUser('ada@mymail.sutd.edu.sg')
    await provisionUser(user, CODE)
    await dbAdmin.user.update({ where: { id: user.id }, data: { name: 'Ada Lee' } })
    await provisionUser({ ...user, user_metadata: { name: 'The Treasurer' } } as SupabaseUser, CODE)
    expect((await dbAdmin.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe('Ada Lee')
  })
})

describe('what a provider sign-in proves', () => {
  const now = new Date('2026-09-15T10:00:00Z')
  const at = (secondsAgo: number) => new Date(now.getTime() - secondsAgo * 1000).toISOString()

  function identity(provider: string, data: Record<string, unknown>, secondsAgo = 5) {
    return {
      id: randomUUID(),
      identity_id: randomUUID(),
      user_id: 'u',
      provider,
      identity_data: data,
      last_sign_in_at: at(secondsAgo),
      created_at: at(9999),
      updated_at: at(secondsAgo),
    }
  }
  const user = (email: string, identities: ReturnType<typeof identity>[]) => ({ email, identities })

  afterEach(() => {
    process.env = { ...saved }
  })

  it('trusts Google when Google says the address is verified', () => {
    const u = user('ada@mymail.sutd.edu.sg', [identity('google', { email: 'ada@mymail.sutd.edu.sg', email_verified: true })])
    expect(proofFromProviderSignIn(u, now)).toEqual({ method: 'google' })
  })

  it('does not trust an unverified Google address', () => {
    const u = user('ada@mymail.sutd.edu.sg', [identity('google', { email: 'ada@mymail.sutd.edu.sg', email_verified: false })])
    expect(proofFromProviderSignIn(u, now)).toBeNull()
  })

  it('does not trust Microsoft on its email claim alone', () => {
    // A personal Azure tenant lets its owner set any email on any account.
    const u = user('ada@mymail.sutd.edu.sg', [identity('azure', { email: 'ada@mymail.sutd.edu.sg', email_verified: true })])
    expect(proofFromProviderSignIn(u, now)).toBeNull()
  })

  it('trusts Microsoft with xms_edov, or from a named tenant', () => {
    const edov = user('ada@mymail.sutd.edu.sg', [
      identity('azure', { email: 'ada@mymail.sutd.edu.sg', custom_claims: { xms_edov: true } }),
    ])
    expect(proofFromProviderSignIn(edov, now)).toEqual({ method: 'azure' })

    process.env.MICROSOFT_TENANT_IDS = 'AAAA-SUTD'
    const tenant = user('ada@mymail.sutd.edu.sg', [
      identity('azure', { email: 'ada@mymail.sutd.edu.sg', custom_claims: { tid: 'aaaa-sutd' } }),
    ])
    expect(proofFromProviderSignIn(tenant, now)).toEqual({ method: 'azure' })

    const otherTenant = user('ada@mymail.sutd.edu.sg', [
      identity('azure', { email: 'ada@mymail.sutd.edu.sg', custom_claims: { tid: 'evil-tenant' } }),
    ])
    expect(proofFromProviderSignIn(otherTenant, now)).toBeNull()
  })

  it('judges the identity that just signed in, not a verified one linked earlier', () => {
    // An attacker signing in through an unverified Microsoft identity must
    // not borrow the proof of the victim's Google identity on the same account.
    const u = user('ada@mymail.sutd.edu.sg', [
      identity('google', { email: 'ada@mymail.sutd.edu.sg', email_verified: true }, 3600),
      identity('azure', { email: 'ada@mymail.sutd.edu.sg' }, 2),
    ])
    expect(proofFromProviderSignIn(u, now)).toBeNull()
  })

  it('does not trust a stale sign-in or an identity for another address', () => {
    const stale = user('ada@mymail.sutd.edu.sg', [
      identity('google', { email: 'ada@mymail.sutd.edu.sg', email_verified: true }, 3600),
    ])
    expect(proofFromProviderSignIn(stale, now)).toBeNull()

    const other = user('ada@mymail.sutd.edu.sg', [identity('google', { email: 'eve@gmail.test', email_verified: true })])
    expect(proofFromProviderSignIn(other, now)).toBeNull()
  })
})

describe('shutting out whoever signed up as the address first', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = () =>
    createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

  it("ends the impostor's password, session and refresh token, and keeps the owner's", async () => {
    const email = `victim.${Date.now()}@mymail.sutd.edu.sg`

    // Confirm email is off: the impostor's sign-up is an instant session.
    const impostor = await anon().auth.signUp({ email, password: 'impostor-password-1' })
    expect(impostor.error).toBeNull()
    const stolen = impostor.data.session!

    // Control: before the owner proves the address, the stolen session works.
    expect((await anon().auth.getUser(stolen.access_token)).error).toBeNull()

    // The owner signs in with an emailed code — fetched here through the
    // admin API, which is what the mail would have carried.
    const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const owner = anon()
    const signedIn = await owner.auth.verifyOtp({ email, token: link.data.properties!.email_otp, type: 'email' })
    expect(signedIn.error).toBeNull()

    await secureProvenAccount(owner)

    expect((await owner.auth.getUser()).error).toBeNull()
    expect((await anon().auth.getUser(stolen.access_token)).error).not.toBeNull()
    expect((await anon().auth.signInWithPassword({ email, password: 'impostor-password-1' })).error).not.toBeNull()
    expect((await anon().auth.refreshSession({ refresh_token: stolen.refresh_token })).error).not.toBeNull()
  })
})

describe('rate limits on codes', () => {
  it('allows the limit, refuses the next, and keeps addresses apart', async () => {
    const key = `test:${randomUUID()}`
    const limit = (k: string) => [{ key: k, max: 5, windowSeconds: 3600 }]
    for (let i = 0; i < 5; i++) expect(await takeAttempt(limit(key))).toBe(true)
    expect(await takeAttempt(limit(key))).toBe(false)
    expect(await takeAttempt(limit(`${key}:someone-else`))).toBe(true)
  })
})
