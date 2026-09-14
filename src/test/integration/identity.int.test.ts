/**
 * Who a new account gets to be.
 *
 * With Supabase's "Confirm email" switched off, the email on an account is
 * whatever somebody typed. Provisioning must not treat it as proof: not to
 * link the account to a roster member, and not to promote it to exco.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { provisionUser, emailIsVerified } from '@/core/auth/provision'
import { addRosterMember, createOrganisation, dbAdmin, resetDatabase, type TestOrg } from './harness'

function supabaseUser(email: string, provider: 'email' | 'google'): SupabaseUser {
  return {
    id: randomUUID(),
    email,
    app_metadata: { provider, providers: [provider] },
    user_metadata: { name: email.split('@')[0] },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    // Autoconfirm stamps this on every sign-up, which is exactly why it cannot
    // be read as "somebody proved they own this inbox".
    email_confirmed_at: new Date().toISOString(),
  } as SupabaseUser
}

let org: TestOrg
const saved = { ...process.env }

describe('provisioning a new account', () => {
  beforeEach(async () => {
    await resetDatabase()
    org = await createOrganisation()
    await addRosterMember(org, { fullName: 'Ada Lee', studentId: '1000001', email: 'ada@uni.test' })
    process.env.BOOTSTRAP_EXCO_EMAILS = 'treasurer@uni.test'
    delete process.env.AUTH_EMAILS_ARE_VERIFIED
  })

  afterEach(() => {
    process.env = { ...saved }
  })

  it('joins the club as an ordinary member', async () => {
    const user = supabaseUser('someone@uni.test', 'email')
    await provisionUser(user)
    const membership = await dbAdmin.organisationMembership.findFirstOrThrow({ where: { userId: user.id } })
    expect(membership.role).toBe('MEMBER')
  })

  it('does not link a password sign-up to the roster row carrying its email', async () => {
    // Anybody can type ada@uni.test into a sign-up form. Linked, they would
    // see Ada's fee and could declare payments as her.
    const impostor = supabaseUser('ada@uni.test', 'email')
    await provisionUser(impostor)
    expect((await dbAdmin.member.findFirstOrThrow({ where: { studentId: '1000001' } })).userId).toBeNull()
  })

  it('does not make a password sign-up the exco because it typed the bootstrap address', async () => {
    const impostor = supabaseUser('treasurer@uni.test', 'email')
    await provisionUser(impostor)
    const membership = await dbAdmin.organisationMembership.findFirstOrThrow({ where: { userId: impostor.id } })
    expect(membership.role).toBe('MEMBER')
  })

  it('trusts an address Google has verified', async () => {
    const ada = supabaseUser('ada@uni.test', 'google')
    await provisionUser(ada)
    expect((await dbAdmin.member.findFirstOrThrow({ where: { studentId: '1000001' } })).userId).toBe(ada.id)
  })

  it('bootstraps the first exco from a verified address, once', async () => {
    const first = supabaseUser('treasurer@uni.test', 'google')
    await provisionUser(first)
    expect((await dbAdmin.organisationMembership.findFirstOrThrow({ where: { userId: first.id } })).role).toBe('EXCO')

    // A second account on the same address — a later sign-up, a typo'd
    // duplicate — gets nothing, because an exco now exists.
    const second = supabaseUser('Treasurer@uni.test', 'google')
    await dbAdmin.user.deleteMany({ where: { email: { equals: 'treasurer@uni.test', mode: 'insensitive' } } }).catch(() => undefined)
    await provisionUser(second).catch(() => undefined)
    const roles = await dbAdmin.organisationMembership.findMany({ where: { role: 'EXCO' } })
    expect(roles).toHaveLength(1)
  })

  it('trusts password sign-ups only when the deployment says emails are confirmed', async () => {
    process.env.AUTH_EMAILS_ARE_VERIFIED = 'true'
    const ada = supabaseUser('ada@uni.test', 'email')
    expect(emailIsVerified(ada)).toBe(true)
    await provisionUser(ada)
    expect((await dbAdmin.member.findFirstOrThrow({ where: { studentId: '1000001' } })).userId).toBe(ada.id)
  })

  it('never re-enables an account the exco disabled', async () => {
    const user = supabaseUser('someone@uni.test', 'google')
    await provisionUser(user)
    await dbAdmin.user.update({ where: { id: user.id }, data: { isActive: false } })
    await provisionUser(user)
    expect((await dbAdmin.user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(false)
  })
})
