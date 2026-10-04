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
import '../scripts/load-env'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

import { OSL_REGISTERS } from './data/register-osl'
import { UNOFFICIAL_ROWS } from './data/register-unofficial'

const FINANCIAL_YEAR = 2026

/**
 * The financial year a date falls in. FY2026 runs 1 April 2026 to 31 March
 * 2027, so anything in January to March belongs to the year before it.
 */
function financialYearOf(iso: string): number {
  const [year, month] = iso.split('-').map(Number)
  return month >= 4 ? year : year - 1
}
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

  // The two institution fields are filled on re-seed as well as on create.
  // An empty `update` is right for settings a club has since edited; these are
  // new columns nobody has had the chance to edit, and leaving them null on an
  // existing database would silently drop "SUTD" off every invoice.
  await db.organisationSettings.upsert({
    where: { orgId: org.id },
    update: {
      institutionShortName: 'SUTD',
      submissionEmail: 'studentlife@sutd.edu.sg',
    },
    create: {
      orgId: org.id,
      projectCode: PROJECT_CODE,
      cluster: 'ARTS',
      tagline: "FUNKtion - SUTD's Ultimate Popping & Locking Dance Club!",
      brandBandColors: ['F05820', 'F8A838', '58C0E8', '304890'],
      billToName: 'Singapore University of Technology and Design',
      billToAddressLines: ['No. 8 Somapah Road, #01-301', 'Building 3, Level 1', 'Singapore 487372'],
      institutionShortName: 'SUTD',
      // The address the completed month is emailed to. The portal fills the
      // mail client's To: field with it and sends nothing itself.
      submissionEmail: 'studentlife@sutd.edu.sg',
    },
  })

  // WBS elements for the Arts cluster, project 097 (Guidelines §4.5). Only
  // PC and PN are ever used; the club has never recorded a donation.
  //
  // Read off the FY2026 Transaction Register. Each fund is stated as three
  // facts rather than one balance, because a balance alone cannot be checked
  // and cannot be re-derived after the portal starts recording its own
  // expenses: what the fund opened at, what has been paid into it since, and
  // what has been drawn out of it. Remaining falls out of those.
  //
  // SEED. Granted $2,600.00, of which $2,295.00 had gone on coach fees before
  // any of this was written, leaving $305.00. The register's own Seed Fund
  // balance cell disagrees — it reads $1,520.00 — because it is computed as
  // income minus the *without-GST* column, and the four June and July coach
  // rows have their incl-GST cell filled and their without-GST cell blank.
  // Those four ($270 + $405 + $405 + $135 = $1,215.00) are therefore never
  // subtracted from the figure the sheet displays. $305.00 is the real one.
  //
  // INCOME. Opened at $2,620.44 carried forward from Income 2025, took
  // $1,669.72 in subscriptions since, and $675.00 has gone out — $3,615.16,
  // which is what the register shows. The carried-forward row is flagged in
  // the register itself as an unverified placeholder from OSL finance.
  //
  // UNOFFICIAL. The $550.19 the exco hold outside the OSL accounts. Real
  // money the club can spend, but no invoice may be drawn on it: there is no
  // WBS element to quote and nothing for OSL to reimburse.
  const funds = [
    {
      source: 'SEED' as const,
      wbsElement: `PC-00${PROJECT_CODE}-A3006-A3006-000`,
      rollsOver: false,
      openingBalanceCents: 260_000,
      priorIncomeCents: 0,
      priorSpendCents: 229_500,
      // Seed Fund does not roll over; the cut-off is around end of February
      // (§2.3). Anything unspent by then is returned.
      submissionDeadline: new Date(Date.UTC(2027, 1, 28)),
    },
    {
      source: 'INCOME' as const,
      wbsElement: `PN-00${PROJECT_CODE}-A3006-A3006-000`,
      wbsElementRevenue: `PN-00${PROJECT_CODE}-A3006-A3006-R00`,
      rollsOver: true,
      openingBalanceCents: 262_044,
      priorIncomeCents: 166_972,
      priorSpendCents: 67_500,
    },
    {
      source: 'UNOFFICIAL' as const,
      // No WBS element exists for money OSL does not hold. The column is not
      // nullable, so it says so rather than carrying a plausible-looking code
      // somebody might one day quote on a form.
      wbsElement: 'NOT AN OSL FUND',
      rollsOver: true,
      // Every figure here comes from the unofficial register's own rows, not
      // from its summary box. The sheet publishes only the closing $550.19;
      // the opening balance is that taken back out through the year's own
      // movement, and prisma/data/__tests__ pins the arithmetic.
      openingBalanceCents: 67_714,
      priorIncomeCents: 91_645,
      priorSpendCents: 104_340,
    },
  ]
  for (const fund of funds) {
    // Unlike the counters below, these are safe to re-apply: every field is a
    // fact copied from the register or the guidelines, so the seed is the
    // authority and a drifted row should be corrected back.
    await db.fundAccount.upsert({
      where: { orgId_financialYear_source: { orgId: org.id, financialYear: FINANCIAL_YEAR, source: fund.source } },
      update: fund,
      create: { orgId: org.id, financialYear: FINANCIAL_YEAR, ...fund },
    })
  }

  // IV opens at 15. 0001-0002 went to the previous exco; the FY2026 register
  // records 0003-0004 against March, 0005-0006 against April and 0007-0008
  // against May. The register left June and July unnumbered; the Office of
  // Finance has since confirmed they took 0009-0012 (Neo Renyi June, Lim Kah
  // Sing June, Neo Renyi July, Lim Kah Sing July). 0013 and 0014 are the two
  // August invoices, first issued as 0010 and 0011 and renumbered when
  // Finance pointed out the clash. Opening any lower reissues numbers already
  // sitting with Finance.
  //
  // The upsert never moves an existing counter, so this only decides where a
  // fresh database starts. A live one keeps whatever it has allocated since.
  const counters = [
    { series: 'IV' as const, nextSequence: 15 },
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

  // The three SUTD trimesters that fall inside FY2026 (Apr 2026 - Mar 2027),
  // taken from the published academic calendar. Week 1 always opens on a
  // Monday and Week 14 always closes on a Saturday, which is the check that
  // resolves the yearless date headers on the Drive attendance sheets.
  //
  // Fee tiers are $70 full and $35 half. Collection dates are deliberately
  // left null: the exco sets them, and every §2.2 deadline counts from there
  // rather than from the term boundary.
  const terms = [
    // Closed before the portal existed. Its dates are taken from the term's
    // own attendance sheet — first class 5 January, last 16 April — because
    // that sheet is the only record of it the club still has, and the import
    // needs a term to resolve the sheet's yearless date headers against.
    { name: 'Trimester 1 2026', startDate: '2026-01-05', endDate: '2026-05-01' },
    // Closed. The summer collection (INC-26-097-0001, $1,669.72) was banked
    // against this one on 27 Jun 2026.
    { name: 'Trimester 2 2026', startDate: '2026-05-18', endDate: '2026-08-22' },
    { name: 'Trimester 3 2026', startDate: '2026-09-14', endDate: '2026-12-19' },
    // Straddles the financial year end (31 Mar 2027) and the March handover.
    { name: 'Trimester 1 2027', startDate: '2027-01-25', endDate: '2027-05-01' },
  ]
  for (const term of terms) {
    await db.term.upsert({
      where: { orgId_name: { orgId: org.id, name: term.name } },
      update: {},
      create: {
        orgId: org.id,
        name: term.name,
        startDate: new Date(`${term.startDate}T00:00:00Z`),
        endDate: new Date(`${term.endDate}T00:00:00Z`),
        fullFeeCents: 7_000,
        halfFeeCents: 3_500,
      },
    })
  }

  console.log(`Seeded ${org.name} (${org.slug}) for FY${FINANCIAL_YEAR}`)
  const registerRows = await seedRegister(db, org.id)

  console.log(`  funds: ${funds.map((f) => `${f.source}@$${(f.openingBalanceCents / 100).toFixed(2)}`).join('  ')}`)
  console.log(`  register: ${registerRows} rows imported from the club's transaction registers`)
  console.log(`  terms: ${terms.map((t) => t.name).join(', ')}`)
  console.log(`  ${counters.map((c) => `${c.series}@${c.nextSequence}`).join('  ')}`)
  console.log(`  instructors: ${instructors.map((i) => i.shortCode).join(', ')} — bank details still to be entered in the portal`)

  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })

