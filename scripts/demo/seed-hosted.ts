/**
 * Fill the hosted demo's database with a made-up club.
 *
 *   npm run demo:seed        (reads .env.demo)
 *
 * It empties every table first, so it is also how the demo is reset. It
 * refuses to run unless DEMO_MODE is on and the database holds no club but
 * the demo's: pointed at the real project by mistake, it stops before
 * touching anything.
 *
 * Accounts are not made here. The demo makes them itself the first time
 * somebody clicks a person on its sign-in page (core/auth/demo.ts).
 */
import { randomUUID } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'
import { dbAdmin } from '../../src/core/db/admin'
import { BUCKET } from '../../src/core/storage'
import { addRosterMember, createOrganisation, createUser, join, resetDatabase } from '../../src/test/integration/harness'

const DAY = 86_400_000
// The same as core/auth/demo.ts, which cannot be imported outside Next.
const DEMO_ORG_SLUG = 'demo'
const DEMO_DOMAIN = 'demo.funktion.test'
const DEMO_MEMBER_EMAIL = `ada@${DEMO_DOMAIN}`

const ROSTER: Array<{ fullName: string; label?: string; email?: string }> = [
  { fullName: 'Ada Lee', email: DEMO_MEMBER_EMAIL },
  { fullName: 'Ben Ong' },
  { fullName: 'Chloe Ng' },
  { fullName: 'Darius Koh' },
  { fullName: 'Elena Wong', label: '1/2 term' },
  { fullName: 'Farhan Ismail' },
  { fullName: 'Grace Lim' },
  { fullName: 'Haruto Sato', label: 'Confirmed; Exchange' },
  { fullName: 'Isabel Tan' },
  { fullName: 'Jun Wei Chua' },
  { fullName: 'Kavya Menon' },
  { fullName: 'Lucas Teo', label: '1/2 term' },
  { fullName: 'Maya Goh' },
  { fullName: 'Nathan Yeo' },
  { fullName: 'Olivia Chan' },
  { fullName: 'Omar Aziz' },
]

async function refuseUnlessDemo() {
  if (process.env.DEMO_MODE !== 'true') {
    throw new Error('DEMO_MODE is not "true". Run this with the demo environment: npm run demo:seed')
  }
  const orgs = await dbAdmin.organisation.findMany({ select: { slug: true } })
  const strangers = orgs.filter((org) => org.slug !== DEMO_ORG_SLUG)
  if (strangers.length > 0) {
    throw new Error(
      `This database holds ${strangers.map((org) => `"${org.slug}"`).join(', ')}, which is not the demo. Nothing was changed.`
    )
  }
}

