/**
 * Opening state for the club's first financial year in the portal.
 *
 * Idempotent — safe to run repeatedly. Everything here is either a fact from
 * the Finance Guidelines or a value read off the club's existing documents.
 *
 * Deliberately absent: instructor addresses and bank account numbers. They
 * are needed on every invoice, but they are also personal data belonging to
 * someone who did not agree to have it in a git repository. They get entered
 * once through the portal, and until they are, assertInvoiceable() refuses to
 * generate that coach's invoice — which is the behaviour we want anyway.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const FINANCIAL_YEAR = 2026
const PROJECT_CODE = '097'

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  const org = await db.organisation.upsert({
    where: { slug: 'funktion' },
    update: {},
    create: { name: 'FUNKtion', slug: 'funktion' },
  })

  await db.organisationSettings.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      projectCode: PROJECT_CODE,
      cluster: 'ARTS',
      tagline: "FUNKtion - SUTD's Ultimate Popping & Locking Dance Club!",
      brandBandColors: ['F05820', 'F8A838', '58C0E8', '304890'],
      billToName: 'Singapore University of Technology and Design',
      billToAddressLines: ['No. 8 Somapah Road, #01-301', 'Building 3, Level 1', 'Singapore 487372'],
    },
  })

  // WBS elements for the Arts cluster, project 097 (Guidelines §4.5). Only
  // PC and PN are ever used; the club has never recorded a donation.
  const funds = [
    { source: 'SEED' as const, wbsElement: `PC-00${PROJECT_CODE}-A3006-A3006-000`, rollsOver: false },
    { source: 'INCOME' as const, wbsElement: `PN-00${PROJECT_CODE}-A3006-A3006-000`, wbsElementRevenue: `PN-00${PROJECT_CODE}-A3006-A3006-R00`, rollsOver: true },
  ]
  for (const fund of funds) {
    await db.fundAccount.upsert({
      where: { orgId_financialYear_source: { orgId: org.id, financialYear: FINANCIAL_YEAR, source: fund.source } },
      update: {},
      create: { orgId: org.id, financialYear: FINANCIAL_YEAR, ...fund },
    })
  }

  // IV opens at 10: 0001-0002 went to the previous exco and 0003-0009 covered
  // the June and July coach payments. August ran no classes. Starting at 1
  // would reissue numbers already sitting with the Office of Finance.
  const counters = [
    { series: 'IV' as const, nextSequence: 10 },
    { series: 'SCF' as const, nextSequence: 1 },
    { series: 'PO' as const, nextSequence: 1 },
    { series: 'INC' as const, nextSequence: 1 },
  ]
  for (const counter of counters) {
    await db.referenceCounter.upsert({
      where: { orgId_series_financialYear: { orgId: org.id, series: counter.series, financialYear: FINANCIAL_YEAR } },
      update: {},
      create: { orgId: org.id, financialYear: FINANCIAL_YEAR, ...counter },
    })
  }

  // Rate is set by the OSL 'Contract For Service', not by the club (§3.3).
  // It lives in its own table because it changes at term and year boundaries,
  // and a past invoice must keep the rate it was raised at.
  const instructors = [
    { shortCode: 'JIN', fullName: 'Neo Renyi (Jin Neo)', danceStyle: 'Locking' },
    { shortCode: 'KS', fullName: 'Lim Kah Sing', danceStyle: 'Popping' },
  ]
  for (const instructor of instructors) {
    const existing = await db.instructor.findFirst({ where: { orgId: org.id, shortCode: instructor.shortCode } })
    const row = existing ?? await db.instructor.create({
      data: { orgId: org.id, engagement: 'CONTRACTED', ...instructor },
    })

    // Effective from the start of FY2026. Raise the rate by adding a row with
    // a later effectiveFrom — never by editing this one, which would reprice
    // every invoice already submitted.
    await db.instructorRate.upsert({
      where: { instructorId_effectiveFrom: { instructorId: row.id, effectiveFrom: new Date(Date.UTC(2026, 3, 1)) } },
      update: {},
      create: {
        orgId: org.id,
        instructorId: row.id,
        hourlyRateCents: 9000,
        effectiveFrom: new Date(Date.UTC(2026, 3, 1)),
        note: 'OSL Contract For Service, FY2026',
      },
    })
  }

  console.log(`Seeded ${org.name} (${org.slug}) for FY${FINANCIAL_YEAR}`)
  console.log(`  ${counters.map((c) => `${c.series}@${c.nextSequence}`).join('  ')}`)
  console.log(`  instructors: ${instructors.map((i) => i.shortCode).join(', ')} — bank details still to be entered in the portal`)

  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
