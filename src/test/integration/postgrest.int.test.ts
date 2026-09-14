/**
 * What a stranger can reach by going around the portal entirely.
 *
 * The browser holds the publishable key, and sign-up is open. So the attacker
 * this guards against is not hypothetical: create an account, take the access
 * token, and talk to PostgREST directly — no Next.js, no server actions, no
 * permission checks in TypeScript. Only Postgres grants and row-level
 * security stand between that token and the data.
 *
 * These run against the real GoTrue and PostgREST in the test stack, with a
 * genuinely signed-up account.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  addRosterMember,
  createOrganisation,
  createUser,
  dbAdmin,
  join,
  resetDatabase,
  type TestOrg,
} from './harness'

const API = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

let org: TestOrg
let token: string
let attackerId: string

async function signUp(email: string): Promise<{ id: string; token: string }> {
  const response = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse-battery-staple-9' }),
  })
  const body = await response.json()
  if (!body.access_token) throw new Error(`Sign-up failed: ${JSON.stringify(body)}`)
  return { id: body.user.id, token: body.access_token }
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  let rows: unknown = null
  try {
    rows = JSON.parse(text)
  } catch {
    rows = text
  }
  return { status: response.status, rows }
}

/**
 * Rows that came back, or none if the request was refused outright.
 *
 * A 404 is not a refusal. PostgREST answers "not in the schema cache" when it
 * has not loaded the tables at all, and read as "nothing came back" that made
 * every test here pass without the database ever being asked — which is how
 * this file first went green against a stack that could not have leaked
 * anything, because it could not see anything.
 */
function returned(result: { status: number; rows: unknown }): unknown[] {
  if (result.status === 404) {
    throw new Error(`PostgREST does not know this table — the test is not testing anything: ${JSON.stringify(result.rows)}`)
  }
  return result.status < 300 && Array.isArray(result.rows) ? result.rows : []
}

