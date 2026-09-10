/** Import a back-catalogue attendance CSV; dry-run unless `--apply` is passed. */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { PrismaClient, type Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

import { parseCsv } from '../../src/modules/attendance/csv'
import { parseAttendanceSheet } from '../../src/modules/attendance/parse'
import { applyParsedSheet } from '../../src/modules/attendance/apply'

const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const YELLOW = '\x1b[33m'
const OFF = '\x1b[0m'

async function main() {
  const [file, termName, ...flags] = process.argv.slice(2)
  const apply = flags.includes('--apply')
  const orgSlug = flags.find((f) => f.startsWith('--org='))?.slice(6) ?? 'funktion'

  if (!file || !termName) {
    console.error('usage: import-attendance.ts <sheet.csv> "<term name>" [--apply] [--org=slug]')
    process.exit(1)
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  const org = await db.organisation.findUnique({ where: { slug: orgSlug }, select: { id: true, name: true } })
  if (!org) throw new Error(`No organisation with slug "${orgSlug}"`)

  const term = await db.term.findFirst({
    where: { orgId: org.id, name: termName },
    select: { id: true, name: true, startDate: true, endDate: true },
  })
  if (!term) {
    const known = await db.term.findMany({ where: { orgId: org.id }, select: { name: true } })
    throw new Error(
      `No term called "${termName}". Known: ${known.map((t) => t.name).join(', ') || 'none'}`
    )
  }

  const parsed = parseAttendanceSheet(parseCsv(readFileSync(file, 'utf8')), {
    termStart: term.startDate,
    termEnd: term.endDate,
  })

  console.log(`${BOLD}${term.name}${OFF} ${DIM}${file}${OFF}`)
  console.log(`  ${parsed.dates.length} class dates, ${parsed.dates[0].iso} to ${parsed.dates.at(-1)!.iso}`)
  console.log(`  ${parsed.members.length} roster rows, ${parsed.members.reduce((t, m) => t + m.presentOn.length, 0)} marks`)
  console.log(`  coaches: ${parsed.instructorHours.map((i) => `${i.label} ${i.hours}h`).join(', ')}`)

  for (const iso of parsed.unattributedDates) {
    console.log(`  ${YELLOW}!${OFF} ${iso}: attended, but no coach recorded — left out`)
  }
  for (const conflict of parsed.subtotalConflicts) {
    console.log(
      `  ${YELLOW}!${OFF} ${conflict.iso} ${conflict.label} sheet says ${conflict.sheetSays}, marks say ${conflict.marksSay}`
    )
  }
  for (const warning of parsed.warnings) console.log(`  ${DIM}· ${warning}${OFF}`)

  if (!apply) {
    console.log(`\n${DIM}Dry run. Pass --apply to write it.${OFF}`)
    await db.$disconnect()
    return
  }

  // Keep the whole import atomic; large sheets need a generous timeout.
  const result = await db.$transaction(
    async (tx) => {
      const record = await tx.attendanceImport.create({
        data: {
          orgId: org.id,
          termId: term.id,
          spreadsheetId: '',
          sourceTitle: file.split('/').pop() ?? file,
          status: 'APPLIED',
          parsed: parsed as never,
          importedByUserId: await firstExco(tx, org.id),
          appliedAt: new Date(),
        },
        select: { id: true },
      })

      const applied = await applyParsedSheet(tx, {
        orgId: org.id,
        actorId: null,
        importId: record.id,
        parsed,
        overrides: {},
      })

      await tx.attendanceImport.update({
        where: { id: record.id },
        data: {
          membersCreated: applied.membersCreated,
          sessionsCreated: applied.sessionsCreated,
          marksImported: applied.marksImported,
        },
      })

      return applied
    },
    { maxWait: 20_000, timeout: 300_000 }
  )

  console.log(
    `\n${BOLD}Imported${OFF} ${result.sessionsCreated} classes created, ${result.sessionsUpdated} updated, ` +
      `${result.membersCreated} members created, ${result.membersUpdated} updated, ${result.marksImported} marks written.`
  )
  if (result.skippedDates.length > 0) {
    console.log(`${DIM}Left out: ${result.skippedDates.join(', ')}${OFF}`)
  }

  await db.$disconnect()
}

async function firstExco(tx: Prisma.TransactionClient, orgId: string): Promise<string> {
  const membership = await tx.organisationMembership.findFirst({
    where: { orgId, role: 'EXCO' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  })
  if (!membership) {
    throw new Error(
      'No exco member exists yet, and an import has to be attributable to one. Sign in to the portal once first.'
    )
  }
  return membership.userId
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
