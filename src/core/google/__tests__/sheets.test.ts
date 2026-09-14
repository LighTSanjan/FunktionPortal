import { describe, expect, it } from 'vitest'
import { explainSheetsError, serviceAccountFromEnv, SheetsError } from '../sheets'

const account = { client_email: 'portal@club.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\n…' }

describe('Google service account', () => {
  it('reads the key file raw or base64-encoded, and refuses anything else', () => {
    const json = JSON.stringify(account)
    expect(serviceAccountFromEnv(json).client_email).toBe(account.client_email)
    expect(serviceAccountFromEnv(Buffer.from(json).toString('base64')).client_email).toBe(account.client_email)
    expect(() => serviceAccountFromEnv(JSON.stringify({ hello: 1 }))).toThrow(SheetsError)
    expect(() => serviceAccountFromEnv('')).toThrow(SheetsError)
  })

  it('says to share the sheet when Google says it cannot be opened', () => {
    expect(explainSheetsError({ code: 403 }, account)).toContain('portal@club.iam.gserviceaccount.com cannot open that spreadsheet. Share it')
  })
})