describe('a signed-up stranger talking to PostgREST directly', () => {
  beforeAll(async () => {
    await resetDatabase()
    // PostgREST caches the schema at startup. Tables created by a migration
    // after that are invisible to it until it is told to look again.
    await dbAdmin.$executeRawUnsafe(`NOTIFY pgrst, 'reload schema'`)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    org = await createOrganisation()

    const treasurer = await createUser('Tess Treasurer', 'tess@uni.test')
    await join(treasurer, org, 'EXCO', 'TREASURER')
    const ada = await createUser('Ada Lee', 'ada@uni.test')
    await join(ada, org, 'MEMBER')
    await addRosterMember(org, { fullName: 'Ada Lee', studentId: '1000001', email: 'ada@uni.test', userId: ada.id })
    await addRosterMember(org, { fullName: 'Ben Ong', studentId: '1000002', email: 'ben@uni.test' })
    await dbAdmin.instructor.create({
      data: {
        orgId: org.id,
        fullName: 'Kai Smith',
        shortCode: 'KS',
        danceStyle: 'Popping',
        bankName: 'DBS',
        bankAccountNo: '123-45678-9',
      },
    })

    // Something in every table the loop below probes. An empty table returns
    // nothing whether or not it is protected, and proves nothing.
    const term = await dbAdmin.term.create({
      data: {
        orgId: org.id,
        name: 'Trimester 1',
        startDate: new Date('2026-09-01T00:00:00Z'),
        endDate: new Date('2026-12-31T00:00:00Z'),
        fullFeeCents: 7000,
        halfFeeCents: 3500,
        paynowQrPath: 'paynow-qr/secret/key.png',
      },
    })
    const adaRow = await dbAdmin.member.findFirstOrThrow({ where: { studentId: '1000001' } })
    await dbAdmin.feePayment.create({
      data: {
        orgId: org.id,
        termId: term.id,
        memberId: adaRow.id,
        tier: 'FULL',
        amountCents: 7000,
        status: 'DECLARED',
        paymentReference: 'PN-SECRET',
        paymentProofPath: 'fee-proof/secret.png',
        declaredByUserId: ada.id,
        declaredAt: new Date(),
      },
    })
    await dbAdmin.$executeRaw`
      INSERT INTO audit_logs (id, org_id, actor_id, action, target_type, target_id, created_at)
      VALUES (gen_random_uuid()::text, ${org.id}, ${treasurer.id}, 'claim.paid', 'Invoice', 'x', now())
    `

    // Sign up for real, then provision exactly as the portal does on first
    // sign-in: an ordinary member of the only club there is.
    const attacker = await signUp(`stranger-${Date.now()}@evil.test`)
    token = attacker.token
    attackerId = attacker.id
    await dbAdmin.user.create({ data: { id: attackerId, email: `stranger@evil.test`, name: 'Stranger' } })
    await dbAdmin.organisationMembership.create({
      data: { userId: attackerId, orgId: org.id, role: 'MEMBER', isActive: true },
    })
  })

  it('is really talking to the database as itself (the control for everything below)', async () => {
    // Without this, a stack where the token never reaches Postgres would pass
    // every test in this file. app_user_id() is what every policy keys on.
    //
    // Required to succeed, not merely allowed to: the first versions of this
    // file passed against a stack whose tokens carried an empty role, where
    // every request was refused before any policy was consulted.
    const result = await rest('rpc/app_user_id', { method: 'POST', body: '{}' })
    expect(result.status).toBe(200)
    expect(result.rows).toBe(attackerId)
  })

  it('cannot list the club’s accounts — names and emails', async () => {
    const rows = returned(await rest('users?select=*'))
    expect(rows.filter((row) => (row as { id: string }).id !== attackerId)).toEqual([])
  })

  it('cannot list who holds which office', async () => {
    const rows = returned(await rest('organisation_memberships?select=*'))
    expect(rows.filter((row) => (row as { user_id: string }).user_id !== attackerId)).toEqual([])
  })

  it('cannot read the roster', async () => {
    expect(returned(await rest('members?select=*'))).toEqual([])
  })

  it('cannot read coaches’ bank details', async () => {
    expect(returned(await rest('instructors?select=bank_account_no'))).toEqual([])
  })

  for (const table of [
    'fee_payments',
    'invoices',
    'invoice_lines',
    'audit_logs',
    'reference_counters',
    'reference_numbers',
    'attendance_imports',
    'session_attendance',
    'organisation_settings',
    'fund_accounts',
    'terms',
    'income_deposits',
  ]) {
    it(`cannot read ${table}`, async () => {
      expect(returned(await rest(`${table}?select=*`))).toEqual([])
    })
  }

  it('cannot promote itself to exco', async () => {
    const attempt = await rest(`organisation_memberships?user_id=eq.${attackerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'EXCO' }),
    })
    expect(attempt.status).not.toBe(404)
    const membership = await dbAdmin.organisationMembership.findFirstOrThrow({ where: { userId: attackerId } })
    expect(membership.role).toBe('MEMBER')
  })

  it('cannot claim a roster row by writing to it', async () => {
    const attempt = await rest('members?student_id=eq.1000002', {
      method: 'PATCH',
      body: JSON.stringify({ user_id: attackerId }),
    })
    expect(attempt.status).not.toBe(404)
    const ben = await dbAdmin.member.findFirstOrThrow({ where: { studentId: '1000002' } })
    expect(ben.userId).toBeNull()
  })

  it('cannot forge an audit log entry through the RPC', async () => {
    const before = await dbAdmin.auditLog.count()
    await rest('rpc/write_audit_log', {
      method: 'POST',
      body: JSON.stringify({
        p_org_id: org.id,
        p_action: 'claim.paid',
        p_target_type: 'Invoice',
        p_target_id: 'forged',
        p_before: null,
        p_after: null,
        p_metadata: null,
      }),
    })
    expect(await dbAdmin.auditLog.count()).toBe(before)
  })

  it('reaches nothing at all without signing in', async () => {
    const anonymous = await fetch(`${API}/rest/v1/users?select=*`, { headers: { apikey: KEY } })
    const body = anonymous.ok ? await anonymous.json() : []
    expect(Array.isArray(body) ? body : []).toEqual([])
  })
})