async function main() {
  await refuseUnlessDemo()
  await resetDatabase()

  const storage = process.env.SUPABASE_SECRET_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY).storage
    : null
  if (storage) {
    const { data } = await storage.listBuckets()
    if (!data?.some((bucket) => bucket.id === BUCKET)) {
      const { error } = await storage.createBucket(BUCKET, { public: false })
      if (error && !/already exists/i.test(error.message)) throw error
    }
  }
  async function put(key: string, bytes: Uint8Array): Promise<string | null> {
    if (!storage) return null
    const { error } = await storage.from(BUCKET).upload(key, bytes, { contentType: 'image/png', upsert: true })
    if (error) throw error
    return key
  }

  const org = await createOrganisation(DEMO_ORG_SLUG, 'FUNKtion (demo)')
  await dbAdmin.organisationSettings.update({
    where: { orgId: org.id },
    data: {
      billToName: 'Singapore University of Technology and Design',
      billToAddressLines: ['8 Somapah Road', 'Singapore 487372'],
      institutionShortName: 'SUTD',
      brandBandColors: ['F05820', 'F8A838', '58C0E8', '304890'],
    },
  })

  const coaches = []
  for (const [i, coach] of [
    { fullName: 'Kai Smith', shortCode: 'KS', danceStyle: 'Popping' },
    { fullName: 'Mina Tan', shortCode: 'MT', danceStyle: 'Locking' },
  ].entries()) {
    const row = await dbAdmin.instructor.create({
      data: {
        orgId: org.id,
        ...coach,
        email: `${coach.shortCode.toLowerCase()}@coach.demo.funktion.test`,
        addressLine1: `${i + 1} Rhythm Road`,
        postalCode: `00000${i + 2}`,
        bankName: i === 0 ? 'DBS' : 'OCBC',
        bankAccountNo: i === 0 ? '000-00000-0' : '111-11111-1',
      },
    })
    await dbAdmin.instructorRate.create({
      data: { orgId: org.id, instructorId: row.id, hourlyRateCents: 9000, effectiveFrom: new Date('2020-01-01T00:00:00Z') },
    })
    coaches.push(row)
  }

  const members = []
  for (const [i, person] of ROSTER.entries()) {
    members.push(
      await addRosterMember(org, {
        fullName: person.fullName,
        studentId: String(1009100 + i),
        email: person.email,
        rosterLabel: person.label ?? 'Confirmed',
      })
    )
  }

  // Classes every week for the last two months: Tuesdays popping, Thursdays
  // locking. Most people come most weeks; nobody comes to all of them.
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  for (let back = 60; back >= 1; back--) {
    const day = new Date(today - back * DAY)
    const weekday = day.getUTCDay()
    if (weekday !== 2 && weekday !== 4) continue
    const session = await dbAdmin.classSession.create({
      data: {
        orgId: org.id,
        instructorId: coaches[weekday === 2 ? 0 : 1].id,
        heldOn: day,
        durationMinutes: 90,
      },
    })
    await dbAdmin.sessionAttendance.createMany({
      data: members
        .filter((_, i) => (i * 7 + back) % 5 !== 0)
        .map((member) => ({ orgId: org.id, sessionId: session.id, memberId: member.id, present: true })),
    })
  }

  const term = await dbAdmin.term.create({
    data: {
      orgId: org.id,
      name: 'Term 1',
      startDate: new Date(today - 45 * DAY),
      endDate: new Date(today + 60 * DAY),
      fullFeeCents: 7000,
      halfFeeCents: 3500,
      collectionOpensAt: new Date(today - 7 * DAY),
      finalCollectionAt: new Date(today + 14 * DAY),
    },
  })
  const qr = await put(`paynow-qr/${term.id}/${randomUUID()}.png`, fakeQr())
  if (qr) {
    await dbAdmin.term.update({ where: { id: term.id }, data: { paynowQrPath: qr, paynowQrUploadedAt: new Date() } })
  }
  await dbAdmin.membershipForm.create({
    data: {
      orgId: org.id,
      termId: term.id,
      state: 'OPEN',
      openedAt: new Date(today - 7 * DAY),
      intro: 'Join for Term 1 and pay the fee here. Classes are Tuesdays (popping) and Thursdays (locking), 7.30pm.',
    },
  })

  // A collection a week in: some paid and confirmed, some waiting for the
  // exco to look, one sent back. Ada has not paid, so she can try it. Paying
  // goes through the form, so everybody who paid has an account and a
  // response.
  const fee = (label?: string) =>
    label === '1/2 term'
      ? { tier: 'HALF' as const, amountCents: 3500 }
      : label?.includes('Exchange')
        ? { tier: 'EXCHANGE_DISCOUNT' as const, amountCents: 3500 }
        : { tier: 'FULL' as const, amountCents: 7000 }
  const plan = ['CONFIRMED', 'CONFIRMED', 'DECLARED', 'CONFIRMED', 'DECLARED', 'CONFIRMED', 'REJECTED', 'DECLARED', 'CONFIRMED', 'DECLARED'] as const
  for (const [i, status] of plan.entries()) {
    const member = members[i + 1]
    const declaredAt = new Date(today - (6 - (i % 6)) * DAY + 13 * 3_600_000)
    const user = await respondent(member.fullName)
    await dbAdmin.member.update({ where: { id: member.id }, data: { userId: user.id } })
    await dbAdmin.membershipResponse.create({
      data: {
        orgId: org.id,
        termId: term.id,
        userId: user.id,
        memberId: member.id,
        email: user.email,
        fullName: member.fullName,
        studentId: member.studentId,
        submittedAt: declaredAt,
        updatedAt: declaredAt,
      },
    })
    const proof = await put(`fee-proof/${term.id}/${member.id}/${randomUUID()}.png`, fakeScreenshot(i))
    await dbAdmin.feePayment.create({
      data: {
        orgId: org.id,
        termId: term.id,
        memberId: member.id,
        ...fee(ROSTER[i + 1].label),
        status,
        source: 'DECLARATION',
        declaredAt,
        declaredByUserId: user.id,
        paymentReference: `DEMO${String(4821 + i * 37).padStart(6, '0')}`,
        paymentProofPath: proof,
        confirmedAt: status === 'CONFIRMED' ? new Date(declaredAt.getTime() + DAY) : null,
        rejectedReason: status === 'REJECTED' ? 'The screenshot shows $35, and you are on the full-term rate.' : null,
      },
    })
  }

  // Somebody new who filled in the form and paid before the exco put them on
  // the roster: their payment waits on the response until somebody does.
  const heldAt = new Date(today - 2 * DAY + 12 * 3_600_000)
  const stranger = await respondent('Priscilla Ho')
  await dbAdmin.membershipResponse.create({
    data: {
      orgId: org.id,
      termId: term.id,
      userId: stranger.id,
      email: stranger.email,
      fullName: stranger.fullName,
      studentId: '1009150',
      submittedAt: heldAt,
      updatedAt: heldAt,
      heldReference: 'DEMO005321',
      heldProofPath: await put(`fee-proof/${term.id}/unmatched-${stranger.id}/${randomUUID()}.png`, fakeScreenshot(10)),
      heldAmountCents: 7000,
      heldAt,
    },
  })

  /** A made-up member's portal account, as if they had signed in once. */
  async function respondent(fullName: string) {
    const user = await createUser(fullName, `${fullName.toLowerCase().replace(/\W+/g, '.')}@${DEMO_DOMAIN}`)
    await join(user, org, 'MEMBER')
    return { ...user, fullName }
  }

  await dbAdmin.$disconnect()
  console.log(`
  Demo club ready: ${members.length} members, ${coaches.length} coaches, ${plan.length} payments.
  ${storage ? '' : 'SUPABASE_SECRET_KEY is empty, so there are no screenshots or PayNow QR. Set it and run again.\n'}`)
}

