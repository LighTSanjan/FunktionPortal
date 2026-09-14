/**
 * Building a club from nothing, and driving it the way people do.
 *
 * Fixtures go straight into the database only for what the portal has no
 * screen for — an organisation, its fund accounts, the people in it. Every
 * piece of actual work after that goes through the same server actions the
 * pages call, as a signed-in person, so what these tests exercise is what a
 * treasurer on a Tuesday exercises.
 */
import { randomUUID } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'
import type { ExcoOffice, OrgRole } from '@prisma/client'
import { dbAdmin } from '@/core/db/admin'
import { BUCKET } from '@/core/storage'
import { runAs, signInAs } from './actor'

export { runAs }

export { dbAdmin }

/** Every application table, emptied. The migrations table is kept. */
export async function resetDatabase(): Promise<void> {
  const tables = await dbAdmin.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'schema_migrations')
  `
  if (tables.length === 0) return
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
  await dbAdmin.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
}

/** The private bucket, which a fresh storage service does not have. */
export async function ensureBucket(): Promise<void> {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)
  const { data } = await client.storage.listBuckets()
  if (data?.some((bucket) => bucket.id === BUCKET)) return
  const { error } = await client.storage.createBucket(BUCKET, { public: false })
  if (error && !/already exists/i.test(error.message)) throw error
}

export interface TestOrg {
  id: string
  slug: string
  name: string
}

export async function createOrganisation(slug = 'test-club', name = 'Test Club'): Promise<TestOrg> {
  const org = await dbAdmin.organisation.create({ data: { slug, name } })
  await dbAdmin.organisationSettings.create({
    data: {
      orgId: org.id,
      projectCode: '097',
      cluster: 'ARTS',
      billToName: 'A University',
      billToAddressLines: ['1 Campus Road', 'Singapore 000001'],
      institutionShortName: 'UNI',
      submissionEmail: 'finance@uni.test',
    },
  })

  // Fund accounts and counters for this financial year and the next, so a
  // test that crosses April does not fail for want of a row nobody would
  // ever forget to create in real life.
  const now = new Date()
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  for (const financialYear of [fy - 1, fy, fy + 1]) {
    await dbAdmin.fundAccount.createMany({
      data: [
        {
          orgId: org.id,
          financialYear,
          source: 'SEED',
          wbsElement: 'PC-00097-A3006-A3006-000',
          openingBalanceCents: 260_000,
          rollsOver: false,
        },
        {
          orgId: org.id,
          financialYear,
          source: 'INCOME',
          wbsElement: 'PN-00097-A3006-A3006-000',
          wbsElementRevenue: 'PN-00097-A3006-A3006-R00',
          openingBalanceCents: 100_000,
        },
      ],
    })
    await dbAdmin.referenceCounter.createMany({
      data: (['IV', 'SCF', 'PO', 'INC'] as const).map((series) => ({
        orgId: org.id,
        series,
        financialYear,
        nextSequence: 1,
      })),
    })
  }

  return { id: org.id, slug: org.slug, name: org.name }
}

export interface TestUser {
  id: string
  email: string
  name: string
}

export async function createUser(name: string, email?: string): Promise<TestUser> {
  const id = randomUUID()
  const address = email ?? `${name.toLowerCase().replace(/\W+/g, '.')}@test.local`
  await dbAdmin.user.create({ data: { id, email: address, name, emailProvenAt: new Date(), emailProvenVia: 'email_code' } })
  return { id, email: address, name }
}

export async function join(
  user: TestUser,
  org: TestOrg,
  role: OrgRole,
  office: ExcoOffice | null = null
): Promise<void> {
  await dbAdmin.organisationMembership.create({
    data: { userId: user.id, orgId: org.id, role, office, isActive: true },
  })
}

export async function addRosterMember(
  org: TestOrg,
  fields: { fullName: string; studentId: string; email?: string; rosterLabel?: string; userId?: string }
) {
  return dbAdmin.member.create({
    data: {
      orgId: org.id,
      fullName: fields.fullName,
      studentId: fields.studentId,
      email: fields.email ?? null,
      rosterLabel: fields.rosterLabel ?? 'Confirmed',
      userId: fields.userId ?? null,
    },
  })
}

/** Act as this person until told otherwise. */
export function as(user: TestUser | null): void {
  signInAs(user)
}

/** A form, as the browser would post it. */
export function form(fields: Record<string, string | string[] | File | undefined>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (Array.isArray(value)) for (const each of value) data.append(key, each)
    else data.append(key, value)
  }
  return data
}

/**
 * How a server action ended, including the ways Next ends one by throwing:
 * notFound(), redirect(), and a permission refusal.
 */
export async function outcome<T>(
  run: () => Promise<T>
): Promise<
  | { kind: 'returned'; value: T }
  | { kind: 'not-found' }
  | { kind: 'redirect'; to: string }
  | { kind: 'denied'; message: string }
  | { kind: 'threw'; error: unknown }
> {
  try {
    return { kind: 'returned', value: await run() }
  } catch (error) {
    const digest = (error as { digest?: string })?.digest ?? ''
    if (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;404') || digest === 'NEXT_NOT_FOUND') {
      return { kind: 'not-found' }
    }
    if (digest.startsWith('NEXT_REDIRECT')) {
      return { kind: 'redirect', to: digest.split(';')[2] ?? '' }
    }
    if ((error as Error)?.name === 'PermissionDeniedError') {
      return { kind: 'denied', message: (error as Error).message }
    }
    return { kind: 'threw', error }
  }
}

/** Unwrap an action's { error } state, failing the test with the message. */
export async function ok<T extends { error: string | null }>(run: () => Promise<T>): Promise<T> {
  const result = await run()
  if (result.error) throw new Error(`Action refused: ${result.error}`)
  return result
}

/** A real, minimal PNG of the given size, so image validation sees a real file. */
export function png(width: number, height: number): Uint8Array {
  const row = Buffer.alloc(1 + width * 4, 0xff)
  row[0] = 0
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  const chunk = (type: string, body: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(body.length)
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(typed))
    return Buffer.concat([length, typed, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ])
  )
}

function crc32(buffer: Buffer): number {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return ~crc >>> 0
}

export function pngFile(width: number, height: number, name = 'image.png'): File {
  return new File([Buffer.from(png(width, height))], name, { type: 'image/png' })
}
