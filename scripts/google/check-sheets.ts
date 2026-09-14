/**
 * Can the portal read the club's Google Sheets? Prints what it can see —
 * titles, tab names, sizes and each tab's header row — and never the rows.
 *
 * usage: npx tsx scripts/google/check-sheets.ts <spreadsheet id or URL> [...]
 *   or set GOOGLE_SHEETS_TO_CHECK="id1,id2"
 */
import '../load-env'
import { readRange, serviceAccountFromEnv, spreadsheetInfo } from '../../src/core/google/sheets'

function idFrom(value: string): string {
  return /\/spreadsheets\/d\/([A-Za-z0-9_-]+)/.exec(value)?.[1] ?? value
}

async function main() {
  const targets = [...process.argv.slice(2), ...(process.env.GOOGLE_SHEETS_TO_CHECK ?? '').split(',')]
    .map((value) => value.trim())
    .filter(Boolean)
    .map(idFrom)
  if (targets.length === 0) throw new Error('Name at least one spreadsheet ID or URL.')

  const account = serviceAccountFromEnv()
  console.log(`Service account: ${account.client_email}\n`)

  let failures = 0
  for (const id of targets) {
    try {
      const info = await spreadsheetInfo(account, id)
      console.log(`✓ ${info.title}`)
      for (const tab of info.tabs) {
        const [header = []] = await readRange(account, id, `'${tab.title.replace(/'/g, "''")}'!1:1`)
        console.log(`    ${tab.title} — ${tab.rows} rows × ${tab.columns} columns`)
        console.log(`      header: ${header.filter(Boolean).join(' | ') || '(empty)'}`)
      }
    } catch (error) {
      failures++
      console.log(`✗ ${id}: ${error instanceof Error ? error.message : error}`)
    }
  }
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
