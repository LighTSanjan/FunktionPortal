/**
 * Re-run an attendance import that is already stored, from its own saved parse.
 *
 * The importer's rules change — the sheets did not. When something the parser
 * used to discard becomes something it can record (self-practice dates were
 * the first case), the club should not have to find the original CSV again:
 * every import keeps the sheet it read, so re-applying is a database
 * operation rather than an archaeology one.
 *
 * Idempotent with respect to the sheet, not with respect to the portal: marks
 * on a re-applied date are deleted and rewritten from the spreadsheet, so any
 * correction made in the portal since the original import is overwritten. The
 * sheet is the authority for attendance, but check that assumption still holds
 * before running this on a term somebody has been editing.
 *
 * usage: reapply-import.ts <importId | --all> [--apply] [--org=slug]
 */
import '../load-env'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

import type { ParsedSheet } from '../../src/modules/attendance/parse'
import { applyParsedSheet, buildDatePlan, type DateOverride } from '../../src/modules/attendance/apply'

const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const OFF = '\x1b[0m'

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const orgSlug = args.find((a) => a.startsWith('--org='))?.slice(6) ?? 'funktion'
  const all = args.includes('--all')
  const target = all ? '--all' : args.find((a) => !a.startsWith('--'))

  if (!target) {
    console.error('usage: reapply-import.ts <importId | --all> [--apply] [--org=slug]')
    process.exit(1)
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  const org = await db.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true } })
  if (!org) throw new Error(`No organisation with slug "${orgSlug}"`)

  const imports = await db.attendanceImport.findMany({
    where: {
      orgId: org.id,
      status: 'APPLIED',
      ...(target === '--all' ? {} : { id: target }),
    },
    orderBy: { importedAt: 'asc' },
    select: {
      id: true,
      sourceTitle: true,
      parsed: true,
      dateInstructorMap: true,
      term: { select: { name: true } },
    },
  })
  if (imports.length === 0) throw new Error('No applied import matched.')

  const instructors = await db.instructor.findMany({
    where: { orgId: org.id },
    select: { id: true, fullName: true, shortCode: true },
  })

  for (const record of imports) {
    const parsed = record.parsed as unknown as ParsedSheet
    const overrides = (record.dateInstructorMap ?? {}) as Record<string, DateOverride>
    const plan = buildDatePlan(parsed, overrides, instructors)
    const selfPractice = [...plan.entries()].filter(([, e]) => e.instructorId === null)

    console.log(`${BOLD}${record.sourceTitle ?? record.id}${OFF} ${DIM}${record.term?.name ?? ''}${OFF}`)
    console.log(`  ${plan.size} classes, of which ${selfPractice.length} self-practice`)
    for (const [iso] of selfPractice) console.log(`  ${DIM}· ${iso} self-practice${OFF}`)

    if (!apply) continue

    const result = await db.$transaction(
      (tx) =>
        applyParsedSheet(tx, {
          orgId: org.id,
          actorId: null,
          importId: record.id,
          parsed,
          overrides,
        }),
      { maxWait: 20_000, timeout: 300_000 }
    )
    await db.attendanceImport.update({
      where: { id: record.id },
      data: {
        membersCreated: result.membersCreated,
        sessionsCreated: result.sessionsCreated,
        marksImported: result.marksImported,
      },
    })
    console.log(
      `  ${BOLD}applied${OFF} ${result.sessionsCreated} created, ${result.sessionsUpdated} updated, ` +
        `${result.marksImported} marks`
    )
    if (result.coachChangedDates.length > 0) {
      console.log(`  coach corrected on: ${result.coachChangedDates.join(', ')}`)
    }
    if (result.lockedDates.length > 0) {
      console.log(`  not written, month already raised: ${result.lockedDates.join(', ')}`)
    }
  }

  if (!apply) console.log(`\n${DIM}Dry run. Pass --apply to write it.${OFF}`)
  await db.$disconnect()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
