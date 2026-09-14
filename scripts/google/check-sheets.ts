/**
 * Can the portal read the club's Google Sheets? Prints what it can see —
 * titles, tab names, sizes and each tab's header row — and never the rows.
 *
 * usage: npm run google:check -- <spreadsheet id or URL> [...]
 *   or set GOOGLE_SHEETS_TO_CHECK="id1,id2"
 */
import '../load-env'
import { explainSheetsError, serviceAccountFromEnv, sheetsClient } from '../../src/core/google/sheets'

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
  const client = sheetsClient(account)
  console.log(`Service account: ${account.client_email}\n`)

  let failures = 0
  for (const spreadsheetId of targets) {
    try {
      const { data } = await client.spreadsheets.get({ spreadsheetId, fields: 'properties.title,sheets.properties' })
      console.log(`✓ ${data.properties?.title}`)
      for (const sheet of data.sheets ?? []) {
        const title = sheet.properties?.title ?? ''
        const grid = sheet.properties?.gridProperties
        const header = await client.spreadsheets.values.get({
          spreadsheetId,
          range: `'${title.replace(/'/g, "''")}'!1:1`,
        })
        console.log(`    ${title} — ${grid?.rowCount ?? 0} rows × ${grid?.columnCount ?? 0} columns`)
        console.log(`      header: ${(header.data.values?.[0] ?? []).filter(Boolean).join(' | ') || '(empty)'}`)
      }
    } catch (error) {
      failures++
      console.log(`✗ ${spreadsheetId}: ${explainSheetsError(error, account)}`)
    }
  }
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
