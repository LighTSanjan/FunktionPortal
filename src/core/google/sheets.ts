/**
 * Read-only Google Sheets access, as a service account.
 *
 * The Transaction Register and the Unofficial Funds Register live in Google
 * Sheets. Reading them from the API replaces the hand-transcribed copies in
 * prisma/data — which also takes the club's real figures out of the git
 * repository. Writing back, behind diff-and-approve, comes later and needs
 * the spreadsheets.readwrite scope; this asks for read-only on purpose.
 *
 * No Google SDK: a service account signs a JWT with its private key and
 * trades it for an hour-long access token. That is forty lines, and it keeps
 * a large dependency out of the server bundle.
 *
 * GOOGLE_SERVICE_ACCOUNT_JSON holds the key file downloaded from Google Cloud,
 * base64-encoded so it fits in one environment variable. It is a credential:
 * server-side only, never NEXT_PUBLIC_, never committed.
 */
import { createSign } from 'node:crypto'

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export interface ServiceAccount {
  client_email: string
  private_key: string
}

export class SheetsError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'SheetsError'
  }
}

export function serviceAccountFromEnv(raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON): ServiceAccount {
  if (!raw) throw new SheetsError('GOOGLE_SERVICE_ACCOUNT_JSON is not set')
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  const parsed = JSON.parse(text) as Partial<ServiceAccount>
  if (!parsed.client_email || !parsed.private_key) {
    throw new SheetsError('GOOGLE_SERVICE_ACCOUNT_JSON is not a service account key file')
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key }
}

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url')

export function signedAssertion(account: ServiceAccount, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  )
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(account.private_key)
  return `${header}.${claims}.${b64url(signature)}`
}

let cached: { token: string; expiresAt: number; email: string } | null = null

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cached && cached.email === account.client_email && cached.expiresAt > Date.now() + 60_000) return cached.token
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedAssertion(account),
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = (await response.json()) as { access_token?: string; expires_in?: number; error_description?: string }
  if (!response.ok || !body.access_token) {
    throw new SheetsError(`Google refused the service account: ${body.error_description ?? response.status}`, response.status)
  }
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000, email: account.client_email }
  return body.access_token
}

async function get<T>(account: ServiceAccount, path: string): Promise<T> {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    headers: { Authorization: `Bearer ${await accessToken(account)}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 403 || response.status === 404) {
    throw new SheetsError(
      `The service account ${account.client_email} cannot open that spreadsheet. Share it with that address as a Viewer.`,
      response.status
    )
  }
  if (!response.ok) throw new SheetsError(`Google Sheets answered ${response.status}`, response.status)
  return (await response.json()) as T
}

export interface SpreadsheetInfo {
  title: string
  tabs: Array<{ title: string; rows: number; columns: number }>
}

export async function spreadsheetInfo(account: ServiceAccount, spreadsheetId: string): Promise<SpreadsheetInfo> {
  const body = await get<{
    properties: { title: string }
    sheets: Array<{ properties: { title: string; gridProperties?: { rowCount?: number; columnCount?: number } } }>
  }>(account, `${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties`)
  return {
    title: body.properties.title,
    tabs: body.sheets.map((sheet) => ({
      title: sheet.properties.title,
      rows: sheet.properties.gridProperties?.rowCount ?? 0,
      columns: sheet.properties.gridProperties?.columnCount ?? 0,
    })),
  }
}

/** Cell values as displayed, row by row. `range` is A1 notation: "'FY2026'!A1:Z". */
export async function readRange(account: ServiceAccount, spreadsheetId: string, range: string): Promise<string[][]> {
  const body = await get<{ values?: string[][] }>(
    account,
    `${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`
  )
  return body.values ?? []
}