/**
 * The club's transaction registers, as ledger rows.
 *
 * Three years of the OSL register and nine of the exco's unofficial one, all
 * transcribed in prisma/data and reconciled against their own published
 * control totals by the tests beside them. This only maps them onto
 * RegisterEntry — the model that already existed for exactly this, keyed on
 * (sourceType, sourceId) so re-running the seed updates rows rather than
 * appending a second copy of the club's history.
 */
async function seedRegister(db: PrismaClient, orgId: string): Promise<number> {
  const date = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null)
  let count = 0

  for (const register of OSL_REGISTERS) {
    const sections = [
      ['SEED_FUND', register.seedFund],
      ['INCOME', register.income],
      ['DONATION', register.donation],
    ] as const

    for (const [section, rows] of sections) {
      for (const [index, row] of rows.entries()) {
        // Positional, because several rows have no reference number, two of
        // them are opening balances that never had one, and IV24-097-0010
        // appears twice under one number because a single invoice was split
        // across both funds. Stable as long as a section keeps its order,
        // which is how the sheet is read anyway.
        const sourceId = `osl-fy${register.financialYear}-${section}-${String(index).padStart(3, '0')}`
        const data = {
          orgId,
          financialYear: register.financialYear,
          section,
          sourceType: 'RegisterImport',
          sourceId,
          referenceNumber: row.reference,
          // The row's note stays in prisma/data as documentation and does not
          // get folded into the description. Appending it turned four ledger
          // rows into "Popping Instructor Fee July — No reference number
          // recorded; without-GST cell blank in the register", which pushed the
          // thing the row is actually about off the end of the line. The
          // reference column already shows a dash for exactly these rows.
          description: row.description,
          documentDate: date(row.documentDate),
          payeeName: row.payeeName,
          expenseWithoutGstCents: row.withoutGstCents,
          expenseWithGstCents: row.withGstCents,
          incomeCents: row.incomeCents,
          submittedToOslAt: date(row.submittedToOsl),
          bankedInAt: date(row.bankedIn),
          sheetRowNumber: index + 1,
        }
        await db.registerEntry.upsert({
          where: { orgId_sourceType_sourceId: { orgId, sourceType: 'RegisterImport', sourceId } },
          update: data,
          create: data,
        })
        count++
      }
    }
  }

  for (const [index, row] of UNOFFICIAL_ROWS.entries()) {
    const sourceId = `unofficial-${String(index).padStart(3, '0')}`
    const data = {
      orgId,
      // Dated rows get their real financial year; undated ones fall back to
      // the section they were filed under, which is a calendar year. The
      // sheet simply does not record enough to do better, and inventing a
      // date to make the arithmetic tidier would be worse than saying so.
      financialYear: row.on ? financialYearOf(row.on) : row.year,
      section: 'UNOFFICIAL' as const,
      sourceType: 'RegisterImport',
      sourceId,
      referenceNumber: null,
      description: row.description,
      documentDate: date(row.on),
      payeeName: row.withdrawnBy,
      expenseWithoutGstCents: null,
      // The unofficial register has no GST column — none of it goes through
      // OSL, so none of it is claimed against.
      expenseWithGstCents: row.debitCents > 0 ? row.debitCents : null,
      incomeCents: row.creditCents > 0 ? row.creditCents : null,
      submittedToOslAt: null,
      bankedInAt: null,
      sheetRowNumber: index + 1,
    }
    await db.registerEntry.upsert({
      where: { orgId_sourceType_sourceId: { orgId, sourceType: 'RegisterImport', sourceId } },
      update: data,
      create: data,
    })
    count++
  }

  return count
}
