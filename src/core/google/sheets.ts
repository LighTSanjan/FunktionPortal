/**
 * Read-only Google Sheets access, as a service account, through Google's own
 * client (@googleapis/sheets).
 *
 * The Transaction Register and the Unofficial Funds Register live in Google
 * Sheets. Reading them from the API replaces the hand-transcribed copies in
 * prisma/data — which also takes the club's real figures out of the git
 * repository. Writing back, behind diff-and-approve, comes later and needs the
 * read-write scope; this asks for read-only on purpose.
 *
 * GOOGLE_SERVICE_ACCOUNT_JSON holds the key file downloaded from Google Cloud,
 * raw or base64-encoded. It is a credential: server-side only, never
 * NEXT_PUBLIC_, never committed.
 */
import { auth, sheets, type sheets_v4 } from '@googleapis/sheets'

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

export class SheetsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SheetsError'
  }
}

export interface ServiceAccount {
  client_email: string
  private_key: string
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

export function sheetsClient(account: ServiceAccount = serviceAccountFromEnv()): sheets_v4.Sheets {
  return sheets({
    version: 'v4',
    auth: new auth.GoogleAuth({ credentials: account, scopes: SCOPES }),
  })
}

/** Google's 403/404 for a sheet not shared with the account, said usefully. */
export function explainSheetsError(error: unknown, account: ServiceAccount): string {
  const status = (error as { code?: number; status?: number })?.code ?? (error as { status?: number })?.status
  if (status === 403 || status === 404) {
    return `${account.client_email} cannot open that spreadsheet. Share it with that address as a Viewer.`
  }
  return error instanceof Error ? error.message : String(error)
}
