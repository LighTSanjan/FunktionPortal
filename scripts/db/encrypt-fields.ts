/**
 * Seal every sealed column that still holds plaintext, or a value under an
 * old key (core/crypto/fields.ts).
 *
 * Run once after FIELD_ENCRYPTION_KEYS is set everywhere the app runs, and
 * again after each key rotation. Reads and writes nothing else. Dry run by
 * default; prints counts, never the values.
 *
 * usage: npx tsx scripts/db/encrypt-fields.ts [--apply]
 */
import '../load-env'
import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { needsResealing, openField, sealField } from '../../src/core/crypto/fields'

const COLUMN = 'instructors.bank_account_no' as const
const SNAPSHOT = 'attendance_sheets.snapshot.bank_account_no' as const

async function main() {
  const apply = process.argv.includes('--apply')
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('DIRECT_URL is not set')
  // Fails before touching anything if the key is missing or malformed.
  sealField('check', COLUMN)

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  try {
    const instructors = await db.instructor.findMany({
      where: { bankAccountNo: { not: null } },
      select: { id: true, bankAccountNo: true },
    })
    const staleInstructors = instructors.filter((row) => row.bankAccountNo && needsResealing(row.bankAccountNo))

    const sheets = await db.attendanceSheet.findMany({
      where: { snapshot: { not: Prisma.DbNull } },
      select: { id: true, snapshot: true },
    })
    const staleSheets = sheets.filter((row) => {
      const bank = (row.snapshot as { instructor?: { bankAccountNo?: string } } | null)?.instructor?.bankAccountNo
      return Boolean(bank) && needsResealing(bank!)
    })

    console.log(`instructors: ${staleInstructors.length} of ${instructors.length} to seal`)
    console.log(`attendance sheet snapshots: ${staleSheets.length} of ${sheets.length} to seal`)
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.')
      return
    }

    await db.$transaction(async (tx) => {
      for (const row of staleInstructors) {
        const plain = openField(row.bankAccountNo!, COLUMN)
        await tx.instructor.update({ where: { id: row.id }, data: { bankAccountNo: sealField(plain, COLUMN) } })
      }
      for (const row of staleSheets) {
        const snapshot = row.snapshot as { instructor: { bankAccountNo: string } }
        const plain = openField(snapshot.instructor.bankAccountNo, SNAPSHOT)
        const sealed = { ...snapshot, instructor: { ...snapshot.instructor, bankAccountNo: sealField(plain, SNAPSHOT) } }
        await tx.attendanceSheet.update({ where: { id: row.id }, data: { snapshot: sealed as Prisma.InputJsonValue } })
      }
    })
    console.log('Sealed.')
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