/** A PNG of the given size, drawn by `paint(x, y)` → grey level. */
function png(width: number, height: number, paint: (x: number, y: number) => number): Uint8Array {
  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width)
    for (let x = 0; x < width; x++) row[1 + x] = paint(x, y)
    rows.push(row)
  }
  const chunk = (type: string, body: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(body.length)
    const tagged = Buffer.concat([Buffer.from(type), body])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(tagged))
    return Buffer.concat([length, tagged, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 0 // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function crc32(bytes: Buffer): number {
  let crc = ~0
  for (const byte of bytes) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

/** Looks like a QR from across the room. It is not one, so nobody can pay into it. */
function fakeQr(): Uint8Array {
  const cells = 29
  const size = 8
  const finder = (cx: number, cy: number) => {
    const d = Math.max(Math.abs(cx - 3), Math.abs(cy - 3))
    return d === 0 || d === 1 || d === 3
  }
  return png((cells + 4) * size, (cells + 4) * size, (x, y) => {
    const cx = Math.floor(x / size) - 2
    const cy = Math.floor(y / size) - 2
    if (cx < 0 || cy < 0 || cx >= cells || cy >= cells) return 255
    for (const [ox, oy] of [[0, 0], [cells - 7, 0], [0, cells - 7]]) {
      if (cx >= ox && cx < ox + 7 && cy >= oy && cy < oy + 7) return finder(cx - ox, cy - oy) ? 0 : 255
    }
    return (cx * 31 + cy * 17 + cx * cy) % 3 === 0 ? 0 : 255
  })
}

/** A plain grey card, standing in for somebody's PayNow confirmation. */
function fakeScreenshot(seed: number): Uint8Array {
  return png(300, 540, (x, y) => {
    if (y < 70) return 60
    if (y > 150 && y < 175 && x > 40 && x < 260) return 120 + seed * 4
    if (y > 200 && y < 215 && x > 40 && x < 200) return 170
    if (y > 230 && y < 245 && x > 40 && x < 230) return 170
    return 245
  })
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error)
  await dbAdmin.$disconnect()
  process.exit(1)
})
